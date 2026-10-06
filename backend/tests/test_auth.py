import re
import secrets
import socket
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser

import pytest
from aiosmtpd.controller import Controller
from werkzeug.security import generate_password_hash

from backend.app import create_app

ORIGIN = "http://127.0.0.1:5174"
EMAIL = "analyst@example.com"
PASSWORD = "a-long-test-password!"


@pytest.fixture
def setup(tmp_path):
    messages = []
    clock = [1_000_000.0]
    config = dict(TESTING=True, PRODUCTION=False, SECRET_KEY=secrets.token_urlsafe(48),
                  DATABASE=str(tmp_path / "auth.sqlite3"), APP_ORIGIN=ORIGIN,
                  SMTP_HOST="127.0.0.1", SMTP_FROM="sender@example.test", SMTP_MODE="plain",
                  MAIL_SENDER=lambda config, email, code: messages.append((email, code)),
                  CLOCK=lambda: clock[0])
    app = create_app(config)
    with sqlite3.connect(config["DATABASE"]) as db:
        db.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (EMAIL, generate_password_hash(PASSWORD)))
    return app, app.test_client(), messages, clock, config


def bootstrap(client):
    response = client.get("/api/auth/session")
    assert response.status_code == 200
    return response.json["csrf"]


def post(client, path, csrf, body=None, origin=ORIGIN):
    return client.post("/api/auth/" + path, json=body or {},
                       headers={"Origin": origin, "X-CSRF-Token": csrf})


def login(client):
    response = post(client, "login", bootstrap(client), {"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 202
    return response.json["csrf"]


def test_complete_login_rotation_restore_and_logout(setup):
    app, client, messages, _, _ = setup
    assert client.get("/api/workspace").status_code == 401
    before = client.get_cookie("o2c_session")
    csrf = login(client)
    pending_cookie = client.get_cookie("o2c_session").value
    assert before is None
    assert client.get("/api/workspace").status_code == 401
    response = post(client, "verify", csrf, {"code": messages[-1][1]})
    assert response.status_code == 200
    assert client.get_cookie("o2c_session").value != pending_cookie
    assert "HttpOnly" in response.headers["Set-Cookie"]
    assert "SameSite=Strict" in response.headers["Set-Cookie"]
    assert response.headers["Cache-Control"] == "no-store"
    assert client.get("/api/auth/session").json["authenticated"] is True
    assert client.get("/api/workspace").status_code == 200
    authenticated_cookie = client.get_cookie("o2c_session").value
    assert post(client, "logout", response.json["csrf"]).status_code == 200
    stolen = app.test_client()
    stolen.set_cookie("o2c_session", authenticated_cookie)
    assert stolen.get("/api/workspace").status_code == 401


def test_password_required_and_unknown_accounts_are_generic(setup):
    _, client, messages, _, _ = setup
    csrf = bootstrap(client)
    first = post(client, "login", csrf, {"email": EMAIL, "password": "wrong-password!"})
    second = post(client, "login", csrf, {"email": "missing@example.com", "password": "wrong-password!"})
    assert first.status_code == second.status_code == 401
    assert first.json == second.json
    assert not messages


def test_origin_and_csrf_enforced(setup):
    _, client, _, _, _ = setup
    csrf = bootstrap(client)
    body = {"email": EMAIL, "password": PASSWORD}
    assert post(client, "login", "invalid", body).status_code == 403
    assert post(client, "login", csrf, body, "https://evil.example").status_code == 403
    assert client.post("/api/auth/login", json=body).status_code == 403


def test_expiry_and_attempt_exhaustion(setup):
    _, client, messages, clock, _ = setup
    csrf = login(client)
    clock[0] += 301
    assert post(client, "verify", csrf, {"code": messages[-1][1]}).status_code == 401
    clock[0] += 31
    csrf = login(client)
    correct = messages[-1][1]
    incorrect = "111111" if correct != "111111" else "222222"
    for _ in range(5):
        assert post(client, "verify", csrf, {"code": incorrect}).status_code == 401
    assert post(client, "verify", csrf, {"code": correct}).status_code == 401
    clock[0] += 31
    assert post(client, "resend", csrf).status_code == 401


def test_resend_cooldown_and_old_code_invalidation(setup):
    _, client, messages, clock, _ = setup
    csrf = login(client)
    old = messages[-1][1]
    assert post(client, "resend", csrf).status_code == 429
    clock[0] += 31
    assert post(client, "resend", csrf).status_code == 200
    new = messages[-1][1]
    # Six-digit codes can legitimately coincide; ensure a distinct replacement for this assertion.
    if old == new:
        clock[0] += 31
        assert post(client, "resend", csrf).status_code == 200
        new = messages[-1][1]
    assert old != new
    assert post(client, "verify", csrf, {"code": old}).status_code == 401
    assert post(client, "verify", csrf, {"code": new}).status_code == 200


def test_login_throttle_persists_across_app_instances(setup):
    _, client, _, _, config = setup
    csrf = bootstrap(client)
    for _ in range(10):
        assert post(client, "login", csrf, {"email": EMAIL, "password": "wrong-password!"}).status_code == 401
    other = create_app(config).test_client()
    assert post(other, "login", bootstrap(other), {"email": EMAIL, "password": PASSWORD}).status_code == 429


def test_smtp_failure_never_authenticates(setup):
    app, client, _, _, _ = setup
    def fail(*args):
        raise OSError("SMTP unavailable")
    app.config["MAIL_SENDER"] = fail
    response = post(client, "login", bootstrap(client), {"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 503
    assert client.get("/api/workspace").status_code == 401
    assert client.get("/api/auth/session").json["pending"] is False


def test_otp_not_stored_in_plaintext_and_bound_to_session(setup):
    app, client, messages, _, config = setup
    csrf = login(client)
    with sqlite3.connect(config["DATABASE"]) as db:
        stored = db.execute("SELECT code_hash FROM challenges").fetchone()[0]
    assert stored != messages[-1][1]
    other = app.test_client()
    assert post(other, "verify", bootstrap(other), {"code": messages[-1][1]}).status_code == 401
    assert post(client, "verify", csrf, {"code": messages[-1][1]}).status_code == 200


def test_concurrent_code_replay_only_succeeds_once(setup):
    app, client, messages, _, _ = setup
    csrf = login(client)
    token = client.get_cookie("o2c_session").value
    def verify_once(_):
        concurrent = app.test_client()
        concurrent.set_cookie("o2c_session", token)
        return post(concurrent, "verify", csrf, {"code": messages[-1][1]}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(verify_once, range(2)))
    assert results.count(200) == 1


def test_authenticated_session_expires(setup):
    _, client, messages, clock, _ = setup
    csrf = login(client)
    assert post(client, "verify", csrf, {"code": messages[-1][1]}).status_code == 200
    clock[0] += 28801
    assert client.get("/api/workspace").status_code == 401


def test_account_provisioning_and_password_reset_revoke_sessions(setup):
    app, client, messages, _, _ = setup
    runner = app.test_cli_runner()
    result = runner.invoke(args=["create-user", "new@example.com"], input=PASSWORD+"\n"+PASSWORD+"\n")
    assert result.exit_code == 0
    assert PASSWORD not in result.output
    result = runner.invoke(args=["create-user", "new@example.com"], input=PASSWORD+"\n"+PASSWORD+"\n")
    assert result.exit_code != 0
    csrf = login(client)
    assert post(client, "verify", csrf, {"code": messages[-1][1]}).status_code == 200
    replacement = secrets.token_urlsafe(20)
    result = runner.invoke(args=["reset-password", EMAIL], input=replacement+"\n"+replacement+"\n")
    assert result.exit_code == 0
    assert replacement not in result.output
    assert client.get("/api/workspace").status_code == 401
    csrf = bootstrap(client)
    assert post(client, "login", csrf, {"email": EMAIL, "password": PASSWORD}).status_code == 401
    assert post(client, "login", csrf, {"email": EMAIL, "password": replacement}).status_code == 202


@pytest.mark.parametrize("body", [{"code": "123"}, {"code": "abcdef"}, {"code": 123456}, [], None])
def test_malformed_verification_rejected(setup, body):
    _, client, _, _, _ = setup
    csrf = bootstrap(client)
    assert post(client, "verify", csrf, body).status_code == 400


def test_request_size_limit_and_source_files_hidden(setup):
    _, client, _, _, _ = setup
    csrf = bootstrap(client)
    assert post(client, "login", csrf, {"password": "x" * 5000}).status_code == 413
    assert client.get("/backend/app.py").status_code == 404
    assert client.get("/api/missing").status_code == 404
    assert client.get("/../../backend/app.py").status_code == 404


def test_production_config_and_secure_cookie(setup):
    _, _, _, _, config = setup
    with pytest.raises(RuntimeError):
        create_app({**config, "PRODUCTION": True})
    with pytest.raises(RuntimeError):
        create_app({**config, "SECRET_KEY": "short"})
    app = create_app({**config, "PRODUCTION": True, "APP_ORIGIN": "https://finance.example.test",
                      "SMTP_MODE": "starttls"})
    response = app.test_client().get("/api/auth/session", base_url="https://finance.example.test")
    cookie = response.headers["Set-Cookie"]
    assert "__Host-o2c_session=" in cookie and "Secure" in cookie and "HttpOnly" in cookie
    assert "Domain=" not in cookie
    assert "script-src 'self'" in response.headers["Content-Security-Policy"]
    assert "Strict-Transport-Security" in response.headers
    assert app.test_client().get("/api/health", base_url="https://evil.example").status_code == 400


def test_real_local_smtp_delivery(setup):
    app, client, _, _, _ = setup
    from backend.app import send_code
    class Inbox:
        messages = []
        async def handle_DATA(self, server, session, envelope):
            self.messages.append(envelope.content)
            return "250 OK"
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    inbox = Inbox()
    controller = Controller(inbox, hostname="127.0.0.1", port=port)
    controller.start()
    try:
        app.config.update(MAIL_SENDER=send_code, SMTP_PORT=port)
        csrf = login(client)
        assert len(inbox.messages) == 1
        message = BytesParser(policy=policy.default).parsebytes(inbox.messages[0])
        assert message["To"] == EMAIL
        code = re.search(r"code is ([0-9]{6})", message.get_content()).group(1)
        assert post(client, "verify", csrf, {"code": code}).status_code == 200
    finally:
        controller.stop()
