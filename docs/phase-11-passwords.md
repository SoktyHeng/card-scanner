# Phase 11 — Password recovery and account password changes

Implementation and hosted Auth/email acceptance passed on 2026-10-10 with the
localhost production app. Gmail SMTP, template/redirect settings, real delivery,
password recovery, used links and actual expiry were verified. A deployed HTTPS
origin still needs separate release verification. The disposable test account's
password was upgraded and saved privately in ignored `.env.local`; live
change-and-restore verification passed after the correction described below.

## Application flows

- Sign in → Forgot password → enter email → neutral confirmation.
- Reset email → `/auth/recovery` → Continue → verified Supabase recovery session
  and signed recovery cookie → `/auth/new-password` → confirm new password.
- Signed-in header → Account → enter current/new/confirmation passwords → update.

Loading the email URL alone does not verify or consume the token. Continue posts
it through a same-origin Server Action using `verifyOtp` with type `recovery`.
Verification checks the user with `getUser` before issuing a 15-minute, user-bound
HMAC grant in an HttpOnly, SameSite=Lax cookie (Secure on HTTPS). Both the recovery
page and the update action require the verified session and valid grant; ordinary
sign-in alone cannot authorize the reset form. Invalid, expired, duplicate or
wrong-type URL parameters show safe errors. Redirect destinations are fixed local
routes, never caller-supplied `next` or `redirect_to` values.

Account changes explicitly sign in using the current password and the
server-verified user's email, checking the returned ID matches the original user.
They also send the SDK's `current_password` option. The live hosted check found
that this option alone did not reject an incorrect password. No entered email
selects the account. New passwords must contain
12–128 characters, must not be all whitespace, and must match confirmation.
Passwords are preserved exactly, including meaningful edge whitespace. Hosted
Supabase can enforce stronger rules. Failed mutations keep form values for retry;
success removes them from the UI, clears recovery permission and requests global
sign-out. A later sign-out failure is reported as a completed password update
with incomplete session sign-out, not a failed mutation. Successful actions
redirect to `/auth/password-updated`, so removing a recovery cookie does not
rerender the protected reset page as an expired link. If global sign-out fails,
the confirmation page offers an explicit retry. Supabase access JWTs may remain
valid until expiry even after refresh sessions are revoked. See the official
[sign-out reference](https://supabase.com/docs/reference/javascript/auth-signout).

Recovery permission is also cleared on successful ordinary sign-in/sign-out.
Same-origin checks supplement Next.js Server Action origin validation. Supabase
Auth's email/rate limits govern reset requests; neutral responses cover unknown
accounts, delivery failures and rate limits, so a success message does not prove
an email was delivered. No credentials, email addresses, token hashes or upstream
Auth diagnostics are logged by these actions.

## Server configuration

Set these server-only environment values, never NEXT_PUBLIC_ variables:

```env
APP_SITE_URL=http://localhost:3000
AUTH_RECOVERY_SECRET=<at-least-32-random-characters>
```

Generate the secret in your terminal with `openssl rand -hex 32`. Keep it private
and identical across replicas. Rotating it invalidates outstanding grants. The
site URL must be an origin with no credentials/path/query/fragment; HTTPS is
required except localhost/loopback. Reset links always use this configured origin,
not a request Host or caller-supplied redirect. Restart the app after changes.
Local ignored `.env.local` settings were created for this checkout without
printing the secret or modifying existing Supabase/test credentials.

Later verification added a stronger disposable password and setup-only Gmail
SMTP/Management API credentials to the ignored file. Those setup credentials are
not application requirements and must not be added to client environment values.

For production, replace the local origin with your deployed HTTPS origin and
store the secret in the hosting platform's protected environment configuration.
No deployed app currently exists, so production setup remains pending.

## Supabase configuration

1. In Auth → URL Configuration, set Site URL to the application origin and add
   its exact `/auth/recovery` URL to allowed redirects. Allow local URLs only in
   development/test projects; avoid broad production wildcards.
2. In Auth → Email Templates → Reset password, set the subject and copy
   `supabase/templates/recovery.html` as the body. The template uses
   `{{ .RedirectTo }}` and `{{ .TokenHash }}` with `type=recovery`. The default
   ConfirmationURL/fragment template is not this application's recovery flow.
3. Configure a production SMTP provider and verified sender in Supabase Auth.
   Keep SMTP credentials in Supabase's protected configuration, never browser
   code, Git or chat. Disable email-link click tracking, which can rewrite links.
   The application itself does not need SMTP credentials or a service-role key.
4. Align the hosted password minimum with the app's 12-character minimum and
   review Auth rate limits, token expiry, password security and optional password
   change notifications. If hosted secure-password-change settings require a
   recent login or additional reauthentication, sign out/sign in before changing
   a password; check that policy with disposable accounts.
5. Redact recovery token query strings in proxy/hosting/analytics logs. Recovery
   pages are private/no-store and inherit no-referrer/anti-framing protections;
   do not add third-party analytics that capture their URLs or forms.

The version-controlled local `supabase/config.toml` now has localhost recovery
redirects, a 12-character minimum and the recovery template. Its local SMTP inbox
is configured on port 54324. Docker's engine was unavailable during implementation,
so the full local Auth/email stack was not started or claimed as verified.
Changing this file does not apply those settings to hosted Supabase.

Hosted settings were applied and read back on 2026-10-10: Gmail SMTP using an
app password, port 587, matching sender address, the version-controlled recovery
subject/body, localhost Site URL and exact `/auth/recovery` redirect, a password
minimum of 12 and a 30-email/hour Auth limit. The previous two-email/hour default
had blocked further test delivery. Existing redirect entries were preserved.
The hosted OTP expiry remains 3600 seconds. Gmail is the development/test sender;
review the production sender and deployed HTTPS redirect before release.

Follow the official [password guide](https://supabase.com/docs/guides/auth/passwords),
[email template guide](https://supabase.com/docs/guides/auth/auth-email-templates)
and [custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification

Automated tests cover password bounds/confirmation, preserved passwords, neutral
reset responses, fixed callbacks, OTP verification, signed grant expiry/tampering/
wrong-user denial, verified sessions, current-password forwarding, retries and
sign-out failures. SDK-level tests use the actual Supabase client with controlled
HTTP responses; they do not prove hosted email delivery. Form tests cover labels,
pending/duplicate prevention, error retry and successful removal of password inputs.

```bash
npm test
npm run lint
npm run build
# With the production build running:
APP_BASE_URL=http://localhost:3000 npm run verify:app
```

The production verifier checks recovery labels, missing/invalid-link handling,
anonymous Account/new-password denial and absence of configured recovery secret
values in generated browser JavaScript, alongside the existing protection checks.

Authenticated read-only page checks passed with the configured disposable user:
Account/current-password access, ordinary-session rejection at the reset page,
and forged/wrong-user/expired grant denial. A locally test-issued matching grant
opened the reset form. This verifies real session/page protection, not emailed
OTP verification. Repeat while the app is running:

```bash
APP_BASE_URL=http://localhost:3000 npm run verify:password -- --check-pages
```

For a terminal-only hosted password change check, configure a **disposable**
`TEST_USER_A_EMAIL/PASSWORD`. Its original password must already meet the new
12–128-character rule so it can be restored. Then opt in explicitly:

```bash
npm run verify:password -- --change-disposable-password
```

This signs in, tests incorrect-current-password denial, temporarily changes the
password through the application service, checks new-password sign-in, restores
the original and checks sign-in again. It requests global sign-out for that test
user; never use a real account. No reset emails are requested. Before any password
mutation, an ignored, mode-0600 credential recovery file is written under
`test-results/password-verification/` and removed after successful restoration.
If restoration is unconfirmed, preserve the private file and restore the user
before rerunning. Never commit/share it. The original test password did not meet
the minimum during implementation. On 2026-10-10 it was upgraded through the
application service and saved privately in `.env.local`. After the explicit
reauthentication correction, the live check passed incorrect-password denial,
update, new-password sign-in, restoration and restored-password sign-in. Its
private recovery backup was removed. All 144 tests, lint and build passed.

## Email and recovery acceptance record

Run these with disposable accounts and a test project after SMTP/template setup.
Record date, app commit, provider, environment and outcome without token/password
values. Do not send real users test reset messages.

| Scenario | Expected result | Current evidence |
| --- | --- | --- |
| Existing user requests reset | Neutral response; email arrives with exact allowed app URL | Real Gmail delivery and exact localhost callback passed 2026-10-10 |
| Unknown email requests reset | Same neutral response without revealing account existence | Controlled automated test passed |
| Valid emailed recovery link | GET does not consume; Continue establishes verified recovery permission | Real emailed-link GET, Continue and reset-page access passed 2026-10-10 |
| Missing, malformed, wrong-type or repeated parameters | Safe invalid-link screen; no update form | Automated HTTP/schema checks |
| Expired/used link | Continue fails safely; request-new-link action available | Real used-link and expired-link denial passed 2026-10-10; expiry temporarily 60 seconds, then restored to 3600 |
| Authenticated session without recovery grant | New-password page/action denied | Controlled automated test and live signed-in page denial passed |
| Wrong user's/tampered/expired grant | Password update denied | Automated test and live page denial passed |
| Current-password change | Wrong current password denied; correct password update and new sign-in succeed | Live check passed 2026-10-10 after explicit reauthentication correction |
| Original test password restoration | Original sign-in works and private backup removed | Live check passed 2026-10-10; stronger configured disposable password restored |
| Recovery update and session protection | Verified recovery can update; old password fails; ordinary session cannot open reset page | Real password Server Action, new/old sign-in checks, sign-out, restoration and live page protections passed 2026-10-10 |

Hosted Phase 11 acceptance passed with actual emails and a dedicated disposable
Gmail alias. HTTP form posts verified Forgot password and Continue; the real
React Server Action protocol verified the password update. No interactive browser
or physical device was controlled. The obsolete localhost server was restarted
with the production build after returning 404 for the reset route. Original test
passwords were restored, mutation backups removed, and temporary email token,
session cookie and raw configuration snapshots removed. A private, mode-0600
disposable-account record remains under ignored `test-results/phase-11-hosted/`
for future checks; the account has no scanned cards. No email/password/token
values are recorded in version-controlled acceptance evidence.

Production readiness still requires deployment, HTTPS recovery-link verification,
production sender planning and the outstanding Phase 10 release checks.
