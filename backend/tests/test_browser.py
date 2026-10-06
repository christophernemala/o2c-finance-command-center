"""Browser smoke test against the real Flask server and a loopback SMTP inbox."""
import os
import re
import secrets
import shutil
import socket
import sqlite3
from email import policy
from email.parser import BytesParser
from threading import Thread

import pytest
from aiosmtpd.controller import Controller
from werkzeug.security import generate_password_hash
from werkzeug.serving import make_server

from backend.app import ROOT, create_app


def test_browser_login_reload_and_logout(tmp_path):
    playwright = pytest.importorskip("playwright.sync_api")
    chromium = os.environ.get("O2C_CHROMIUM", shutil.which("chromium"))
    if not chromium:
        pytest.skip("Install Chromium or set O2C_CHROMIUM for browser validation.")
    assert (ROOT / "dist/index.html").is_file(), "Run npm run build before browser validation."

    class Inbox:
        messages = []
        async def handle_DATA(self, server, session, envelope):
            self.messages.append(envelope.content)
            return "250 OK"

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        smtp_port = sock.getsockname()[1]
    inbox = Inbox()
    smtp = Controller(inbox, hostname="127.0.0.1", port=smtp_port)
    smtp.start()
    db_path = str(tmp_path / "auth.sqlite3")
    app = create_app(dict(PRODUCTION=False, SECRET_KEY=secrets.token_urlsafe(48),
                          DATABASE=db_path, APP_ORIGIN="http://127.0.0.1:5174",
                          SMTP_HOST="127.0.0.1", SMTP_PORT=smtp_port, SMTP_MODE="plain",
                          SMTP_FROM="sender@example.test"))
    password = secrets.token_urlsafe(20)
    with sqlite3.connect(db_path) as db:
        db.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)",
                   ("analyst@example.com", generate_password_hash(password)))
    server = make_server("127.0.0.1", 0, app, threaded=True)
    origin = f"http://127.0.0.1:{server.server_port}"
    app.config["APP_ORIGIN"] = origin
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with playwright.sync_playwright() as p:
            browser = p.chromium.launch(executable_path=chromium, headless=True,
                                        args=["--no-sandbox"])
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(origin)
            playwright.expect(page.get_by_role("button", name="Sign in to dashboard")).to_be_enabled()
            assert page.locator(".brand-row").inner_text() == "O2C Finance Cloud"
            assert page.locator(".brand-dot svg").count() == 1
            original_style = page.locator(".login-card").evaluate("el => getComputedStyle(el).backgroundColor")
            assert original_style == "rgba(8, 17, 36, 0.84)"
            page.get_by_label("Work email").fill("analyst@example.com")
            page.get_by_label("Password", exact=True).fill("incorrect-password")
            page.get_by_role("button", name="Sign in to dashboard").click()
            playwright.expect(page.get_by_role("alert")).to_have_text("Unable to process submission.")
            page.get_by_label("Password", exact=True).fill(password)
            page.get_by_role("button", name="Sign in to dashboard").click()
            playwright.expect(page.get_by_label("Verification code")).to_be_visible()
            assert page.locator(".brand-row").inner_text() == "O2C Finance Cloud"
            assert page.locator(".login-card").evaluate("el => getComputedStyle(el).backgroundColor") == original_style
            playwright.expect(page.get_by_role("button", name="Resend code", exact=True)).to_be_disabled()
            page.reload()
            playwright.expect(page.get_by_label("Verification code")).to_be_visible()
            assert len(inbox.messages) == 1
            message = BytesParser(policy=policy.default).parsebytes(inbox.messages[0])
            code = re.search(r"code is ([0-9]{6})", message.get_content()).group(1)
            # A single accessible input supports full-code paste and mobile autofill.
            page.get_by_label("Verification code").fill(code)
            page.get_by_role("button", name="Verify and open dashboard").click()
            playwright.expect(page.get_by_role("button", name="Logout", exact=True)).to_be_visible()
            assert context.request.get(origin + "/api/workspace").status == 200
            page.reload()
            playwright.expect(page.get_by_role("button", name="Logout", exact=True)).to_be_visible()
            page.get_by_role("button", name="Logout", exact=True).click()
            playwright.expect(page.get_by_label("Work email")).to_be_visible()
            assert context.request.get(origin + "/api/workspace").status == 401
            page.set_viewport_size({"width": 390, "height": 844})
            assert page.locator(".brand-row").is_visible()
            assert not errors
            browser.close()
    finally:
        server.shutdown()
        thread.join(timeout=5)
        smtp.stop()
