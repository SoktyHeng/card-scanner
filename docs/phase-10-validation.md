# Phase 10 — Release validation record

Status: automated tooling implemented; full release sign-off pending. Never mark
an unperformed check as passed. Keep private images, expected card values and
credentials out of Git, CI logs and issue attachments. Computer/browser control
is disabled by user preference; device checks below require a human tester.

## Automated checks

CI is defined in `.github/workflows/ci.yml`. Pull requests, pushes to main/master
and manual runs install locked dependencies on the Node version in `.nvmrc`, then
run lint, tests and a production build. Actions are pinned to commit hashes,
repository permission is read-only, checkout credentials are not retained, and
there are no live-account or AI secrets in the workflow. Live paid AI/Supabase
checks are terminal-only, opt-in operations, not automatic PR steps.

Before release, record the commit, date, Node version and results for:

```bash
npm ci
npm run lint
npm test
npm run build
# With a running production build and configured test Supabase project:
APP_BASE_URL=http://localhost:3000 npm run verify:app
APP_BASE_URL=http://localhost:3000 npm run verify:supabase
# Optional paid fictional-image smoke checks:
npm run verify:ai
```

Set the GitHub `Lint, tests and production build` check as a required branch
protection check once the first hosted run completes. No hosted CI run or branch
protection change is claimed by adding the workflow locally.

## Physical device matrix

Use fictional physical cards, two disposable accounts and a test project. Record
actual device, OS/browser version, date, tester and evidence for each row. All
rows are initially **pending** because no physical devices have been tested.

| Device/browser | Capture/upload and preview | Front/back replace/remove/cancel | Review/save and retry | Search/edit/archive/restore/delete |
| --- | --- | --- | --- | --- |
| iPhone / Safari | Pending | Pending | Pending | Pending |
| Android / Chrome | Pending | Pending | Pending | Pending |

Test native camera permission denial/cancellation, photo-library selection,
portrait/landscape rotation, 320px width and zoom, unsupported HEIC, empty/corrupt
images and the 10 MB limit. Extract only after pressing Extract. Test front-only
and front/back cards, correct/add/remove fields, low-confidence unknown fields,
review confirmation, duplicate View existing/Save anyway/Cancel and session
expiration. Disconnect the network during extraction and saving; restore it,
retry and confirm exactly one final record with the correct original images.
For permanent deletion use only a disposable fictional record and confirm intent.
Record any partial failure and verify the archived record remains recoverable.

## Accessibility matrix

| Environment | Keyboard/focus | Announcements/labels | Zoom/layout/reduced motion |
| --- | --- | --- | --- |
| Desktop keyboard-only | Pending | Pending | Pending |
| macOS/iOS VoiceOver + Safari | Pending | Pending | Pending |
| Android TalkBack + Chrome | Pending | Pending | Pending |

Complete sign-in → capture/upload → preview → extraction → review → save → detail
→ edit → archive/restore → delete. Check visible focus, no keyboard traps, dialog
focus entry/return, label/value reading, pending/error announcements, validation
focus, custom-field addition/removal and duplicate controls. With two images,
verify only the visible face is announced and flip controls work by keyboard.
Check 200%/400% zoom and reduced motion. Automated DOM tests do not prove actual
screen-reader usability. Document defects with steps, expected/actual behavior
and severity; fix release-blocking issues and rerun affected rows.

## Representative real-photo AI evaluation

Use photos of fictional physical cards or explicit permission for AI processing.
Include business, employee, membership and unusual layouts; clear/blur/glare,
small text/rotation and Khmer/English. Start with multiple photos in each group;
record sample counts and limitations, not a claim of statistical accuracy.
Ground truth must be reviewed by a human before running the evaluator.

1. Copy `docs/ai-evaluation.example.json` to an ignored directory such as
   `test-results/private-photos/manifest.json`.
2. Photograph the fictional example card and replace its image path. Add cases
   with unique nonpersonal IDs, capture type, card type, language and conditions.
3. Supply **every** standard field, using null for absent values, and the complete
   expected custom-field array (`label`, `key`, `value`). For ambiguous values use
   null labels and `unknown_field`. Paths are relative to the manifest. Optional
   `backImage` exercises the application's front/back merge behavior.
4. Set `permittedForAiProcessing` to true only for permitted fixtures. Review the
   configured provider's retention policy before sending personal information.
5. Run explicitly (this consumes provider quota and transmits those images):

```bash
npm run evaluate:ai -- test-results/private-photos/manifest.json --send-to-provider
```

The evaluator validates all manifests/images before any provider call, uses the
existing extraction abstraction and schema, and does not write database records.
It supports at most 100 cases per run and the existing image size/decode limits.
Results go to ignored `test-results/ai-evaluation/report-TIMESTAMP.json` with file
mode 0600. Reports contain provider/model, timestamp, case metadata, latency,
matched-check counts, missing/incorrect/invented field identifiers and correction
counts; no card values, local image paths, raw OCR or provider payloads. Use only
nonpersonal case IDs. Reports still reveal model and scenario metadata: review
before sharing. Do not upload private fixtures as CI artifacts.

Matching preserves exact values after NFC/edge-whitespace normalization; only
email casing is ignored. Custom-field labels, keys and values must match; order
is ignored, repetitions count separately. This is intentionally stricter than a
human semantic evaluation. Null-field matches contribute to matched-check counts,
so that count is not an OCR precision score. A mismatched custom field counts as
one missing and one unexpected value. `correctionsNeeded` is a mismatch count,
not measured editing time. Inspect failures privately, record actual user edits
and label false evaluator mismatches separately. Latency excludes fixture
preparation and includes extraction and validation. Exit status is nonzero for
any failed case. No automatic paid retries occur.

Current real-photo evaluation: **pending — permitted physical photographs have
not been supplied**. Existing five synthetic scenarios remain smoke checks only.

## Hosted deployment validation

Current status: **pending — user confirmed no deployment exists**.

After deploying to a test HTTPS origin, run:

```bash
npm run verify:deployment -- https://YOUR-DEPLOYED-HOST
```

This unauthenticated check uses 15-second request deadlines, verifies HTTPS login,
HSTS/security headers, local protected-route redirects/no-store caching, anonymous
API denial and cross-site/spoofed-forwarded-host denial. It sends no images or
credentials and does not save records. A missing HSTS header fails: configure it
at the HTTPS host/proxy. The script cannot prove internal proxy configuration,
actual upload duration limits or edge throttling; record these separately:

| Hosting check | Evidence to collect | Status |
| --- | --- | --- |
| HTTPS/HSTS and private caching | Deployment verifier output; HTTP→HTTPS redirect check | Pending |
| Trusted proxy headers | Host/X-Forwarded-Proto overwritten by trusted ingress; caller X-Forwarded-Host not trusted | Pending |
| Upload/request timeouts | Platform permits 10 MB per image plus multipart overhead, two-image uploads and 120-second extraction with response overhead | Pending |
| Edge abuse controls | Document hosting limits and rate-limit response; process-local counters do not coordinate replicas | Pending |
| Hosted RLS/private storage | Read-only audit and two-account verifier on test project | Previously passed locally against hosted Supabase; repeat for release |
| Password security | Auth setting/advisor evidence; leaked-password protection enabled where plan supports it | Pending; last audit showed disabled protection |
| Provider privacy/retention | Provider/model policy and configured retention behavior | Pending |

Do not change hosted Auth settings or migrate production without an appropriate
reviewed deployment action. No such changes were made for this local phase.

## Sign-off record

Copy this template for each release. Preserve earlier dated records.

- Commit/date/tester:
- CI run URL and result:
- Supported Node / lint / tests / build results:
- Local production HTTP result:
- Physical-device matrix results:
- Screen-reader/keyboard results:
- Real-photo report path, sample counts, corrections and latency summary:
- Deployed HTTPS check and hosting configuration evidence:
- Supabase isolation/advisor and provider-retention evidence:
- Open defects, severity, owner and next action:
- Release decision: pending / approved (with rationale):

Phase 10 is complete only when the automated checks pass and manual/hosted
results are recorded, with failures fixed or explicitly tracked. Pending rows
remain pending; tooling alone does not constitute full production sign-off.
