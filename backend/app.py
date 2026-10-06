"""Password + email OTP authentication. No demo login or client-side auth bypass."""
import hashlib
import hmac
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from contextlib import contextmanager
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlparse

import click
from flask import Flask, abort, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
EMAIL = re.compile(r"^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$")


def send_code(config, email, code):
    message = EmailMessage()
    message["From"] = config["SMTP_FROM"]
    message["To"] = email
    message["Subject"] = "O2C Finance Cloud verification code"
    message.set_content(f"Your verification code is {code}. It expires in 5 minutes. "
                        "If you did not request it, ignore this email. Never share this code.")
    if config["SMTP_MODE"] == "ssl":
        connection = smtplib.SMTP_SSL(config["SMTP_HOST"], config["SMTP_PORT"],
                                     timeout=10, context=ssl.create_default_context())
    else:
        connection = smtplib.SMTP(config["SMTP_HOST"], config["SMTP_PORT"], timeout=10)
    with connection as server:
        if config["SMTP_MODE"] == "starttls":
            server.starttls(context=ssl.create_default_context())
        if config["SMTP_USERNAME"]:
            server.login(config["SMTP_USERNAME"], config["SMTP_PASSWORD"])
        server.send_message(message)


def create_app(overrides=None):
    app = Flask(__name__, static_folder=None)
    production = os.environ.get("O2C_ENV", "production") != "development"
    app.config.update(
        PRODUCTION=production,
        SECRET_KEY=os.environ.get("O2C_SECRET_KEY", ""),
        DATABASE=os.environ.get("O2C_DATABASE", str(ROOT / "local-data/auth.sqlite3")),
        APP_ORIGIN=os.environ.get("O2C_APP_ORIGIN", "http://127.0.0.1:5174"),
        SMTP_HOST=os.environ.get("SMTP_HOST", ""),
        SMTP_PORT=int(os.environ.get("SMTP_PORT", "587")),
        SMTP_MODE=os.environ.get("SMTP_MODE", "starttls"),
        SMTP_FROM=os.environ.get("SMTP_FROM", ""),
        SMTP_USERNAME=os.environ.get("SMTP_USERNAME", ""),
        SMTP_PASSWORD=os.environ.get("SMTP_PASSWORD", ""),
        MAX_CONTENT_LENGTH=4096,
        MAIL_SENDER=send_code,
        CLOCK=time.time,
    )
    app.config.update(overrides or {})
    if len(app.config["SECRET_KEY"]) < 32:
        raise RuntimeError("Set O2C_SECRET_KEY to a random secret of at least 32 characters.")
    origin = urlparse(app.config["APP_ORIGIN"])
    if (origin.scheme not in ("http", "https") or not origin.hostname or origin.username
            or origin.password or origin.path or origin.query or origin.fragment):
        raise RuntimeError("O2C_APP_ORIGIN must be an exact origin without a path.")
    if app.config["PRODUCTION"] and origin.scheme != "https":
        raise RuntimeError("Production requires an HTTPS O2C_APP_ORIGIN.")
    if not app.config["SMTP_HOST"] or not EMAIL.fullmatch(app.config["SMTP_FROM"]):
        raise RuntimeError("Configure SMTP_HOST and a valid SMTP_FROM.")
    if app.config["SMTP_MODE"] not in ("ssl", "starttls", "plain"):
        raise RuntimeError("SMTP_MODE must be ssl, starttls, or plain.")
    if app.config["SMTP_MODE"] == "plain" and (
        app.config["PRODUCTION"] or app.config["SMTP_HOST"] not in ("127.0.0.1", "localhost")
    ):
        raise RuntimeError("Plain SMTP is permitted only on loopback in development.")
    if app.config["SMTP_USERNAME"] and not app.config["SMTP_PASSWORD"]:
        raise RuntimeError("SMTP_PASSWORD is required with SMTP_USERNAME.")
    app.config["TRUSTED_HOSTS"] = [origin.hostname, "127.0.0.1", "localhost"] if not app.config["PRODUCTION"] else [origin.hostname]
    cookie = "__Host-o2c_session" if app.config["PRODUCTION"] else "o2c_session"
    db_path = Path(app.config["DATABASE"])
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # Create sensitive local state privately; this also covers WAL/SHM sidecars.
    os.umask(0o077)

    def connect():
        db = sqlite3.connect(db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    with connect() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, email TEXT,
          authenticated INTEGER NOT NULL DEFAULT 0, expires REAL NOT NULL,
          FOREIGN KEY(email) REFERENCES users(email));
        CREATE TABLE IF NOT EXISTS challenges (
          email TEXT PRIMARY KEY, session_hash TEXT NOT NULL, code_hash TEXT NOT NULL,
          expires REAL NOT NULL, sent REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(email) REFERENCES users(email));
        CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, start REAL NOT NULL, count INTEGER NOT NULL);
        """)
    os.chmod(db_path, 0o600)
    dummy_hash = generate_password_hash(secrets.token_urlsafe(32), method="scrypt")

    def now():
        return app.config["CLOCK"]()

    def digest(value):
        return hmac.new(app.config["SECRET_KEY"].encode(), value.encode(), hashlib.sha256).hexdigest()

    @contextmanager
    def transaction():
        db = connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def limited(db, key, maximum, window=900):
        key = digest(key)
        row = db.execute("SELECT * FROM limits WHERE key=?", (key,)).fetchone()
        if not row or row["start"] + window <= now():
            db.execute("INSERT OR REPLACE INTO limits VALUES (?, ?, 1)", (key, now()))
            return False
        if row["count"] >= maximum:
            return True
        db.execute("UPDATE limits SET count=count+1 WHERE key=?", (key,))
        return False

    def new_session(db, email=None, authenticated=False):
        token = secrets.token_urlsafe(32)
        row = dict(token_hash=digest(token), csrf=secrets.token_urlsafe(32), email=email,
                   authenticated=int(authenticated), expires=now() + (28800 if authenticated else 900))
        db.execute("INSERT INTO sessions VALUES (:token_hash, :csrf, :email, :authenticated, :expires)", row)
        g.new_cookie = token
        g.auth = row
        return row

    def revoke(db):
        if g.auth:
            db.execute("DELETE FROM challenges WHERE session_hash=?", (g.auth["token_hash"],))
            db.execute("DELETE FROM sessions WHERE token_hash=?", (g.auth["token_hash"],))

    def payload():
        if not request.is_json:
            abort(415)
        body = request.get_json()
        if not isinstance(body, dict):
            abort(400)
        return body

    def failure(message, status=400):
        return jsonify(error=message), status

    @app.before_request
    def protect():
        if not request.path.startswith("/api/"):
            return None
        token = request.cookies.get(cookie, "")
        with connect() as db:
            g.auth = db.execute("SELECT * FROM sessions WHERE token_hash=? AND expires>?",
                                (digest(token), now())).fetchone() if token and len(token) <= 100 else None
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("Origin") != app.config["APP_ORIGIN"]:
                return failure("Request origin rejected.", 403)
            csrf = request.headers.get("X-CSRF-Token", "")
            if not g.auth or not hmac.compare_digest(g.auth["csrf"], csrf):
                return failure("Session expired. Refresh and try again.", 403)
        return None

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Production Vite bundles use external scripts; existing UI needs style attributes.
        if app.config["PRODUCTION"]:
            response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        if hasattr(g, "new_cookie"):
            response.set_cookie(cookie, g.new_cookie, secure=app.config["PRODUCTION"],
                                httponly=True, samesite="Strict", path="/", max_age=28800)
        return response

    @app.errorhandler(400)
    @app.errorhandler(413)
    @app.errorhandler(415)
    def bad_request(error):
        return failure("Invalid request.", error.code)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.get("/api/auth/session")
    def session_status():
        with transaction() as db:
            db.execute("DELETE FROM sessions WHERE expires<=?", (now(),))
            db.execute("DELETE FROM challenges WHERE expires<=?", (now(),))
            db.execute("DELETE FROM limits WHERE start<=?", (now() - 900,))
            if not g.auth:
                if limited(db, "session:" + (request.remote_addr or "unknown"), 120):
                    return failure("Too many requests. Try again later.", 429)
                new_session(db)
            challenge = db.execute("SELECT sent, expires FROM challenges WHERE session_hash=?",
                                   (g.auth["token_hash"],)).fetchone()
        return jsonify(authenticated=bool(g.auth["authenticated"]), csrf=g.auth["csrf"],
                       email=g.auth["email"], pending=bool(challenge),
                       retryAfter=max(0, int(challenge["sent"] + 30 - now()) + 1) if challenge else 0)

    def issue(db, row):
        code = f"{secrets.randbelow(1000000):06d}"
        db.execute("INSERT OR REPLACE INTO challenges VALUES (?, ?, ?, ?, ?, 0)",
                   (row["email"], row["token_hash"], digest(row["token_hash"] + ":" + code), now()+300, now()))
        app.config["MAIL_SENDER"](app.config, row["email"], code)

    @app.post("/api/auth/login")
    def login():
        body = payload()
        email, password = body.get("email"), body.get("password")
        if not isinstance(email, str) or not isinstance(password, str) or len(email)>254 or len(password)>1024:
            return failure("Invalid email or password.", 401)
        email = email.strip().lower()
        with transaction() as db:
            ip_limited = limited(db, "login-ip:"+(request.remote_addr or "unknown"), 30)
            account_limited = limited(db, "login-email:"+email, 10)
            if ip_limited or account_limited:
                return failure("Too many attempts. Try again in 15 minutes.", 429)
            user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            valid = check_password_hash(user["password_hash"] if user else dummy_hash, password)
            if not user or not valid:
                return failure("Invalid email or password.", 401)
            existing = db.execute("SELECT sent FROM challenges WHERE email=?", (email,)).fetchone()
            if existing and existing["sent"] + 30 > now():
                return failure("Please wait before requesting another code.", 429)
            revoke(db)
            row = new_session(db, email)
            try:
                issue(db, row)
            except (OSError, smtplib.SMTPException):
                # Commit throttles but never authenticate or leave an undelivered challenge.
                db.execute("DELETE FROM challenges WHERE session_hash=?", (row["token_hash"],))
                return failure("Email delivery is unavailable. Please try again later.", 503)
        return jsonify(csrf=row["csrf"], email=email, pending=True, retryAfter=30), 202

    @app.post("/api/auth/resend")
    def resend():
        with transaction() as db:
            # Read current state within the transaction, including session revocation.
            row = db.execute("SELECT * FROM sessions WHERE token_hash=? AND expires>?",
                             (g.auth["token_hash"], now())).fetchone()
            if not row or not row["email"] or row["authenticated"]:
                return failure("Sign in again to request a code.", 401)
            ip_limited = limited(db, "resend-ip:"+(request.remote_addr or "unknown"), 30)
            account_limited = limited(db, "resend-email:"+row["email"], 5)
            if ip_limited or account_limited:
                return failure("Too many requests. Try again in 15 minutes.", 429)
            challenge = db.execute("SELECT * FROM challenges WHERE email=? AND session_hash=?",
                                   (row["email"], row["token_hash"])).fetchone()
            if not challenge:
                return failure("Code expired or attempts exhausted. Sign in again.", 401)
            if challenge["sent"] + 30 > now():
                return failure("Please wait before requesting another code.", 429)
            try:
                issue(db, row)
            except (OSError, smtplib.SMTPException):
                db.execute("DELETE FROM challenges WHERE session_hash=?", (row["token_hash"],))
                return failure("Email delivery is unavailable. Sign in again later.", 503)
        return jsonify(retryAfter=30)

    @app.post("/api/auth/verify")
    def verify():
        code = payload().get("code")
        if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
            return failure("Enter a six-digit code.")
        with transaction() as db:
            if limited(db, "verify-ip:"+(request.remote_addr or "unknown"), 60):
                return failure("Too many attempts. Try again later.", 429)
            row = db.execute("SELECT * FROM sessions WHERE token_hash=? AND expires>?",
                             (g.auth["token_hash"], now())).fetchone()
            if not row or row["authenticated"]:
                return failure("Sign in again.", 401)
            challenge = db.execute("SELECT * FROM challenges WHERE session_hash=?", (row["token_hash"],)).fetchone()
            if not challenge or challenge["expires"]<=now() or challenge["attempts"]>=5:
                return failure("Code expired or attempts exhausted. Sign in again.", 401)
            if not hmac.compare_digest(challenge["code_hash"], digest(row["token_hash"]+":"+code)):
                db.execute("UPDATE challenges SET attempts=attempts+1 WHERE email=?", (row["email"],))
                if challenge["attempts"]>=4:
                    db.execute("DELETE FROM challenges WHERE email=?", (row["email"],))
                return failure("Invalid verification code.", 401)
            revoke(db)
            fresh = new_session(db, row["email"], True)
        return jsonify(authenticated=True, csrf=fresh["csrf"], email=fresh["email"])

    @app.post("/api/auth/logout")
    def logout():
        with transaction() as db:
            revoke(db)
            fresh = new_session(db)
        return jsonify(authenticated=False, csrf=fresh["csrf"])

    @app.get("/api/workspace")
    def workspace():
        if not g.auth or not g.auth["authenticated"]:
            return failure("Authentication required.", 401)
        return jsonify(email=g.auth["email"], status="authorized")

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path.startswith("api/"):
            abort(404)
        if not (ROOT / "dist/index.html").is_file():
            return failure("Frontend build is unavailable.", 503)
        # send_from_directory enforces safe path handling; no source/config files served.
        return send_from_directory(ROOT / "dist", path)

    @app.cli.command("create-user")
    @click.argument("email")
    def create_user(email):
        """Provision an account; password is prompted without echo or argv exposure."""
        email = email.strip().lower()
        if len(email)>254 or not EMAIL.fullmatch(email):
            raise click.ClickException("Enter a valid email address.")
        password = click.prompt("Password (at least 12 characters)", hide_input=True, confirmation_prompt=True)
        if len(password)<12 or len(password)>1024:
            raise click.ClickException("Use a password between 12 and 1024 characters.")
        with transaction() as db:
            if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                raise click.ClickException("Account already exists.")
            db.execute("INSERT INTO users VALUES (?, ?)", (email, generate_password_hash(password, method="scrypt")))
        click.echo("Account created.")

    @app.cli.command("reset-password")
    @click.argument("email")
    def reset_password(email):
        """Administrator-only recovery; revoke all sessions and pending codes."""
        email = email.strip().lower()
        password = click.prompt("New password (at least 12 characters)", hide_input=True, confirmation_prompt=True)
        if len(password)<12 or len(password)>1024:
            raise click.ClickException("Use a password between 12 and 1024 characters.")
        with transaction() as db:
            if not db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                raise click.ClickException("Account not found.")
            db.execute("UPDATE users SET password_hash=? WHERE email=?", (generate_password_hash(password, method="scrypt"), email))
            db.execute("DELETE FROM challenges WHERE email=?", (email,))
            db.execute("DELETE FROM sessions WHERE email=?", (email,))
        click.echo("Password reset. All sessions revoked.")

    return app
