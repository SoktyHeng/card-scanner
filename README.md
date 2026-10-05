# Card Scanner — Phases 1 and 2

Next.js 16 App Router, strict TypeScript, Tailwind 4, shadcn/ui, Supabase
authentication, a dashboard, and a protected camera/upload preview workflow.
AI extraction, review, saving scans, and card-management actions are reserved
for later phases.

## Install and configure

Use Node.js 20.9+ (Node 24 was used for verification).

```bash
npm ci
```

Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your project's Connect dialog.
For older projects, `NEXT_PUBLIC_SUPABASE_ANON_KEY` is supported when no
publishable key is set. Configuration is validated with Zod when creating a
client. A production build can run without credentials, but application requests
require them.

Only the public project URL and publishable/anon key are included in browser
code. Validation rejects secret keys and legacy service-role JWTs. Phase 1 needs
**no service-role or AI key**. Optional future secrets are comments in
`.env.example`; keep them server-side. Never commit `.env.local`, `.env`, account
passwords, access tokens, or database passwords.

On Windows with PowerShell script execution disabled, use `npm.cmd` and
`npx.cmd` instead of `npm` and `npx`.

## Apply the database migration

The CLI is pinned as a development dependency. The version-controlled migration
under `supabase/migrations/` creates:

- `public.cards` with the requested standard fields, JSONB extra-field array,
  raw OCR text, image path, confidence, archive flag, timestamps, and an
  `ai_extraction` JSONB column to preserve original structured extraction later.
- An ownership/recent-card index, array/confidence/image-path constraints, and
  an invoker trigger that updates `updated_at`.
- CRUD grants to `authenticated` and four ownership RLS policies. UPDATE checks
  both existing and resulting ownership. Anonymous table access is revoked.
- A private `card-images` bucket limited to 10 MB JPEG, PNG, and WEBP uploads,
  with user-folder SELECT, INSERT, UPDATE, and DELETE policies.

For a hosted project, use a scoped Supabase access token and database password
through your terminal's environment (`SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`). These are CLI credentials, never application public
variables. Link the intended project, review, then apply:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase db advisors --type security
```

If the target already has a `cards` table or `card-images` bucket, reconcile its
schema/history before applying. This initial migration fails on conflicts rather
than changing an unknown existing schema. Review existing storage policies too:
PostgreSQL combines permissive policies with OR, so any pre-existing broad policy
must be removed or narrowed to preserve isolation.

For local development, start Docker Desktop's Linux engine, then:

```bash
npx supabase start
npx supabase db push --local
```

Use the local URL and public key in `.env.local`. No seed users are created.
Create two disposable users with confirmed emails and passwords in the local
Studio or hosted Dashboard, under Authentication → Users. This foundation has
no registration or password-reset UI. Local public registration is disabled;
disable public signups on the hosted project too if accounts are provisioned
only by your administrator. Enable the Email provider for password sign-in.
Set the hosted Site URL to your application's origin. Password sign-in does not
need an OAuth callback route or email redirect flow.

After schema changes, regenerate the checked-in database types using
`npx supabase gen types --linked --lang typescript --schema public` (or `--local`)
and save the output to `types/database.ts`.

## Start and authentication behavior

```bash
npm run dev
```

Visit `http://localhost:3000`. `/` redirects to `/login` or `/dashboard`.
Sign in with a provisioned account. Sign out ends the current browser session.
The proxy refreshes cookies and prevents auth responses from being cached.
Protected pages also verify the user with the Auth server before reading data.
`/dashboard`, `/cards/*`, and `/scan/*` are protected. Dashboard and scan pages
are implemented. Invalid sessions return to login, and sign-in return paths are
restricted to application routes. All database reads use the user's session and
the public key. Frontend filtering supplements, but never replaces, RLS.

The dashboard displays real active-card, UTC-day, and archive counts plus recent
records. Missing schema or failed reads display an error instead of fake counts.
Storage paths use `{user_id}/{card_id}/original.png` (or `.jpg`/`.webp`). Store
paths, not public URLs. Future display code must request temporary signed URLs
using the owner's session.

## Verification

```bash
npm run lint
npm run build
npm test
npm run verify:supabase
npm run verify:app
```

`npm test` checks public environment validation, credentials, safe redirects, and
executes the actual migration in embedded PostgreSQL. Its minimal auth/storage
fixtures model Supabase helpers. It tests anonymous denial, own CRUD, cross-user
read/update/delete denial, forged ownership inserts, owner reassignment, private
bucket metadata, user-folder storage policies, JSONB roundtrip, constraints,
and timestamp updates. It does not replace live Supabase API tests.

For live verification, set these server-only values in `.env.local`:

```env
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
```

Use distinct disposable confirmed accounts on a test project. The verifier
uses only the public key plus signed-in user tokens. It probes Auth and anonymous
database access, then tests password sign-in, session refresh, own CRUD, JSONB
roundtrip, cross-user denial, private storage upload/download/update/delete,
signed URLs, blocked public URLs, blocked cross-user moves, and sign-out. It
creates one temporary card/image and removes them in `finally`; no account or
other card is deleted. Never run these fixture writes against production.
Exit codes: 0 = pass, 1 = failed check, 2 = blocked configuration/schema.

With `npm run start` or `npm run dev` running, `npm run verify:app` checks login
rendering, anonymous redirects, no-store headers, and a forged session cookie.
Set `APP_BASE_URL` to test a different local port.

Also verify in a browser: sign in, reload the dashboard, sign out, and open
`/dashboard` again; it must redirect to `/login`. Check mobile and desktop widths,
including keyboard focus and validation messages.

## Phase 2 — Scan UI

Sign in, then use **Scan card** in the navigation or open `/scan`. The scanner
uses a native `capture="environment"` image input for mobile camera capture and
a separate upload input. JPG/JPEG, PNG, and WEBP are supported up to and including
10 × 1024 × 1024 bytes. Camera behavior varies by browser/device; desktop browsers
usually offer a file picker. See the [capture attribute documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).

Validation checks file size, byte signatures, and a complete browser image decode.
File extensions and browser MIME cannot make an unsupported file valid. Corrupt,
empty, oversized, SVG, GIF, PDF, and HEIC files are rejected. Supported content
with missing or incorrect MIME is decoded through a correctly typed local blob;
the original file is preserved. Phase 3 must independently revalidate content on
the server when an extraction endpoint is introduced.

The scanner has idle, validating, image-selected, error, and extraction-unavailable
states. A valid image is previewed locally with filename, size, and dimensions.
Replace/retake and remove controls are available. An invalid replacement preserves
the earlier valid image. Native picker cancellation also preserves the preview.
Object URLs are revoked on replacement, removal, validation failure, cancellation,
and unmount, including previews whose decoding is still pending.

**Extract information** requires an accepted image and an explicit click. It
currently displays an unavailable notice. It makes no API call, generates no
extracted data, and saves nothing. The `extract` handler in
`components/scanner/use-card-scanner.ts` is the future Phase 3 integration point.

`npm test` includes six scanner tests covering real format fixtures, MIME spoofing,
size boundaries, corrupt images, capture/upload selection, preview, replacement,
removal, canceled selections, loading controls, no extraction network requests,
and object URL cleanup. React interaction tests use jsdom with Sharp decoding
fixtures; production uses the browser decoder.

Manual device checks:

1. Sign in and open `/scan` on desktop and a phone.
2. Select each supported format; confirm the preview and file details.
3. Use Take photo on a supported phone; confirm the captured image previews.
4. Replace/retake, cancel the picker, and remove; check the existing preview is
   preserved or cleared as appropriate.
5. Try an empty file, a file over 10 MB, and a text/PDF file renamed to `.jpg`.
6. Click Extract; confirm only the unavailable notice appears and nothing is sent.
7. Check keyboard focus, validation announcements, and mobile layout.

Phase 2 validation (2026-10-05): all 10 tests pass (four foundation tests and six
scanner tests), lint and build pass. The protected scan page was opened in Chrome
using the existing signed-in session. At a 375 px mobile viewport, no horizontal
overflow was detected and all scanner buttons measured 44 px high. Browser file
chooser automation was blocked because the ChatGPT extension does not have local
file access; camera/upload interactions and decoding were verified through the
automated component tests. A physical phone camera remains a manual device check.
The browser automation permission does not affect normal user file selection.

## Phase 1 verification snapshot (2026-10-05)

- Lint and production build pass.
- Four foundation tests pass, including migration/RLS checks in PostgreSQL.
- Configured hosted Auth endpoint and public configuration pass the live probe.
- Production HTTP checks pass for anonymous redirects, login rendering,
  no-store headers, and rejection of a forged session cookie.
- Hosted Data API returns `PGRST205` for `cards`; its table is not exposed yet.
  Migration application and live database/storage verification are blocked by
  missing project migration credentials. No hosted schema was changed.
- Successful sign-in/refresh/sign-out and live two-user isolation are blocked by
  missing disposable test-account credentials.
- Docker's Linux engine is stopped, so a full local Supabase stack was not
  verified. Embedded PostgreSQL tests ran independently of Docker.
- No browser is connected to the UI automation tools; interactive browser and
  mobile visual checks remain unverified.

Implementation follows the official [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
and [Storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control).
