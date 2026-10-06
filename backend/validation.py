"""Strict server schemas; never trust HTML form constraints or coerce credentials."""
import re
import unicodedata
from html.parser import HTMLParser
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

REJECTION_MESSAGE = "Unable to process submission."


class _PlainText(HTMLParser):
    """Strip tags/comments and script/style content for free-text inspection."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.blocked = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.blocked += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.blocked:
            self.blocked -= 1

    def handle_data(self, data):
        if not self.blocked:
            self.parts.append(data)


def strip_free_text_markup(value: str) -> str:
    parser = _PlainText()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts)


def valid_password(value: str) -> str:
    # Passwords are opaque secrets: never trim, normalize, or strip HTML from them.
    if not value.strip() or any(unicodedata.category(char) in {"Cc", "Cs"} for char in value):
        raise ValueError("invalid secret")
    return value


class StrictSubmission(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", hide_input_in_errors=True)


class Credentials(StrictSubmission):
    email: Annotated[EmailStr, Field(max_length=254)]
    password: Annotated[str, Field(min_length=12, max_length=1024)]

    @field_validator("email", mode="before")
    @classmethod
    def exact_email(cls, value):
        if (not isinstance(value, str) or not value.isascii() or value != value.strip()
                or any(char in value for char in "<>\r\n\x00") or len(value) > 254):
            raise ValueError("invalid address")
        return value

    @field_validator("email")
    @classmethod
    def canonical_email(cls, value):
        # Explicit identity policy, applied only after the full address is valid.
        return str(value).lower()

    @field_validator("password")
    @classmethod
    def password_policy(cls, value):
        return valid_password(value)


class LoginSubmission(Credentials):
    pass


class ProvisionSubmission(Credentials):
    """The existing signup path is administrator provisioning, not a public route."""
    username: Annotated[str, Field(min_length=3, max_length=32)] | None = None
    name: Annotated[str, Field(min_length=1, max_length=100)] | None = None

    @field_validator("username")
    @classmethod
    def username_policy(cls, value):
        if value is not None and not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{2,31}", value):
            raise ValueError("invalid identifier")
        return value

    @field_validator("name")
    @classmethod
    def name_policy(cls, value):
        if value is None:
            return value
        plain = strip_free_text_markup(value)
        # Strip while inspecting, then reject altered content: never silently save
        # a cleaned version of a malformed submission or reflect the original.
        if plain != value or any(char in value for char in "<>") or value != value.strip():
            raise ValueError("invalid free text")
        if not any(unicodedata.category(char).startswith("L") for char in value):
            raise ValueError("invalid free text")
        if any(not (unicodedata.category(char)[0] in {"L", "M"} or char in " '-.’") for char in value):
            raise ValueError("invalid free text")
        return plain


class VerifySubmission(StrictSubmission):
    code: Annotated[str, Field(pattern=r"^[0-9]{6}$", min_length=6, max_length=6)]


class EmptySubmission(StrictSubmission):
    pass


class ResetSubmission(Credentials):
    pass
