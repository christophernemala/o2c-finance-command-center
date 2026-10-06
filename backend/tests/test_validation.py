"""Submit directly to Flask without relying on browser validation."""
import json
import sqlite3

import pytest
from pydantic import ValidationError
from werkzeug.security import check_password_hash, generate_password_hash

from backend.app import create_app
from backend.validation import ProvisionSubmission, REJECTION_MESSAGE, strip_free_text_markup
from backend.tests.test_auth import EMAIL, PASSWORD, bootstrap, post, setup


@pytest.mark.parametrize("email", [
    None, 123, [], {}, "", "person@", "person@example", "a@@example.com",
    "person@bad_domain.com", "a..b@example.com", " person@example.com",
    "person@example.com ", "Person <person@example.com>", "person@example.com\r\nInjected: value",
    "<script>alert(1)</script>@example.com", "pérson@example.com", "a"*255+"@example.com",
])
def test_email_is_rejected_server_side(setup, email):
    _, client, messages, _, _ = setup
    response = post(client, "login", bootstrap(client), {"email": email, "password": PASSWORD})
    assert response.status_code == 401
    assert response.json == {"error": REJECTION_MESSAGE}
    assert not messages


@pytest.mark.parametrize("password", [None, 123, [], {}, "", "short", " "*12,
                                          "valid-password\x00", "valid-password\n", "x"*1025])
def test_password_is_rejected_server_side(setup, password):
    _, client, messages, _, _ = setup
    response = post(client, "login", bootstrap(client), {"email": EMAIL, "password": password})
    assert response.status_code == 401
    assert response.json == {"error": REJECTION_MESSAGE}
    assert not messages


@pytest.mark.parametrize("extra", [{"username": "admin"}, {"name": "Jane"}, {"role": "admin"}, {"attacker\nfield": "value"}])
def test_unsupported_login_fields_never_accepted(setup, extra):
    _, client, messages, _, _ = setup
    response = post(client, "login", bootstrap(client), {"email": EMAIL, "password": PASSWORD, **extra})
    assert response.status_code == 401
    assert response.json == {"error": REJECTION_MESSAGE}
    assert not messages


@pytest.mark.parametrize("field,value", [
    ("username", 123), ("username", "ab"), ("username", "name with spaces"),
    ("username", "<script>admin</script>"), ("username", "_admin"), ("username", "a"*33),
    ("name", 123), ("name", ""), ("name", " Jane"), ("name", "Jane "),
    ("name", "<b>Jane</b>"), ("name", "<script>alert(1)</script>Jane"),
    ("name", "<img src=x onerror=alert(1)>Jane"), ("name", "<!--hidden-->Jane"),
    ("name", "&lt;script&gt;Jane"), ("name", "Jane\nAdmin"), ("name", "Jane\x00"),
    ("name", "Jane\u202eAdmin"), ("name", "123"), ("name", "x"*101),
])
def test_provision_schema_rejects_malformed_profile_fields(field, value):
    body = dict(email=EMAIL, password=PASSWORD, username="analyst", name="Jane Doe")
    body[field] = value
    with pytest.raises(ValidationError):
        ProvisionSubmission.model_validate(body)


def test_markup_stripping_inspection_does_not_silently_accept_modified_names():
    assert strip_free_text_markup("<b>Jane</b><script>alert(1)</script><style>body{}</style>") == "Jane"
    with pytest.raises(ValidationError):
        ProvisionSubmission(email=EMAIL, password=PASSWORD, name="<b>Jane</b>")


def test_cli_profile_validation_stores_only_validated_values(setup):
    app, _, _, _, config = setup
    runner = app.test_cli_runner()
    response = runner.invoke(args=["create-user", "jose@example.com", "--username", "jose.oc", "--name", "José O’Connor"],
                             input=PASSWORD+"\n"+PASSWORD+"\n")
    assert response.exit_code == 0
    with sqlite3.connect(config["DATABASE"]) as db:
        row = db.execute("SELECT username, name, password_hash FROM users WHERE email='jose@example.com'").fetchone()
    assert row[:2] == ("jose.oc", "José O’Connor")
    assert check_password_hash(row[2], PASSWORD)
    assert row[2] != PASSWORD
    rejected = runner.invoke(args=["create-user", "evil@example.com", "--name", "<b>Jane</b>"],
                             input=PASSWORD+"\n"+PASSWORD+"\n")
    assert rejected.exit_code != 0
    assert REJECTION_MESSAGE in rejected.output
    assert "<b>Jane</b>" not in rejected.output
    with sqlite3.connect(config["DATABASE"]) as db:
        assert db.execute("SELECT 1 FROM users WHERE email='evil@example.com'").fetchone() is None
        row = db.execute("SELECT category, fields FROM security_events WHERE action='create_user' ORDER BY id DESC").fetchone()
    assert row == ("schema", '["name"]')


def test_cli_failure_does_not_identify_rejected_field(setup):
    app, _, _, _, _ = setup
    runner = app.test_cli_runner()
    results = [
        runner.invoke(args=["create-user", "malformed"], input=PASSWORD+"\n"+PASSWORD+"\n"),
        runner.invoke(args=["create-user", "valid@example.com", "--name", "<script>Jane</script>"], input=PASSWORD+"\n"+PASSWORD+"\n"),
        runner.invoke(args=["create-user", "valid@example.com", "--username", "!invalid"], input=PASSWORD+"\n"+PASSWORD+"\n"),
        runner.invoke(args=["create-user", "valid@example.com"], input="short\nshort\n"),
    ]
    assert all(result.exit_code != 0 for result in results)
    assert len({result.output for result in results}) == 1


def test_existing_two_column_database_is_migrated_without_resetting_users(setup, tmp_path):
    _, _, _, _, config = setup
    path = str(tmp_path / "legacy.sqlite3")
    original_hash = generate_password_hash(PASSWORD)
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE users (email TEXT PRIMARY KEY, password_hash TEXT NOT NULL)")
        db.execute("INSERT INTO users VALUES (?, ?)", (EMAIL, original_hash))
    app = create_app({**config, "DATABASE": path})
    with sqlite3.connect(path) as db:
        row = db.execute("SELECT password_hash, username, name FROM users WHERE email=?", (EMAIL,)).fetchone()
    assert row == (original_hash, None, None)
    client = app.test_client()
    assert post(client, "login", bootstrap(client), {"email": EMAIL, "password": PASSWORD}).status_code == 202


@pytest.mark.parametrize("raw", [
    '{"email":"analyst@example.com","email":"evil@example.com","password":"secret-value"}',
    '{"email":NaN,"password":"secret-value"}', '{invalid}', '[]', 'null',
])
def test_malformed_and_duplicate_json_rejected_generically(setup, raw):
    _, client, messages, _, _ = setup
    response = client.post("/api/auth/login", data=raw, content_type="application/json",
                           headers={"Origin": "http://127.0.0.1:5174", "X-CSRF-Token": bootstrap(client)})
    assert response.status_code == 400
    assert response.json == {"error": REJECTION_MESSAGE}
    assert not messages


def test_error_bodies_identical_for_all_rejected_fields_and_bad_credentials(setup):
    _, client, _, _, _ = setup
    csrf = bootstrap(client)
    bodies = [
        {"email": "broken", "password": PASSWORD}, {"email": EMAIL, "password": "short"},
        {"email": EMAIL, "password": PASSWORD, "name": "<script>attack</script>"},
        {"email": EMAIL, "password": "valid-but-wrong-password"},
        {"email": "unknown@example.com", "password": PASSWORD},
    ]
    responses = [post(client, "login", csrf, body) for body in bodies]
    assert {response.status_code for response in responses} == {401}
    assert {response.get_data() for response in responses} == {json.dumps({"error": REJECTION_MESSAGE}).encode()}


def test_rejection_log_has_metadata_without_attack_values_or_secrets(setup):
    app, client, _, _, config = setup
    csrf = bootstrap(client)
    malicious = '<script>PRIVATE_ATTACK_STRING</script>@example.com'
    password = "PRIVATE_PASSWORD_VALUE"
    body = {"email": malicious, "password": password, "PRIVATE_FIELD_VALUE": "PRIVATE_BODY_VALUE"}
    assert post(client, "login", csrf, body).status_code == 401
    result = app.test_cli_runner().invoke(args=["security-events", "--limit", "10"])
    assert result.exit_code == 0
    events = [json.loads(line) for line in result.output.splitlines()]
    assert events[0]["category"] == "schema"
    assert events[0]["fields"] == ["email", "extra_field"]
    assert len(events[0]["peer_hash"]) == 64
    assert events[0]["identifier_hash"] is None
    for sensitive in (malicious, password, "PRIVATE_FIELD_VALUE", "PRIVATE_BODY_VALUE", csrf, "127.0.0.1"):
        assert sensitive not in result.output
    with sqlite3.connect(config["DATABASE"]) as db:
        assert db.execute("SELECT count(*) FROM security_events").fetchone()[0] == 1


def test_invalid_submissions_throttled_and_audit_retention_is_bounded(setup):
    app, client, _, clock, config = setup
    app.config["SECURITY_EVENT_MAX_ROWS"] = 3
    csrf = bootstrap(client)
    for _ in range(120):
        assert post(client, "login", csrf, {"email": "bad", "password": "short"}).status_code == 401
    assert post(client, "login", csrf, {"email": "bad", "password": "short"}).status_code == 429
    with sqlite3.connect(config["DATABASE"]) as db:
        assert db.execute("SELECT count(*) FROM security_events").fetchone()[0] == 3
    clock[0] += 31*86400
    assert post(client, "login", bootstrap(client), {"email": "bad", "password": "short"}).status_code == 401
    with sqlite3.connect(config["DATABASE"]) as db:
        assert db.execute("SELECT count(*) FROM security_events").fetchone()[0] == 1


def test_no_public_signup_and_empty_mutations_forbid_extra_fields(setup):
    _, client, _, _, _ = setup
    csrf = bootstrap(client)
    assert post(client, "signup", csrf, {"email": EMAIL, "password": PASSWORD, "username": "admin", "name": "Admin"}).status_code == 405
    for action in ("resend", "logout"):
        response = post(client, action, csrf, {"role": "admin"})
        assert response.status_code == 400
        assert response.json == {"error": REJECTION_MESSAGE}


def test_email_case_normalization_is_explicit_and_password_never_changed(setup):
    app, client, _, _, _ = setup
    password = "  <b>opaque-secret</b>  "
    runner = app.test_cli_runner()
    result = runner.invoke(args=["create-user", "OPAQUE@EXAMPLE.COM"], input=password+"\n"+password+"\n")
    assert result.exit_code == 0
    csrf = bootstrap(client)
    assert post(client, "login", csrf, {"email": "opaque@example.com", "password": password.strip()}).status_code == 401
    assert post(client, "login", csrf, {"email": "opaque@example.com", "password": password}).status_code == 202
