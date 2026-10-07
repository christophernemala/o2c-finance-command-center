# Sign-in and request controls

Authentication remains Supabase SSR/Auth. Passwords are sent to the selected Supabase
project by its server SDK; the app does not store passwords, implement bcrypt, or
claim control over a provider's hashing cost. Clerk requires a separately reviewed
identity/JWT/RLS migration, not a second simultaneous auth system.

Zod checks bounded credentials and command envelopes before provider/financial calls.
Domain amount, file, ownership, balance, maker/checker, and version checks also run in
the application and PostgreSQL. Errors never echo credentials or provider details.
Credential failures and absent memberships use the same incorrect-credentials message.

Configure these **server-only** variables securely in development and Vercel:

- `UPSTASH_REDIS_REST_URL`: HTTPS REST origin ending in `.upstash.io`.
- `UPSTASH_REDIS_REST_TOKEN`: write-enabled token for a dedicated Redis database.
- `AUTH_RATE_LIMIT_SECRET`: cryptographically random secret of at least 32 characters.

The atomic Redis Lua script reserves a unique slot before a Supabase sign-in. Five
failed/in-flight account slots or 30 failed/in-flight IP attempts in a sliding 15-minute window deny
another attempt with HTTP 429 and Retry-After. The Redis clock sets all timestamps.
Only successful membership-verified login removes its own account and IP reservations. Other
concurrent failures remain counted. Crashes leave conservative slots until expiry.
Redis stores HMAC identifiers, timestamps and random attempt IDs, not raw email, IP,
password, or financial records. Changing the secret resets the key namespace.

Missing configuration, invalid edge headers, provider errors, malformed replies,
redirects and timeouts fail closed. Vercel's overwritten `x-vercel-forwarded-for` is
the only production IP source; client `x-forwarded-for` is ignored. Another hosting
platform needs a reviewed trusted-proxy adapter. Local development uses loopback.
Logout remains available even when Redis is unavailable.
Header behavior is documented in [Vercel's request-header reference](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).

Tests verify key privacy, normalization, successful-slot removal, denial handling,
malformed replies, outages and trusted-header handling with a test HTTP transport.
They do not run Redis Lua. Before promotion, exercise the actual Redis provider:
five failures then a denied sixth attempt, sliding expiry, concurrent requests from
multiple app instances, successful login interleaved with failures, and Redis outage.
Also verify Supabase's own abuse protections, invite/recovery delivery and MFA policy.
No credentials or actual provider connectivity are supplied by this commit.
