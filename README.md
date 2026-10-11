# Card Scanner

Next.js 16 App Router, strict TypeScript, Tailwind 4, shadcn/ui and Supabase.
Authentication, front/back capture and upload, AI extraction, mandatory review,
private image storage, card management, keyword search and duplicate detection.

## Browser-memory caching verification — 2026-10-11

- Card lists (including search, filters, sorting, archive state and page) and
  dashboard counts/recent cards are fresh for **45 seconds**. Card details are
  fresh for **30 seconds**. Expired data can remain visible for up to 30 seconds
  while a bounded background request loads its replacement.
- Each mounted workspace owns a memory cache keyed by user and resource, capped
  at 80 cached entries. It deduplicates pending reads and keeps signed image links
  by owner/path until 30 seconds before expiry, renewing earlier when needed to
  cover a data-cache lifetime. List, detail and edit image views share the links.
  Nothing is persisted to localStorage, sessionStorage or IndexedDB.
- Save, edit, archive, restore and delete invalidate cached data, including
  uncertain mutation responses. Deletion also clears image links. Session/account
  changes clear the cache and block old-account reads; token expiry clears it.
  Other tabs receive invalidation signals without receiving card contents or
  signed URLs. Restoring a document from browser back/forward cache clears it too.
- `/api/workspace` verifies identity, validates queries and uses owner-scoped RLS
  reads. HTTP responses stay `private, no-store`; server-side card-detail ownership
  and 404 checks remain. The edit form still loads authoritative current data.
- Node 24: **163 tests passed** (87 general/UI/PostgreSQL and 76 server), lint,
  strict TypeScript and the default Turbopack production build passed. Tests cover
  repeat-navigation cache hits, background refresh without a loading flash, key
  separation, expiry, stale-response fencing, mutation/session clearing, bounded
  entries and image-link reuse/renewal. The build runs in a temporary checkout so
  it does not disturb an existing server.
- Live production HTTP: owner list/dashboard/detail reads passed; a second
  disposable account received 404 for the owner's detail and anonymous workspace
  reads received 401. Existing production HTTP checks passed protected routes,
  forged-session denial, mutation denial and server-secret browser-bundle checks.
  The temporary production server was stopped and any temporary fixture removed.

Repeat visits within the freshness window skip the data API. The first visit,
hard reload and background refresh still depend on Supabase latency. Restart an
already-running server and reload the browser to pick up the new route/provider.
Physical-device and deployed-browser acceptance remain part of the release checks.

## Navigation performance verification — 2026-10-11

Page reads use Supabase signature-verified claims and React's request-scoped
cache to share the session/client between a layout and its page. Account changes
and card mutations retain authoritative `getUser()` checks. User data and
sessions are never placed in a shared persistent cache. Card lists sign owned
thumbnail paths in one storage request for the visible 24 cards; an unavailable
image does not hide the card. Protected pages have an accessible loading boundary.

- Node 24: all **152 tests passed** (78 general/UI/PostgreSQL and 74 server),
  including real cryptographic forged-token rejection, invalid/expired claims,
  owner-scoped batch signing, pagination and storage failure. Lint, TypeScript
  and production build passed.
- Authenticated HTTP checks against the running development server: Account
  **40–63 ms**, Scan **31–45 ms**, Cards **1.215–3.891 seconds** including a first
  request. Anonymous Account access redirected to login. These are a small local
  sample, not production benchmarks or a guarantee for other network conditions.
- Before the change, the same check observed Account at 3.922 seconds on its
  first request and 186 ms warm, Scan at 1.667 seconds, and Cards at 1.940 seconds.
  Cold compilation and changing network latency mean the samples cannot establish
  a precise speedup. Card database/storage round trips still affect latency.

For deployment, use an optimized production build (`npm run build`, then
`npm start`) and place application hosting close to the Supabase region. Loading
feedback makes navigation responsive while requests finish; it does not remove
remote data latency. Physical-device, real-photo and deployed release checks
remain pending as documented below and in the phase-specific verification.

## Core verification snapshot — 2026-10-10

All nine phases have implementation code. Automated checks, live two-account
isolation, hosted database/storage auditing and synthetic live AI checks pass.
Physical-device and real-image release checks remain below.

- Restored missing development dependencies. Added `.nvmrc` and Node engine
  requirements after Node 23 hung a scanner interaction test; Node 24.21.0
  completes the suite.
- `npm test`: **124 passed**, zero failures (63 general/UI/PostgreSQL tests and
  61 server tests). The complete mutation workflow uses controlled API fixtures;
  database tests execute the actual migrations in embedded PostgreSQL.
- `npm run lint` and `npm run build`: passed on Node 24.21.0.
- Production HTTP verification: protected pages, login labels, security headers,
  anonymous/forged-session mutation denial and configured server-key browser
  bundle checks passed.
- Live Supabase: Auth health and anonymous denial passed for `cards`,
  `card_images`, `search_cards` and `save_card_with_images`. The live verifier now
  includes the front/back metadata and transactional-save access checks; the
  read-only metadata audit includes those objects too.
- Two distinct disposable accounts passed live sign-in, refresh, verified-user,
  CRUD/search/duplicate comparison, ownership reassignment denial, private
  storage CRUD/signing, cleanup and sign-out. Extended checks passed the
  transactional front/back metadata RPC, cross-user metadata denial and forged
  RPC rollback. With `APP_BASE_URL=http://localhost:3100`, the running production
  app also passed owner detail/restore and cross-user detail/archive/delete
  denial. The temporary verifier record/image were removed successfully.
- Hosted read-only audit through the existing Supabase dashboard session:
  RLS is enabled on `cards`, `card_images` and `storage.objects`; all 11 policies
  enforce the expected owner predicates with no additional broad policies.
  Authenticated table grants match the migrations and contain no TRUNCATE,
  TRIGGER or REFERENCES privileges. The bucket is private with a 10 MB limit
  and JPEG/PNG/WEBP allowlist. Search/save RPCs are security invokers with a fixed
  search path, authenticated execution and no anonymous execution. Security
  Advisor shows zero errors and one warning for disabled leaked-password
  protection. Supabase CLI remains unlinked without an access token; the hosted
  audit was completed through the dashboard without changing schema or policies.
- `npm run verify:ai`: **5/5 live synthetic scenarios passed** with the configured
  NVIDIA provider: business, membership, employee, unlabeled code and Khmer.
  Expected standard/custom values were preserved, unavailable contact values
  stayed null, and the unlabeled code remained a low-confidence unknown field.
  Generated images and the timestamped report are in ignored
  `test-results/live-ai/`. This small sample does not establish accuracy on
  photographs, blur, glare or arbitrary card layouts.
- Live Chrome with an existing signed-in session: uploaded a generated,
  nonpersonal business-card fixture, previewed it, ran the configured NVIDIA
  provider, reviewed standard/custom fields and confidence, corrected a value,
  removed/added custom fields, confirmed saving, displayed the saved original
  image, edited the saved record, archived/restored it and found it by keyword
  search. A second extraction displayed a duplicate warning for matching email
  and phone; cancelling retained the review without creating a second card.
  The sole saved fixture, `Verification Fixture — John Smith`, was left archived
  for review. This verifies one synthetic image, not general OCR accuracy.
- `npm audit --omit=dev`: zero known production vulnerabilities. The full audit
  reports five high findings from one unpatched `braces` advisory propagated
  through the ESLint tooling dependency chain. No framework downgrade or forced
  audit fix was applied. See
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Still required before full production sign-off:

1. Test physical Android/iOS camera capture, mobile Safari/Chrome and screen
   reader behavior, including review, duplicate warnings and archive/delete.
2. Test permitted real photographs with different layouts, blur, glare and Khmer
   text. The live synthetic scenarios are useful smoke checks, not a statistical
   OCR evaluation.
3. Resolve the remaining hosted leaked-password-protection warning where the
   project plan supports it, and verify deployed HTTPS/proxy/timeouts/abuse
   controls described in Phase 9.

To repeat live checks, configure two distinct disposable accounts in
`.env.local`, start the app, then run:

```bash
APP_BASE_URL=http://localhost:3000 npm run verify:supabase
npm run verify:ai
```

The Supabase verifier creates and cleans one synthetic card/image fixture;
use a test project. The AI verifier consumes provider quota and sends only
generated fictional images, with no database writes. For reliable Khmer fixture
rendering, set `VERIFY_KHMER_FONT_FILE` to an installed Khmer font. On this Mac,
verification used `/System/Library/Fonts/Supplemental/Khmer Sangam MN.ttf`.
No passwords, API keys, tokens or provider payloads are printed by the scripts.

## Incremental roadmap — Phases 10–17

Phases 1–9 have implementation code. Front/back scanning and duplicate warnings
already exist. Phase 10 has automated tooling implemented with release checks
pending. Phase 11 has password-flow code and hosted Auth/email checks completed
against the localhost production app;
Phase 12 filters/sorting are implemented and validated; Phases 13–17 are
**planned**. Full production sign-off requires the checks
in the latest verification above. Older verification snapshots below are historical.

Implement these phases in order. [AGENTS.md](AGENTS.md#79-incremental-roadmap-after-phase-9)
contains the detailed tasks and completion criteria. For each phase, run relevant
tests, lint and production build, preserve owner isolation and human review,
version any migrations, and update this README with dated verification evidence.

| Phase | Planned scope | Completion criteria |
| --- | --- | --- |
| 10 | Release validation and automated checks | Physical Android/iOS camera and mobile-browser journeys, keyboard/screen-reader behavior, representative real-photo extraction and deployed security settings are verified; CI runs lint, tests and build. |
| 11 | Password recovery and password changes | Users can recover access by email and change passwords securely; SMTP, redirects and expired-link handling are verified. |
| 12 | Card filters and sorting | Keyword search combines with card type, company, date and archive filters; newest/oldest and name sorting persist through URLs and pagination. |
| 13 | CSV and vCard export | Selected cards or all matching results export safely to spreadsheets and contacts; CSV preserves custom fields and exports enforce ownership. |
| 14 | Secure draft recovery | Users can opt in to resume images and corrected review fields after reload, with private owner-scoped storage, retention and discard controls. |
| 15 | Khmer and English interface | Language selection covers navigation, forms, messages and accessibility announcements; card contents remain as written. |
| 16 | Consistent Cambodia dates | Dashboard daily counts, displayed dates and date filters use Asia/Phnom_Penh consistently while database timestamps remain UTC. |
| 17 | Tags, notes and favorites | Users can organize private cards with tags/favorites, write notes and filter by organization metadata without changing original AI data. |

### Phase 10 — Release validation and automated checks

**Status (2026-10-10): automated tooling implemented; full phase sign-off pending.**

- [CI workflow](.github/workflows/ci.yml) runs on pull requests, pushes to main/master
  and manual dispatch. It uses Node from `.nvmrc`, `npm ci`, lint, tests and build,
  with pinned actions, read-only permissions and no live-account or AI secrets.
  Configuration follows the official [setup-node](https://github.com/actions/setup-node)
  and [checkout](https://github.com/actions/checkout) documentation.
- `npm run evaluate:ai -- MANIFEST --send-to-provider` evaluates permitted physical
  photos using complete human-reviewed ground truth, including optional back
  images. The explicit flag is required before images can be transmitted or paid
  requests made. Reports record provider/model, case conditions, field mismatches,
  corrections and latency without card values or raw OCR. Reports/fixtures stay
  in ignored `test-results/`; this command never writes cards to Supabase.
- `npm run verify:deployment -- https://YOUR-HOST` checks HTTPS login, HSTS/security
  headers, private protected-route redirects and anonymous/cross-site API denial.
  Requests have 15-second deadlines and transmit no images or credentials.
- [Release validation record](docs/phase-10-validation.md) provides physical-phone
  and screen-reader matrices, real-photo evaluation instructions, hosting checks
  and a sign-off template. A fictional [manifest example](docs/ai-evaluation.example.json)
  is provided for photos you take of fictional cards.

Local verification on Node 24.21.0: clean `npm ci`, **130 automated tests**
(69 general/UI/PostgreSQL/tooling + 61 server), lint, production build and
production HTTP verification passed. CI YAML parses; the example manifest
validates; the evaluator rejects missing transmission consent before contacting
AI. New tests cover ground-truth/permission validation, missing/incorrect/invented
values, private reports, Khmer/email comparison, safe deployment origins, HSTS,
caching and cross-site denial. Deployment tests use controlled responses and do
not claim a real hosted check. The existing five high development-tool audit
findings remain; no forced dependency downgrade was applied.

**Still pending:** actual hosted CI run/branch protection, physical Android/iOS
camera and mobile browsers, VoiceOver/TalkBack and keyboard usability, permitted
real photographs, provider-retention review and hosted HTTPS/proxy/timeouts/edge
limits/Auth settings. The user confirmed the app is not deployed yet. No live AI
quota was consumed or hosted settings changed in this phase. Earlier synthetic
AI and Supabase results remain historical evidence, not a real-photo sign-off.
Computer/browser control was not used. Phase 11 implementation is recorded below;
Phases 12–17 remain unimplemented.

### Phase 11 — Password recovery and password changes

**Status (2026-10-10): application flows and hosted Auth/email acceptance passed against localhost.**

Login now offers Forgot password. `/forgot-password` requests a reset email with
neutral account-existence responses. The supplied recovery email template opens
`/auth/recovery`; the user presses Continue before the token is verified with
Supabase, preventing GET-only mail scanners from consuming it. Successful recovery
creates a verified session and a signed 15-minute user-bound HttpOnly cookie.
`/auth/new-password` and its action require both; ordinary sign-in alone cannot
bypass recovery verification. Redirects are fixed local routes, and invalid,
expired, malformed or wrong-type links show controlled errors.

The signed-in header links to `/account`, where changing a password requires its
current value through explicit sign-in against the verified account and Supabase's
`current_password` option. New passwords require
12–128 characters and matching confirmation. Failed updates retain inputs for
retry; confirmed updates clear them, clear recovery permission and request global
sign-out. A sign-out failure reports that the password was already updated.
Successful actions redirect to a password-updated page; incomplete global sign-out
offers a retry there. Same-origin checks, session verification, protected Account
routes and safe return
URLs preserve the existing authentication protections. No schema migration or
service-role client was added.

Server-only `APP_SITE_URL` and `AUTH_RECOVERY_SECRET` are documented in `.env.example`;
local ignored `.env.local` values were configured without displaying the secret.
Production must use its exact HTTPS origin and a protected random secret shared
across replicas. The local Supabase config now includes recovery redirect URLs,
the email template and a 12-character password minimum. These local settings do
not alter hosted Supabase. See [setup and acceptance guide](docs/phase-11-passwords.md)
and [recovery email template](supabase/templates/recovery.html). The flow follows
[Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
and [email template documentation](https://supabase.com/docs/guides/auth/auth-email-templates).

Verification: **144 automated tests** (74 general/UI/PostgreSQL/tooling + 70 server),
lint, production build and local production HTTP checks passed on Node 24.21.0.
New coverage includes neutral email responses, OTP/session verification, recovery
grant tampering/expiry/wrong-user denial, confirmation/current-password validation,
actual SDK request payloads with controlled HTTP responses, retries, cleanup and
sign-out failures. HTTP checks verify anonymous Account/new-password denial,
invalid recovery links, labeled reset forms and configured recovery-secret values
absent from generated browser JavaScript. No computer/browser control was used.

Read-only live page checks passed with the configured disposable user: Account
access, ordinary-session rejection at the reset page, forged/wrong-user/expired
grant denial and reset-form access with a locally test-issued matching grant.
This did not consume an email token or change passwords. Repeat with:

```bash
APP_BASE_URL=http://localhost:3000 npm run verify:password -- --check-pages
```

An opt-in hosted password-mutation test is available:

```bash
npm run verify:password -- --change-disposable-password
```

It temporarily changes only `TEST_USER_A`'s disposable password, tests subsequent
sign-in, then restores and verifies the original; it does not request reset emails.
An ignored private recovery file protects against an unconfirmed restoration.
Live verification on 2026-10-10 upgraded the disposable test password to meet the
minimum and saved it privately in ignored `.env.local`. The hosted update endpoint
accepted an incorrect `current_password`, so Account changes now explicitly
reauthenticate against the server-verified user's email and check the returned
user ID before updating. The repeat live check passed incorrect password denial,
correct update, new-password sign-in, restoration and restored-password sign-in.
The private backup was removed. All 144 tests, lint and production build pass.

Hosted acceptance (2026-10-10): Gmail SMTP on port 587, the recovery subject/body,
exact `http://localhost:3000/auth/recovery` redirect, a 12-character password minimum
and a 30-email/hour Auth limit were applied and read back through the Management
API. Actual signup and reset emails reached a dedicated disposable Gmail alias.
The emailed link's GET did not consume it; Continue established recovery
permission; the real password Server Action updated the password and signed out;
new-password sign-in succeeded and the old password failed. Used-link denial and
an actual expired-link check passed. Expiry was temporarily 60 seconds for that
check, then restored to 3600 seconds and read back. Test passwords were restored,
temporary token/session files removed, and a private disposable-account credential
record retained under ignored `test-results/phase-11-hosted/` for future checks.
SMTP and Management API secrets were absent from browser JavaScript. Existing
authenticated-page and anonymous API checks passed again. No browser/computer
control was used. The localhost server was restarted with the production build
after the old server returned 404 for the reset route.

This verifies hosted Auth with a local application. A deployed HTTPS origin and
its recovery redirect still need verification once the app is deployed. Gmail is
the testing sender; production sender/domain planning and the existing Phase 10
physical-device, screen-reader, real-photo and deployment checks remain open.
Docker's separate local Auth/email stack was not needed for these hosted checks.

### Phase 12 — Card filters and sorting

**Status (2026-10-10): implemented and validated.**

The card list now combines keyword search, active/archived state, exact card-type
and company filters, inclusive created-date ranges and four sorts: newest,
oldest, name A–Z and name Z–A. Exact filters preserve punctuation literally and
are case-sensitive, as stated beside the controls. Dates use Cambodia calendar
days converted to UTC, with an exclusive next-day upper bound. Name sorts put
null names last in both directions; created time and ID resolve ties. PostgreSQL
collation determines name ordering. Timestamp sorts use ID as their tie-breaker.

Zod validates scalar query values, date validity/ranges and allowlisted sort
choices server-side. Invalid filters display a controlled error without running
the card query. Search, filters and sort are preserved in URLs, archive switches
and page links; applying changes resets pagination. Clear search preserves applied
filters; reset clears search, filters and sorting while preserving archive state.
The native GET form remains usable before hydration. Labeled controls, pending
states and useful filtered empty states support mobile and keyboard use.

Validation: **149 automated tests** (78 general/UI/PostgreSQL and 71 server), lint
and production build passed on Node 24.21.0. PostgreSQL tests cover both date
boundaries, tied values, null names, stable pages and RLS. Actual hosted checks
with two disposable users passed combined filters on keyword/plain list sources,
all four sorts, pagination, archives and cross-user denial. Only generated fixture
records were deleted afterward, and removal was confirmed. Production HTTP checks
also verified combined form values, archive/pagination URLs, filtered empty states
and safe handling of invalid/repeated parameters. The temporary verification
server was stopped afterward; no browser/computer control was used. No schema migration,
additional infrastructure or privileged/service-role client was required.
Existing Phase 10 deployment and physical-device release checks remain open.

### Phase 13 — CSV and vCard export

Export selected cards or the full matching collection, including results beyond
one page, with archive inclusion clearly indicated. CSV must preserve custom
field arrays and support Khmer/multiline content; vCard maps available contact
fields with documented handling of additional information. Test imports, escaping
and CSV formula protection. Export only authenticated owner data, bound size,
and exclude secrets, image paths and signed URLs.

### Phase 14 — Secure draft recovery

Offer opt-in server-side draft persistence for images, AI source and corrected
review fields. Use owner RLS and private storage, separate drafts from final cards,
and provide resume/discard, retention and cleanup. Avoid sensitive localStorage.
Verify interrupted writes, expiration, concurrent tabs and save retries. Restoring
must not automatically run extraction or bypass final review/duplicate warnings.

### Phase 15 — Khmer and English interface

Add language selection with a persistent nonsensitive preference and shared
translation catalog. Translate the complete interface, including errors and
screen-reader announcements, use readable Khmer fonts and appropriate document
language, and review translations with a Khmer speaker. Keep extracted names,
labels, values and schema keys unchanged when switching languages.

### Phase 16 — Consistent Cambodia dates

Replace the dashboard's current UTC-day count with Asia/Phnom_Penh day boundaries
and use the same policy for displayed dates and date filters. Retain UTC storage
and translate local boundaries to UTC query ranges. Test local midnight and
month/year transitions independent of browser/server time zones.

### Phase 17 — Tags, notes and favorites

Use owner-protected tag and card/tag tables, user-authored notes and a favorite
flag. Add editing and tag/favorite filters while preserving search/sort state.
Keep notes separate from OCR/AI source, define archive/delete behavior and include
organization metadata in CSV exports. Test relation ownership, concurrent updates
and cross-user denial. This phase follows the core usability improvements.

RAG, chatbots, embeddings and additional backend infrastructure remain outside
this roadmap. These plans extend the MVP without changing its completion criteria.

## Install and configure

Use Node.js 24.15+ (recommended; `.nvmrc` selects Node 24), or Node 22.22.2+.
The image/UI test dependencies require these versions. Node 23 is unsupported
and can hang the scanner interaction tests. Install development dependencies too:

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
**no service-role key**. Phase 3 requires server-only `AI_API_KEY` and `AI_MODEL`
(see below). Never commit `.env.local`, `.env`, account
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
the original file is preserved. Phase 3 independently revalidates and decodes
the image on the server before sending it to the AI provider.

The scanner has idle, validating, image-selected, extracting, extracted, and error
states. A valid image is previewed locally with filename, size, and dimensions.
Replace/retake and remove controls are available. An invalid replacement preserves
the earlier valid image. Native picker cancellation also preserves the preview.
Object URLs are revoked on replacement, removal, validation failure, cancellation,
and unmount, including previews whose decoding is still pending.

**Extract information** requires an accepted image and an explicit click. Selection
alone makes no API request. Extraction uploads to the authenticated endpoint;
card records and images are never saved in this phase.

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
6. Click Extract; confirm the loading state, then results or a helpful error.
7. Check keyboard focus, validation announcements, and mobile layout.

Phase 2 validation (2026-10-05): all 10 tests pass (four foundation tests and six
scanner tests), lint and build pass. The protected scan page was opened in Chrome
using the existing signed-in session. At a 375 px mobile viewport, no horizontal
overflow was detected and all scanner buttons measured 44 px high. Browser file
chooser automation was blocked because the ChatGPT extension does not have local
file access; camera/upload interactions and decoding were verified through the
automated component tests. A physical phone camera remains a manual device check.
The browser automation permission does not affect normal user file selection.

## Phase 3 — AI Extraction

Add these **server-only** values to `.env.local` and restart the server:

```env
AI_API_KEY=your_openai_api_key
AI_MODEL=your_supported_model_id
AI_PROVIDER=openai
```

Choose an OpenAI model available to your API project that supports image input,
the Responses API, and strict Structured Outputs. The app has no default model
and does not treat a ChatGPT subscription as API credentials. Follow the official
[image input guide](https://developers.openai.com/api/docs/guides/images-vision)
and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
Do not prefix either variable with `NEXT_PUBLIC_`. Missing configuration returns
a controlled `AI_NOT_CONFIGURED` error; builds do not require AI credentials.

For Moonshot, use a Moonshot API Platform key with:

```env
AI_PROVIDER=moonshot
AI_API_KEY=your_moonshot_api_key
AI_MODEL=kimi-k3
```

The Moonshot adapter uses `https://api.moonshot.ai/v1/chat/completions`,
base64 image input, and strict structured output. Use the direct model ID
`kimi-k3`, without the `moonshotai/` prefix. See the
[Moonshot K3 guide](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart).
Both providers validate final output with Zod before returning it for review.

For NVIDIA API Catalog, use an NVIDIA API key with:

```env
AI_PROVIDER=nvidia
AI_API_KEY=your_nvidia_api_key
AI_MODEL=meta/muse-glimmer-30b
```

The NVIDIA adapter uses the OpenAI-compatible Chat Completions endpoint,
multimodal image input, and JSON output that is validated with Zod before
being returned for review. It includes the extraction schema in the prompt and
sets an 8,192-token output budget. For Muse Glimmer it requests low reasoning
with `reasoning_effort` and `chat_template_kwargs.reasoning_strength`;
other NVIDIA models do not receive these model-specific options. Muse Glimmer
defaults to high reasoning, which can exceed a short request timeout. See the
[NVIDIA API reference](https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer).

For Azure AI Foundry, use the key for the deployment shown in Foundry and the
deployment endpoint:

```env
AI_PROVIDER=azure-foundry
AI_API_KEY=your_azure_foundry_key
AI_MODEL=gpt-5
AZURE_FOUNDRY_ENDPOINT=https://<resource>.services.ai.azure.com/openai/v1/responses
```

The Azure adapter sends the Responses API request to the configured deployment
endpoint with the `api-key` header. The endpoint must be server-side and the
key must never be prefixed with `NEXT_PUBLIC_`.

`lib/ai/card-extractor.ts` is the server-only entry point. Its `CardExtractor`
interface permits replacement of `OpenAiCardExtractor` without changing the route
or UI. The initial adapter uses direct HTTPS calls to OpenAI Responses, a strict
JSON schema derived from Zod, a 120-second provider timeout, and `store: false`.
This disables stored Responses; provider processing/retention still follows your
API account's data controls. There are no automatic retries or external lookups.
The image is sent to OpenAI only when the user explicitly clicks Extract.

All adapters share the 120-second extraction deadline. The route allows 150
seconds and the browser allows 180 seconds so upload, authentication, and a
controlled error response have time to complete. Configure the hosting
platform's request limit to support the route duration; a platform hard limit
can still terminate the request sooner. Timeouts remain bounded and can be
retried manually.

`POST /api/cards/extract` accepts multipart form data with exactly one front `image`
file and an optional `backImage`. It verifies the cookie session using Supabase `getUser()` before reading
the body, rejects foreign browser origins, bounds the streamed body (20 MB plus
64 KB multipart overhead), checks signatures and file size, and fully decodes
with Sharp. It accepts original JPG/JPEG, PNG, or WEBP content even if browser
MIME is wrong. Empty, corrupt, animated/multipage, unsupported, over-10-MB, or
over-40-megapixel images are rejected. The pixel limit bounds decoder resource use.
For AI analysis, photos above 2,048 pixels on either edge or 1 MB are prepared
as a JPEG working copy (quality 92 with full chroma resolution), keeping the
aspect ratio without upscaling. EXIF orientation is applied and metadata is
removed from these working copies. Smaller images without an orientation change
retain their original bytes. The original browser File remains untouched for
review and the Phase 5 handoff. Downsampling can reduce recognition of tiny text;
use a sharp photo with the card filling the frame.

Safe operational logs include original/AI byte counts, elapsed time, NVIDIA
response status and the stage reached when a request is aborted. No image bytes,
card text, API keys, provider messages or authentication tokens are logged.
The 120-second deadline is unchanged. NVIDIA endpoint load or difficult images
can still cause timeouts; an earlier successful synthetic test does not establish
reliability for every real card.

Success: `{ "success": true, "data": { ... } }`. Failure:
`{ "success": false, "error": { "code": "...", "message": "..." } }`.
Responses are private/no-store. Status codes include 400 malformed upload,
401 missing/invalid session, 403 foreign origin, 413 size, 422 invalid image,
429 provider rate limit, 502 provider/invalid output, 503 configuration/auth
outage, and 504 timeout. Errors and logs never include provider bodies, card text,
images, keys, or tokens. Logs contain operation names, safe error codes and
numeric timing/size/status metadata, plus the allowlisted NVIDIA request stage.

The contract requires every standard field and rawText (nullable), an
overallConfidence from 0 to 1, nullable scores in fieldConfidences, and extraFields
as an array of `{ label, key, value, confidence }`. Missing values and their
scores are null. Labels and values retain visible spelling; keys use snake_case.
Unclear fields require a null label, `unknown_field`, and confidence below 0.5.
Multiple unclear fields are allowed. Unknown properties, wrong types, missing
fields, non-array extras, inconsistent null/confidence pairs, and out-of-range
confidence fail validation. Refusals, incomplete responses, and malformed JSON
produce safe errors. Validation cannot prove OCR accuracy; human review remains
mandatory before saving in later phases.

The scanner disables duplicate extraction and image selection while analyzing,
offers cancellation/removal, and allows **Retry extraction** after failure.
Successful results now enter the Phase 4 review form described below. The validated
AI result remains separate in React state and clears on replacement/removal,
new extraction, or navigation. No local storage, database, or bucket writes occur.

### Test Phase 3

```bash
npm test
npm run lint
npm run build
npm run dev
# In a second terminal:
npm run verify:app
```

Tests cover schema/extra-field validation; real image formats, corrupt uploads,
size and pixel limits; session denial/auth failure; provider requests, timeouts,
refusals and failures; safe logs; explicit click, duplicate prevention, cancellation,
manual retry, empty results, and stale-response cleanup. Provider successes are
test fixtures, not simulated application behavior. Server tests use the
`react-server` condition to preserve `server-only` guards. `verify:app` checks the
running route against anonymous and forged cookie sessions without calling AI.

For a live extraction, sign in and open `/scan`, select a clear card image, and
confirm no extraction request appears in browser Network until you click Extract.
Check loading/disabled controls, standard values, source text, extras, unknown
labels, and confidence against the original. Test a business, membership, and
employee card. Use an unclear value and confirm the model does not invent its
meaning. Retry manually after a network/provider error. Replace/remove the image
and confirm old results clear. Sign out and verify POST returns 401 JSON. Check
Supabase: extraction must not create a card or storage object.

Phase 3 verification (2026-10-05): all 26 automated tests, lint, and production
build pass. Production HTTP verification passes for protected navigation and
extraction API denial of anonymous and forged sessions. Successful provider/API
tests use mocked providers and auth dependencies. Live successful AI extraction is blocked locally by missing
`AI_API_KEY` and `AI_MODEL`; live signed-in API verification also needs a
provisioned user/session. No account passwords were available to the test scripts.

## Phase 4 — Review Screen

After extraction, `/scan` shows `CardReviewForm` with all standard fields first,
including blank inputs for missing values, followed by editable additional fields.
Users can edit labels and values, add/remove fields, and convert a custom value
to a standard field. Conversion refuses an occupied target and keeps both values;
users can deliberately copy or clear the existing value before converting.

Confidence thresholds are high at 0.90+, medium at 0.70–0.89, and low below 0.70.
Low scores and unknown fields have visible review guidance. Manual additions and
corrections have null confidence, rather than an invented score. Existing AI scores
remain in the original extraction. Low confidence or an unknown label does not
prevent confirmation. Empty extraction results permit manual entry.

`lib/cards/review.ts` contains immutable editing/conversion helpers and a separate
strict Zod schema for human corrections. Blank standard values become null; email
format, value lengths, extra-field arrays/keys, and confidence bounds are validated.
Blank custom values require correction or removal. Khmer labels and values are
preserved; keys are generated internally with a safe fallback for non-Latin labels.

The single **Save card** action validates the draft and opens a **Save this card?**
dialog. **Cancel** keeps the draft without making a save request. **Confirm**
prepares `ReviewedScan` in the scanner hook and starts saving: original `File`,
original raw text, a copy of the validated AI extraction, and separate reviewed
data. Editing invalidates this handoff; unchanged retries reuse the submission ID.
Image replacement/removal, re-extraction, or leaving clears the review. Duplicate
warnings still pause saving before storage/database writes, and the server
revalidates all input. Saved-card editing retains its existing Save changes action.

The form uses labeled inputs, grouped fields, associated validation messages,
live status announcements, keyboard focus on new/converted fields and errors,
44-pixel controls, and a single-column mobile layout with two columns on larger
screens. Source text and image remain available for comparison.

Verification (2026-10-07): `npm test`, `npm run lint`, and `npm run build` pass.
Tests cover review validation, Khmer preservation, custom editing/addition/removal,
conversion conflicts, confidence boundaries, unknown and empty results, keyboard
focus, source preservation, confirmation invalidation and scan lifecycle cleanup.
UI behavior uses jsdom; physical phone and screen-reader checks remain manual.
Phase 4 adds no storage/database writes, migrations, or save endpoints.

## Phase 5 — Save Card

Choose **Save card** after reviewing the fields, then confirm in the dialog. `/api/cards` authenticates with
Supabase `getUser()` before reading the upload. It bounds the multipart body,
requires one original front image, an optional original back image and one JSON payload, validates both corrected and
original AI data with Zod, and rechecks the image signature, size, format and full
decode. It accepts no client owner, image path or arbitrary database columns.

The server derives `user_id` from the verified session and creates a UUID v5 from
that owner and a per-confirmation submission UUID. Retrying the same confirmed
draft therefore checks the same record, including after a lost response. New
corrections require confirmation again. In-flight guards prevent duplicate clicks;
the storage path and database primary key also protect concurrent submissions.

The original bytes are uploaded with `upsert: false` to private `card-images` at
`{user_id}/{card_id}/original.{jpg|png|webp}` before the row is inserted. Corrected
standard values and the `extra_fields` JSONB array are the final card data.
`raw_ocr_text`, `ai_extraction` and `ai_confidence` retain the original source
separately. The foundation migration already contains all required columns and
owner RLS policies, so Phase 5 needs no additional migration or service-role key.
All operations use the public key plus the authenticated user's session JWT.

Failed inserts trigger upload cleanup after checking whether the insert actually
committed. Cleanup failure is reported explicitly. If the commit check fails,
the image is preserved and the result is reported as uncertain; retrying the same
submission checks the existing row or finishes its earlier upload. No image is
overwritten. Draft values and preview remain after failure. Saving disables review,
replacement, removal and repeat submission until the operation returns.

Successful saves redirect to the minimal protected `/cards/[id]` page. It scopes
the query to the owner, shows corrected fields and custom values, and signs the
private image for five minutes. Missing/other-user cards use the same not-found
screen. Image-load errors offer a reload to renew the temporary URL. No list,
editing, archive, delete, or keyword search is introduced in this phase.

Verification (2026-10-07): 63 automated tests, lint and production build pass.
Tests cover unauthorized access, validation, original-byte upload, upload-before-
insert order, source preservation, duplicate suppression and idempotent retries,
storage/database/cleanup failures, and owner-scoped signed image access. Real
embedded PostgreSQL tests verify the existing database/storage ownership policies.
Production HTTP checks verify protected navigation and save/extract denial for
anonymous and forged sessions. Hosted Auth health and anonymous database denial
pass. Live signed-in saving, private image upload/signing and two-user API isolation
remain blocked by missing `TEST_USER_A/B_EMAIL` and `TEST_USER_A/B_PASSWORD`.
No hosted schema or user records were changed by this verification.

## Phase 6 — Card Management

Protected `/cards` lists active cards by default, with an archived view and
24-card pagination. Summaries link to full details and show available private
images through five-minute signed URLs. Details include all standard/custom
fields, original source text, and created/updated timestamps. Missing and
other-user cards share a not-found response. Navigation and dashboard entries
link to saved cards; keyword search remains for Phase 7.

`/cards/[id]/edit` reuses `CardReviewForm`, initialized from the saved corrected
values rather than the AI extraction. Standard confidence scores unavailable in
the saved record remain null. Custom fields can still be edited, added, removed,
or converted with conflict protection. The server validates corrections with Zod
and updates only standard columns and `extra_fields`. Original image path, raw
text, AI extraction/confidence, ownership and scan metadata are preserved.
Updates use `updated_at` to reject stale forms. Failed requests keep the draft;
an expired session offers sign-in in another tab.

The owner-scoped `/api/cards/[id]` PATCH route handles editing, archive and
restore. DELETE requires explicit confirmation from an accessible native modal.
Deletion archives first, removes the verified private image path, and then
deletes the record. A storage failure keeps the archived record; a database
failure after image removal reports partial completion and allows retry. Empty
storage-removal responses are checked before discarding the image path. A
concurrent row change prevents deleting that changed record. These operations
use verified sessions, the existing RLS policies, and no privileged client.
No migration is needed for Phase 6.

Verification (2026-10-07): 76 automated tests, `npm run lint` and
`npm run build` pass. Coverage includes corrected-data editing, preservation of
source data, stale edits, archive/restore, confirmed deletion, duplicate-click
prevention, deletion/storage/database failures, scoped list reads and mutation
validation. Embedded PostgreSQL tests verify active/archive transitions and
database/storage isolation. Production HTTP checks verify protected pages and
denial of anonymous/forged edit/archive/restore/delete requests.
Hosted Auth health and anonymous database denial pass. Live signed-in CRUD,
private storage cleanup/signing and two-user API isolation remain blocked by
missing `TEST_USER_A/B_EMAIL` and `TEST_USER_A/B_PASSWORD`. Physical-device and
screen-reader checks remain manual. No hosted schema or user records were changed.

## Phase 7 — Keyword Search

`/cards` has a labeled, mobile-friendly search form. Submitting searches the
saved name, company, phone, email, job title and card number using a
case-insensitive literal substring. The query lives in `q`; active/archived
links retain it, pagination retains both query and status, and changing or
clearing the query resets to page one. Search has an explicit submit action,
pending announcements, input validation, and useful no-results guidance.
The existing list skeleton includes placeholders for the search controls.

The server trims and validates queries with Zod (maximum 200 characters, no
internal control characters or repeated query parameters). Empty queries use
the existing owner-scoped list. Nonempty queries call `public.search_cards`
with a bound argument, then apply owner/archive filters, deterministic ordering,
and a 24-card page plus one look-ahead result. No user input is interpolated
into SQL or PostgREST filter expressions. PostgreSQL `ILIKE` searches escape
`%`, `_` and backslashes, so punctuation and wildcard characters remain literal.
The function is stable, uses `SECURITY INVOKER` and a fixed search path, derives
ownership from `auth.uid()`, and keeps the table's existing RLS in effect.
Only authenticated users may execute it. No AI or embeddings are involved.

Apply the version-controlled migration
`supabase/migrations/20261007093634_card_keyword_search.sql` before using search
on an existing Supabase project. Follow the migration workflow above and review
the dry run; never reapply an already recorded foundation migration. Database
types include the new RPC signature. Implementation follows the official
[database functions guide](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL pattern matching reference](https://www.postgresql.org/docs/current/functions-matching.html).

Verification (2026-10-07): all 83 automated tests, lint and production build pass.
Tests cover matching all six columns,
empty queries, case folding, Khmer, quotes/commas/parentheses, literal wildcards,
injection-like strings, archive filters, pagination, query validation and URL
state. Real embedded PostgreSQL tests execute the actual migrations under
authenticated roles and prove two-user isolation and anonymous denial. UI tests
cover submit/clear, validation, pending feedback and duplicate prevention.
The live verification script checks RPC availability and authenticated search
when disposable credentials are supplied.

The migration was applied to the linked hosted project after a CLI dry run
confirmed that it was the only pending migration. The CLI used its existing
cached connection; no environment credentials were exposed. Hosted Auth and
anonymous table/search denial pass. Live signed-in search and two-user API
checks remain blocked by missing `TEST_USER_A/B_EMAIL` and
`TEST_USER_A/B_PASSWORD`. No hosted user records were changed.
The hosted security advisor reports no search-function/RLS issues. Its existing
Auth warning about disabled leaked-password protection remains unchanged and
outside Phase 7.

## Phase 8 — Duplicate Detection

Saving a reviewed scan first checks the authenticated owner's existing cards,
including archived cards, before uploading the image or inserting a record.
The session-scoped Supabase client and existing RLS remain in effect. The server
reads only comparison fields in 200-row keyset pages, so matches beyond the
Data API's default row cap are checked too. No schema migration is required.
The work grows with the owner's collection size; this simple MVP approach
avoids new infrastructure or storing separate normalized columns.

Matching is deterministic. Emails are trimmed and lowercased without removing
aliases or dots. Phones lose only whitespace, parentheses, dots and hyphens
when the result is a single numeric phone with an optional leading `+`.
Country prefixes, leading zeroes, extensions and multiple numbers are not
inferred or merged. Both primary and secondary phones are checked, while their
original display values remain unchanged. Card numbers are trimmed and compared
case-sensitively, preserving punctuation and zeroes. Name + company requires
both values and compares case and whitespace consistently. Empty values do not
match; Unicode normalization preserves accents and Khmer text.

The focused, responsive warning says “Possible duplicate found”, lists each
matching card and all its reasons, and offers View existing, Save anyway and
Cancel. View existing opens a new tab to preserve the current review and image.
Cancel performs no save and returns focus to Save card. Save anyway rechecks
on the server and explicitly acknowledges the current warning. A fingerprint
binds that acknowledgement to the authenticated owner, submission, complete
corrected data and current matches; changed values or matches produce a fresh
warning. It is a stale-confirmation check, not an authentication credential.
Editing invalidates the warning and requires review confirmation again.
Pending requests prevent repeated submissions; failures retain the image,
draft and warning for retry. Duplicates are never automatically rejected.

Verification (2026-10-07): 92 automated tests, lint and production build pass.
Tests cover normalization, every matching rule, empty fields, secondary phones,
archives, paged owner-scoped reads, pre-upload warnings, acknowledgement and
rechecking, cancellation, failed checks, retry, and repeated-submit prevention.
Existing embedded PostgreSQL tests verify actual database/storage RLS isolation.
Production HTTP checks verify protected routes and anonymous/forged-session
save denial. Hosted Auth and anonymous database/search denial pass. Live signed-in duplicate
checks and two-user save flows remain blocked by missing `TEST_USER_A/B_EMAIL`
and `TEST_USER_A/B_PASSWORD`; no hosted records or schema were changed.
The following section records the subsequent Phase 9 audit.

## Phase 9 — Production Hardening

The audit checks verified sessions in server pages and API handlers, the absence
of privileged Supabase clients, owner predicates in every card operation,
database and storage RLS, strict Zod payloads, image content decoding, private
signed URLs, safe errors, and logging that omits card contents and tokens.
Read-only hosted metadata checks are reproducible with
`npx supabase db query --linked --file scripts/audit-supabase.sql`.

The hosted audit found that default Supabase grants had left authenticated
users with TRUNCATE, TRIGGER and REFERENCES privileges on `cards`. Migration
`supabase/migrations/20261007100951_production_card_grants.sql` revokes application
role privileges before granting only SELECT, INSERT, UPDATE and DELETE.
The existing owner policies remain in effect. This matters because
[PostgreSQL RLS does not cover whole-table operations](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
The migration was tested in embedded PostgreSQL, applied to the linked project
after a dry run confirmed it was the only pending migration, and checked through
live metadata afterward. No hosted card records were read or changed during the
metadata audit. RLS is enabled on `cards` and `storage.objects`; the image bucket
is private with a 10 MB limit and JPEG/PNG/WEBP allowlist. Search remains a
security-invoker function with no anonymous execution permission.

Scan, save and management endpoints now share an origin check. It supports
the public Host used by LAN/reverse-proxy deployments, rejects cross-site Fetch
Metadata and mismatched browser origins, and ignores caller-supplied
X-Forwarded-Host. Deployment proxies must overwrite Host and X-Forwarded-Proto
with the public host/protocol and enforce HTTPS. Scheme mismatches are rejected.
Every request still requires verified
authentication. Management JSON content types and edit timestamps are validated
more precisely. Multipart and JSON bodies have actual-byte bounds; images are
checked by content, fully decoded, restricted to one frame and 40 megapixels,
and limited to 10 MB. Large analysis images are resized independently of the
preserved original.

Expensive extraction now allows six attempts per authenticated account per
60-second window and one active request per account per Node process. Rejected
requests return controlled 429 errors with Retry-After before reading the body
or calling AI. Counters are bounded to 10,000 accounts and expired entries are
removed. Failed attempts release concurrency. The endpoint also enforces its
120-second extraction deadline if a provider fails to observe cancellation;
existing providers pass the abort signal to their HTTP requests. No Redis,
queue, additional service, or automatic retry loop was added. Supabase Auth's
own limits remain responsible for login abuse protection.

Expired-session scan/save errors offer sign-in in a new tab, preserving image
and review values. Management requests have a 60-second client deadline and
display allowlisted local error messages instead of upstream messages, malformed
responses or network diagnostics. Ambiguous mutations instruct users to reload
and check status. Save cleanup verifies object absence if storage returns an
empty deletion response; uncertain cleanup remains an explicit error. Existing
idempotent submission IDs, duplicate acknowledgement, stale edit protection,
source preservation and disabled pending controls remain covered by tests.

Responses add anti-framing, no-sniff, no-referrer and permissions-policy headers,
plus CSP frame-ancestors, base-uri and object-src restrictions. This is a limited
CSP, not full script isolation. `npm run verify:app` checks response headers,
protected routes, forged-session denial, and configured server key values against
generated browser JavaScript without printing those values.

Verification (2026-10-07): **101 automated tests**, `npm run lint`,
`npm run build`, and production HTTP verification pass. Production dependency
audit (`npm audit --omit=dev`) reports zero known vulnerabilities at this time.
Tests include real embedded PostgreSQL RLS/grants and storage-policy checks,
auth expiration, actual image decoding/size failures, provider/output/timeouts,
rate limits, safe errors, save cleanup, duplicate warnings and actions, labeled
camera/upload inputs, draft retention, and accessible pending/confirmation states.
The complete scan → review → save → detail → edit → archive → restore → delete
integration uses the actual handlers and Supabase SDK with deterministic AI and
Data/Storage API fixtures. It does **not** claim a successful live end-to-end scan.
Hosted metadata, Auth health, and anonymous database/search denial pass.

Remaining release checks and risks:

- Live signed-in session refresh/sign-out, revoked/expired sessions, two-user
  API isolation, storage cleanup/signing and complete live workflows are blocked
  by missing `TEST_USER_A/B_EMAIL` and `TEST_USER_A/B_PASSWORD`. Configure two
  disposable accounts and run `npm run verify:supabase`, then test the browser
  journey with each account. Never use real customer cards as test fixtures.
- No physical Android/iOS camera, mobile Safari/Chrome, or screen reader was
  available. Verify capture/upload/replace, keyboard focus, announcement order,
  320px layout, zoom, reduced motion, and the review/duplicate/deletion flows on
  those devices. DOM tests do not establish full accessibility compliance.
- Live AI accuracy, Khmer OCR, provider latency, and provider privacy/retention
  behavior were not exercised by the deterministic tests. Test representative
  permitted images with the deployed provider; human review remains mandatory.
- The hosted security advisor still reports disabled leaked-password protection.
  Enable it in eligible project Auth settings and rerun the advisor. No Auth
  Management configuration tool is available in this session, and SQL grants
  cannot change this Auth setting.
- Process-local extraction limits reset on restart and do not coordinate across
  replicas. Configure hosting/edge abuse limits and upload/read timeouts before
  scaling. Duplicate lookup cost grows with the owner's collection size.
- Storage and database writes are not atomic. A lost upload response, expired
  session during cleanup, or partial deletion can leave an orphaned image or an
  archived record. Controlled errors and stable submission IDs support recovery;
  uncertain outcomes retain images. Administrators must reconcile orphaned
  paths without bypassing owner access in the application.
- Signed image URLs are bearer links valid for five minutes. Avoid logging their
  query strings at the proxy or analytics layer; reload to renew an expired URL.
  Use HTTPS, private/no-store page caching, and keep server secrets out of public
  environment variables. The bundle check covers configured literal key values,
  not arbitrary secret transformations or every infrastructure log.

Phase 9 stays within the MVP; no advanced features or extra infrastructure were added.

## Field visibility in review, details and editing

Standard and custom fields with null, undefined, empty or whitespace-only values
are hidden initially. Empty field sections and source-text sections are omitted,
and saved details no longer show “Not provided” placeholders. Responsive grids
contain only visible fields. Empty cards explain how to enter information manually.
Review and editing offer a labeled field selector and Add field button to reveal
missing standard fields, reveal empty source custom fields, or add custom fields.
Visible inputs stay mounted when cleared; conversion reveals and focuses its
standard destination. Visibility is separate from the full draft and source data.
Existing save validation remains unchanged: empty custom fields must receive a
value or be removed, and validation reveals hidden invalid fields for correction.

## Front/back scanning (2026-10-08)

The front image is required and the back is optional. Front/Back controls have
separate previews and capture/upload/replace/remove actions. Each original image
uses the existing 10 MB content and decode validation. Changing either side
invalidates extraction and review; failed operations retain selected images and
the corrected draft. Removing one side keeps the other.

Extraction sends both labeled images in one provider request, obtains separately
validated side outputs and combines them deterministically. Exact agreements are
kept; differing standard values become labeled front/back additional fields and
the standard field stays empty for manual correction. Custom values retain side
labels, and unknown fields keep their unknown label and supplied confidence.
The original per-side text, AI data and images stay separate from corrected data.
The displayed overall score for two sides is the lowest supplied side score.

Apply `supabase/migrations/20261008073615_card_front_back_images.sql` before
deploying this application version. It creates owner-protected `card_images`,
backfills valid legacy front paths and adds the security-invoker
`save_card_with_images` RPC. Card and image metadata insert together or roll back
together; requests use the verified user's Supabase session, not a service role.
Uploads use `{user_id}/{card_id}/original.{ext}` for the front and `back.{ext}`
for the back. The private bucket and existing owner-folder policies protect both.
Known new uploads are cleaned after failed writes; uncertain commits or images
reused by concurrent retries are preserved and reported rather than destroyed.
Unchanged retries reuse the same submission ID and never upsert originals.

Details and editing display signed URLs valid for five minutes. With two images,
the image itself is a keyboard-operable flip button; Show front/Show back controls
and side announcements are also provided. The inactive face is hidden from screen
readers, and reduced-motion preferences disable the prolonged transition.
Single-image cards have no flip controls. Grid links continue to open details.
Permanent deletion archives first and verifies/removes every known image before
deleting the card; partial storage failure keeps the archived record for retry.

Tests cover conservative merging, all provider request formats, capture/review,
front-only and two-image transactional writes, RLS isolation, signed URLs, flip
controls and storage failure recovery. The front/back migration was applied to the
linked hosted project on 2026-10-08 after a missing RPC caused save failures.
Migration history is synchronized and anonymous RPC execution is denied. Live provider
accuracy/latency and live two-user checks remain unverified; disposable test-user
credentials are missing. Physical camera, visual 3D animation, mobile/tablet/
desktop browser and screen-reader checks remain manual because browser automation
is unavailable in this environment.

## UI refinements (2026-10-08)

The existing teal theme now has active-section navigation, consistent page
headings, mobile action layouts and a five-stage scan progress indicator. Search,
empty collections, duplicate warnings and archive/delete explanations use simple
wording. Full-card links, hidden empty fields with Add field, review requirements,
failure recovery and shimmer skeletons remain in place. Skeleton action layouts
match mobile controls, and reduced-motion preferences disable prolonged animation
and transitions throughout the interface. No dependencies or database changes were
added.

Automated checks cover active navigation, scan progress, accessible skeletons and
the existing review/save/management workflows. Rendered mobile, tablet and desktop
checks are unverified: browser automation could not start because its local
app-server executable is missing. A live signed-in workflow and physical camera
checks also remain manual; automated workflow tests use controlled service adapters.

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
