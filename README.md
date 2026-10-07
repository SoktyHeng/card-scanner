# Card Scanner — Phases 1–3

Next.js 16 App Router, strict TypeScript, Tailwind 4, shadcn/ui, Supabase
authentication, a dashboard, camera/upload preview, and authenticated AI extraction.
Editing/review, saving scans, and card-management actions are reserved for later phases.

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

`POST /api/cards/extract` accepts multipart form data with exactly one `image`
file. It verifies the cookie session using Supabase `getUser()` before reading
the body, rejects foreign browser origins, bounds the streamed body (10 MB plus
64 KB multipart overhead), checks signatures and file size, and fully decodes
with Sharp. It accepts original JPG/JPEG, PNG, or WEBP content even if browser
MIME is wrong. Empty, corrupt, animated/multipage, unsupported, over-10-MB, or
over-40-megapixel images are rejected. The pixel limit bounds decoder resource use.
The original supported bytes are sent without changing visible content.

Success: `{ "success": true, "data": { ... } }`. Failure:
`{ "success": false, "error": { "code": "...", "message": "..." } }`.
Responses are private/no-store. Status codes include 400 malformed upload,
401 missing/invalid session, 403 foreign origin, 413 size, 422 invalid image,
429 provider rate limit, 502 provider/invalid output, 503 configuration/auth
outage, and 504 timeout. Errors and logs never include provider bodies, card text,
images, keys, or tokens. Only operation names and safe error codes are logged.

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
Successful results show read-only values, confidences, extra fields, and source
text. Empty results ask for a clearer photo. The validated result object remains
in React state for the Phase 4 integration; it clears on replacement/removal,
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
