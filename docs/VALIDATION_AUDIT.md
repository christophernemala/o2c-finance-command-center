# Login and account-provisioning validation audit

This review covers the React/Flask app on `master`. It has no public signup route;
its signup-equivalent entry point is administrator `create-user`. This audit does
not enable public registration. Logo, colors, theme, and stylesheet are preserved.

Login previously checked credential types/maximum lengths but did not enforce
full email syntax or the provisioning password policy. It stripped surrounding
email whitespace and ignored unexpected properties. Provisioning used a loose
email regex and separate password-length rules. Shared strict Pydantic schemas
now enforce server validation independently of every browser constraint.

| Field | Server enforcement | Entry points |
| --- | --- | --- |
| Email | Valid ASCII mailbox, maximum 254 characters, no padding, controls, HTML, or display-name syntax. Lowercase only after validation under the explicit identity policy. | Login, account creation, password reset |
| Password | Exact nonblank string, 12–1024 characters, no controls/surrogates. Never trim, normalize, or strip an opaque secret. | Login, account creation, password reset |
| Username | Optional; 3–32 ASCII letters/digits/`_.-`, starting with a letter; database uniqueness ignores case. | Administrator account creation; unexpected at login |
| Name | Optional; 1–100 Unicode letters/marks and name punctuation, without padding/controls. Strip tags and script/style content while inspecting, then reject changed values. | Administrator account creation; unexpected at login |
| Verification code | Required six-digit ASCII string; reject numeric coercion and extra properties. | Verification |

Optional profiles may be missing/null. Explicit empty values are rejected.
Malformed input is never rescued by trimming, ignoring extras, converting types,
or saving a cleaned version. Password punctuation/legitimate spaces are preserved.

File-by-file changes:

- `backend/validation.py`: strict credential, provisioning, reset, code, and
  empty-body Pydantic schemas; markup inspection; shared generic rejection text.
- `backend/app.py`: validates all mutation entry points, parses JSON without
  duplicate properties/nonstandard values, adds a direct-submission throttle,
  checks CSRF header shape, and makes every rejected auth response generic.
  Adds private bounded audit events, administrator-only export, validated profile
  storage, and an additive migration that preserves existing accounts/hashes.
- `backend/requirements.in`, `backend/requirements.txt`, and
  `backend/requirements-dev.txt`: pin Pydantic and email-validator plus transitive
  dependencies; lockfiles retain verified artifact hashes.
- `src/App.tsx`: matches the server password minimum for usability and removes
  silent digit cleaning. Server enforcement remains authoritative; no CSS or
  branding changes.
- `backend/tests/test_validation.py`: direct API submissions that bypass browser
  validation, invalid fields/markup, generic errors, unexpected properties,
  malformed/duplicate JSON, exact password handling, CLI validation, migration,
  throttling, and audit confidentiality/retention.
- `backend/tests/test_auth.py` and `backend/tests/test_browser.py`: retain prior
  authentication/SMTP/browser checks, use reserved syntactically valid account
  emails, and assert generic errors.
- `docs/AUTHENTICATION.md` and `docs/SECURITY_REVIEW.md`: document field policies,
  private rejection logging, CLI use, verification, and deployment limits.

Private events have field names for diagnosis, while responses do not reveal
which field failed. Unknown property names become `extra_field`, preventing raw
payload injection into logs. Email and peer IP are correlated through keyed
hashes; passwords, codes, and submitted values are never stored in these events.

This review does not establish the state of the separate `main` branch or an
inaccessible remote machine. Production SMTP, HTTPS, role/ownership checks for
future real finance APIs, and monitoring still need deployment verification.
`system.md` contains a generic agent prompt, not an application schema/server
configuration. No Antigravity or other provider tokens were read or copied.
