# Card Scanner Web Application

## 1. Project Overview

Build a production-ready web application that scans physical cards using a device camera or uploaded image, extracts information from the card using AI vision/OCR, allows the user to review and correct the extracted information, and stores the final structured data in Supabase.

The application must support cards with different layouts and different fields.

Examples include:

- Business cards
- Employee cards
- Membership cards
- Customer cards
- Supplier cards
- Event/contact cards
- Other custom cards

The system must not assume every card has the same structure.

The main workflow is:

```text
Camera / Image Upload
        ↓
Image Preview
        ↓
AI / OCR Extraction
        ↓
Structured Card Data
        ↓
Validation
        ↓
Review & Correction
        ↓
Save Image
        ↓
Save Card Data
        ↓
Search / View / Edit
```

---

# 2. Primary Goal

The application should allow a user to:

1. Sign in.
2. Scan a card using a phone or computer camera.
3. Upload an existing card image.
4. Preview the image.
5. Extract information from the card.
6. Detect common fields automatically.
7. Detect additional/custom fields automatically.
8. Review extracted values.
9. Correct incorrect values.
10. Add or remove fields manually.
11. Save the original image.
12. Save structured card information.
13. Browse previously scanned cards.
14. Search cards.
15. Filter cards.
16. Edit saved cards.
17. Archive or delete cards.

---

# 3. Technology Stack

Use the following stack unless there is a strong technical reason not to.

## Frontend

- Next.js latest stable
- TypeScript
- App Router
- React
- Tailwind CSS
- shadcn/ui

## Backend

Use Next.js server-side functionality.

Preferred:

- Route Handlers
- Server Actions where appropriate

Do not create a separate Node.js or .NET backend for the initial implementation.

## Database

Use:

- Supabase PostgreSQL

## Authentication

Use:

- Supabase Auth

## File Storage

Use:

- Supabase Storage

## Validation

Use:

- Zod

## AI

Use a multimodal AI model capable of reading images.

The AI implementation must be isolated behind a service abstraction so that the provider can be replaced later.

For example:

```text
lib/ai/card-extractor.ts
```

Do not tightly couple the application to one AI provider.

---

# 4. Development Principles

Follow these principles throughout the project.

## 4.1 Keep the architecture simple

Avoid introducing unnecessary:

- microservices
- queues
- Redis
- vector databases
- RAG
- event buses
- additional backend servers

unless there is a demonstrated requirement.

## 4.2 Prefer structured data

AI output must always be converted into validated structured JSON before use.

Never directly trust arbitrary AI-generated text.

## 4.3 Human verification is mandatory

AI results must never be written directly into the final card record without allowing user review.

The application must provide a review screen before saving.

## 4.4 Do not invent card information

When the AI cannot determine a field confidently:

- return null
- mark it as unknown
- reduce confidence
- require user confirmation

Never fabricate missing values.

## 4.5 Preserve source information

Keep:

- original image
- raw extracted text when available
- AI structured extraction
- final user-corrected data

This allows future reprocessing.

---

# 5. Application Architecture

Use approximately the following architecture:

```text
Browser
│
├── Camera
│
├── Upload
│
└── Card Management UI
        │
        ▼
Next.js
│
├── Authentication
├── Route Handlers
├── AI Extraction Service
├── Validation
├── Supabase Client
└── Business Logic
        │
        ├───────────────┐
        ▼               ▼
Supabase DB       Supabase Storage
        │
        ▼
Cards / Metadata / Images
```

---

# 6. Main Application Modules

Organize the application around the following modules.

## Authentication

Responsibilities:

- sign in
- sign out
- registration if enabled
- session validation
- protected routes

## Scanner

Responsibilities:

- camera capture
- file upload
- image preview
- front/back selection
- scanning state
- extraction request

## AI Extraction

Responsibilities:

- accept card image
- send card image to AI
- extract structured information
- normalize common fields
- identify unknown/custom fields
- return confidence scores

## Card Review

Responsibilities:

- display extracted data
- allow corrections
- allow field addition
- allow field deletion
- identify low-confidence fields

## Card Management

Responsibilities:

- create
- read
- update
- archive
- delete
- search
- filter

## Storage

Responsibilities:

- upload original card image
- retrieve image
- manage permissions

---

# 7. Recommended Project Structure

Use this as a guide:

```text
app/
├── layout.tsx
├── page.tsx
│
├── auth/
│   ├── login/
│   │   └── page.tsx
│   └── callback/
│       └── route.ts
│
├── dashboard/
│   └── page.tsx
│
├── scan/
│   └── page.tsx
│
├── cards/
│   ├── page.tsx
│   └── [id]/
│       ├── page.tsx
│       └── edit/
│           └── page.tsx
│
└── api/
    └── cards/
        └── extract/
            └── route.ts

components/
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── MobileNavigation.tsx
│
├── scanner/
│   ├── CardScanner.tsx
│   ├── CameraCapture.tsx
│   ├── ImageUploader.tsx
│   ├── ImagePreview.tsx
│   └── ScanActions.tsx
│
├── cards/
│   ├── CardList.tsx
│   ├── CardListItem.tsx
│   ├── CardDetail.tsx
│   ├── CardReviewForm.tsx
│   ├── ExtraFieldsEditor.tsx
│   ├── ConfidenceBadge.tsx
│   └── CardSearch.tsx
│
└── ui/
    └── shadcn components

lib/
├── supabase/
│   ├── client.ts
│   ├── server.ts
│   └── middleware.ts
│
├── ai/
│   ├── card-extractor.ts
│   ├── types.ts
│   └── prompts.ts
│
├── cards/
│   ├── card-service.ts
│   ├── card-schema.ts
│   └── card-normalizer.ts
│
└── utils/
    ├── image.ts
    ├── confidence.ts
    └── text.ts

types/
├── card.ts
└── database.ts
```

Do not create unnecessary folders before they are required.

---

# 8. Database Design

Use Supabase PostgreSQL.

## 8.1 cards table

Create a table approximately like:

```sql
create table public.cards (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    card_type text,

    name text,
    company text,
    job_title text,
    department text,

    email text,
    phone text,
    secondary_phone text,
    website text,

    card_number text,

    address text,

    raw_ocr_text text,

    extra_fields jsonb not null default '[]'::jsonb,

    ai_confidence numeric,

    scan_status text not null default 'completed',

    original_image_path text,

    is_archived boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

---

# 9. JSONB Extra Fields

Different cards may contain fields not present in the standard schema.

Store those fields in:

```text
extra_fields JSONB
```

Do not use a simple key/value object.

Use an array.

Example:

```json
[
  {
    "label": "Employee Code",
    "key": "employee_code",
    "value": "EMP-00123",
    "confidence": 0.97
  },
  {
    "label": "Branch",
    "key": "branch",
    "value": "Phnom Penh",
    "confidence": 0.94
  },
  {
    "label": "Membership Level",
    "key": "membership_level",
    "value": "Gold",
    "confidence": 0.91
  }
]
```

Each item must contain:

```text
label
key
value
confidence
```

Optional future fields:

```text
original_text
source_region
verified
```

---

# 10. Standard Fields

Normalize commonly used information into standard database columns.

The extraction model should attempt to populate:

```text
name
company
job_title
department
email
phone
secondary_phone
website
address
card_number
card_type
```

Only fields that are sufficiently common should become database columns.

Rare fields should remain in `extra_fields`.

---

# 11. Field Normalization

Different cards may use different labels for the same concept.

Example:

```text
Telephone
Tel
Phone
Mobile
Contact No
HP
Mobile No
```

Normalize them to:

```text
phone
```

Similarly:

```text
Position
Title
Designation
Job
Role
```

should map to:

```text
job_title
```

Examples for company:

```text
Company
Organization
Organisation
Employer
Business
```

should normally map to:

```text
company
```

Do not rely solely on string synonym matching.

Use semantic interpretation where needed.

---

# 12. Unknown Fields

If the AI detects a field that does not match a standard field:

1. Preserve the original label.
2. Generate a normalized snake_case key.
3. Extract the value.
4. Return confidence.
5. Add it to `extra_fields`.

Example source:

```text
Member ID: ABC-10023
```

Result:

```json
{
  "label": "Member ID",
  "key": "member_id",
  "value": "ABC-10023",
  "confidence": 0.98
}
```

---

# 13. Unclear Fields

If the AI sees a value but cannot determine what it means:

Do not guess.

Use:

```json
{
  "label": null,
  "key": "unknown_field",
  "value": "ABC-7788",
  "confidence": 0.35
}
```

The UI must highlight such fields for manual review.

---

# 14. AI Extraction Contract

The AI extraction service must return structured data.

Use a TypeScript interface approximately like:

```ts
export interface ExtraField {
  label: string | null;
  key: string;
  value: string;
  confidence: number;
}

export interface ExtractedCard {
  cardType?: string | null;

  name?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  department?: string | null;

  email?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;

  website?: string | null;
  address?: string | null;

  cardNumber?: string | null;

  rawText?: string | null;

  overallConfidence?: number;

  extraFields: ExtraField[];
}
```

---

# 15. Zod Validation

All AI responses must be validated before being returned to the frontend.

Example:

```ts
import { z } from "zod";

export const extraFieldSchema = z.object({
  label: z.string().nullable(),
  key: z.string().min(1),
  value: z.string(),
  confidence: z.number().min(0).max(1),
});

export const extractedCardSchema = z.object({
  cardType: z.string().nullable().optional(),

  name: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  department: z.string().nullable().optional(),

  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  secondaryPhone: z.string().nullable().optional(),

  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),

  cardNumber: z.string().nullable().optional(),

  rawText: z.string().nullable().optional(),

  overallConfidence: z.number().min(0).max(1).optional(),

  extraFields: z.array(extraFieldSchema).default([]),
});
```

Invalid AI output must not crash the application.

Return a controlled extraction error.

---

# 16. AI Prompt Requirements

The AI prompt must clearly state:

```text
You are extracting structured information from a card image.

Identify common fields when present:

- name
- company
- job title
- department
- phone
- secondary phone
- email
- website
- address
- card number
- card type

For fields that do not match the standard schema:

- preserve the visible label
- generate a normalized snake_case key
- extract the corresponding value
- assign confidence from 0 to 1
- place them in extraFields

Rules:

- Do not invent information.
- Do not infer unavailable values.
- Preserve names as shown.
- Preserve phone country codes.
- Normalize email casing where safe.
- Return null for missing standard fields.
- Use unknown_field for unclear values.
- Prefer exact visible information over assumptions.
- Return structured JSON only.
```

---

# 17. Extraction Strategy

For the MVP use:

```text
Image
   ↓
Multimodal AI
   ↓
Structured JSON
```

Do not build separate OCR infrastructure initially unless required.

Later versions may use:

```text
Image
   ↓
OCR
   ↓
Rule-based detection
   ↓
AI semantic classification
```

---

# 18. Camera Capture

Support mobile scanning.

Initially use:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

This provides a reliable mobile-first implementation.

Later enhancement may use:

```ts
navigator.mediaDevices.getUserMedia()
```

Do not implement complex live camera controls until the basic upload workflow is stable.

---

# 19. Image Upload Requirements

Support:

- JPG
- JPEG
- PNG
- WEBP

Optional later:

- HEIC
- PDF

Validate:

- MIME type
- file size
- dimensions if needed

Recommended upload limit:

```text
10 MB
```

Do not trust browser-reported MIME type alone.

---

# 20. Image Preview

After selecting an image:

Show:

- preview
- replace image
- remove image
- extract button

Do not immediately call AI when an image is selected.

Allow the user to confirm first.

---

# 21. Scan States

Use explicit scanning states.

Example:

```ts
type ScanStatus =
  | "idle"
  | "image_selected"
  | "uploading"
  | "extracting"
  | "review"
  | "saving"
  | "completed"
  | "error";
```

The UI should clearly communicate current state.

---

# 22. Review Screen

The review screen is mandatory.

Display standard fields first.

Example:

```text
Name
[ John Smith ]

Company
[ ABC Technology ]

Job Title
[ Senior Engineer ]

Phone
[ +855 12 345 678 ]

Email
[ john@example.com ]
```

Then show:

```text
Additional Fields
```

Example:

```text
Employee Code
[ EMP-10023 ]

Branch
[ Phnom Penh ]
```

Users must be able to:

- edit labels
- edit values
- remove extra fields
- add extra fields
- convert an extra field into a standard field if required

---

# 23. Confidence Display

AI confidence should be visible where useful.

Suggested levels:

```text
0.90 – 1.00
High confidence

0.70 – 0.89
Medium confidence

0.00 – 0.69
Low confidence
```

Highlight low-confidence values.

Example:

```text
Phone
+855 12 345 678
Confidence: 97%

Employee Code
EMP-10023
Confidence: 62%
Needs review
```

Do not prevent saving solely because of low confidence.

The user should be able to confirm the value manually.

---

# 24. Supabase Storage

Create a bucket such as:

```text
card-images
```

Recommended storage path:

```text
{user_id}/{card_id}/original.jpg
```

Do not store public image URLs permanently if the bucket is private.

Store the path:

```text
original_image_path
```

Generate signed URLs when images need to be displayed.

---

# 25. Security

Use Supabase Row Level Security.

Users should only see their own card records unless future role-based sharing is implemented.

Example policy concept:

```sql
auth.uid() = user_id
```

Apply similar access control to storage.

Never expose:

- Supabase service role key
- AI provider secret keys
- backend credentials

to client-side JavaScript.

Secrets must be server-side environment variables.

---

# 26. Environment Variables

Use:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

AI_API_KEY=
AI_MODEL=
```

The service role key must only be used server-side.

Never prefix secrets with:

```text
NEXT_PUBLIC_
```

---

# 27. Card List Screen

Create a page showing saved cards.

Each item may show:

- name
- company
- job title
- phone
- email
- thumbnail
- created date

Provide:

- search
- sort
- filter
- open card

---

# 28. Card Detail Screen

Show:

```text
Card Image

Name
Company
Job Title
Department
Phone
Email
Website
Address

Additional Fields

Created Date
Last Updated
```

Actions:

```text
Edit
Archive
Delete
```

---

# 29. Search

For MVP implement standard PostgreSQL search.

Search fields:

```text
name
company
email
phone
job_title
card_number
```

Optional search inside `extra_fields`.

Do not introduce embeddings initially.

---

# 30. Search Examples

Support queries similar to:

```text
John
Microsoft
Phnom Penh
+855
software engineer
john@example.com
```

Search should be case-insensitive where applicable.

---

# 31. Filters

Potential filters:

```text
Card Type
Company
Created Date
Archived / Active
```

Later:

```text
Tags
Owner
Department
```

---

# 32. Duplicate Detection

Before saving a new card, check possible duplicates.

Suggested comparison:

1. exact email
2. normalized phone
3. card number
4. name + company

Do not automatically reject duplicates.

Instead warn:

```text
Possible duplicate found.
```

Allow:

```text
View existing
Save anyway
Cancel
```

---

# 33. Data Normalization

Normalize safely.

## Email

- trim whitespace
- lowercase where appropriate

## Phone

Preserve original display value.

Optionally maintain a normalized phone value later.

## Website

Normalize protocol only if safe.

Do not modify meaningful values without user visibility.

---

# 34. Soft Delete

Prefer archiving before permanent deletion.

Use:

```text
is_archived
```

The main list should exclude archived cards by default.

Allow users to restore archived cards.

Permanent deletion can be a later feature.

---

# 35. Audit Information

At minimum store:

```text
created_at
updated_at
user_id
```

Optional later:

```text
created_by
updated_by
verified_at
verified_by
```

---

# 36. Error Handling

Provide clear user-facing error states.

Examples:

```text
Unable to access camera.

The selected image is too large.

Unable to read this card.

AI extraction temporarily failed.

Unable to save card.

Your session has expired.
```

Do not expose stack traces or secrets to the browser.

---

# 37. Retry Behavior

For failed AI extraction:

Allow:

```text
Retry extraction
```

Do not automatically retry indefinitely.

One controlled retry may be implemented server-side for transient failures.

---

# 38. Loading State

While extracting:

Display something like:

```text
Analyzing card...
```

Disable duplicate extraction requests.

Use proper loading indicators.

---

# 39. Responsive Design

The application must work well on:

- mobile phones
- tablets
- desktop

The scan page should be designed mobile-first.

Primary mobile actions should be easy to reach.

---

# 40. Accessibility

Use:

- proper labels
- keyboard navigation
- focus states
- accessible buttons
- semantic HTML
- readable validation messages

---

# 41. Performance

Avoid unnecessarily large client bundles.

Prefer server components where they make sense.

Use client components only for:

- camera
- file selection
- interactive forms
- dynamic UI

Optimize card images before displaying large collections.

---

# 42. API Design

Recommended extraction endpoint:

```text
POST /api/cards/extract
```

Input:

```text
multipart/form-data
```

Containing:

```text
image
```

Response example:

```json
{
  "success": true,
  "data": {
    "cardType": "business_card",
    "name": "John Smith",
    "company": "ABC Technology",
    "jobTitle": "Senior Engineer",
    "email": "john@example.com",
    "phone": "+855 12 345 678",
    "extraFields": [
      {
        "label": "Employee Code",
        "key": "employee_code",
        "value": "EMP-00123",
        "confidence": 0.97
      }
    ],
    "overallConfidence": 0.95
  }
}
```

---

# 43. Error Response Format

Use consistent API errors.

Example:

```json
{
  "success": false,
  "error": {
    "code": "EXTRACTION_FAILED",
    "message": "Unable to extract information from this image."
  }
}
```

Do not return implementation details.

---

# 44. Card Creation Flow

Preferred final save workflow:

```text
User selects image

↓
AI extraction

↓
Review/edit

↓
Create card ID

↓
Upload image

↓
Insert card data

↓
Show completed card
```

Ensure failed storage or database operations do not leave inconsistent data unnecessarily.

---

# 45. Initial Pages

Build these pages first:

```text
/
```

Redirect to dashboard or login.

```text
/login
```

Authentication.

```text
/dashboard
```

Summary and recent cards.

```text
/scan
```

Scan/upload workflow.

```text
/cards
```

Card list.

```text
/cards/[id]
```

Card details.

```text
/cards/[id]/edit
```

Card edit form.

---

# 46. Dashboard

Initial dashboard can show:

```text
Total Cards
Cards Scanned Today
Recent Cards
```

Do not overbuild analytics.

---

# 47. Optional Tags

Tags may be added after MVP.

Potential schema:

```text
tags
card_tags
```

Examples:

```text
Customer
Supplier
VIP
Conference
Partner
```

Do not store tags as comma-separated strings.

---

# 48. Front and Back Card Support

Design the schema so front/back images can be supported later.

For a later phase consider a `card_images` table:

```sql
create table card_images (
    id uuid primary key default gen_random_uuid(),
    card_id uuid not null references cards(id) on delete cascade,
    side text not null,
    storage_path text not null,
    created_at timestamptz not null default now()
);
```

Possible side values:

```text
front
back
other
```

For MVP, one image is acceptable.

---

# 49. Future AI Improvement

The architecture should allow future replacement of:

```text
AI vision only
```

with:

```text
OCR
+
rule-based extraction
+
AI semantic classification
```

Do not hardcode AI calls throughout UI components.

All extraction logic belongs behind the AI service layer.

---

# 50. RAG

Do not implement RAG during the MVP.

RAG is not needed for basic card extraction.

Potential future use:

```text
Find people involved in accounting.

Show contacts related to construction projects.

Find technical contacts from software companies.
```

This can later use embeddings and semantic search.

---

# 51. Conversation-Based Search

Do not implement chatbot functionality in the first version.

Standard search is sufficient.

Potential later architecture:

```text
Natural language query
        ↓
AI query interpretation
        ↓
Structured DB search
        ↓
Results
```

Use deterministic database queries whenever possible.

---

# 52. Testing

Implement tests for important business logic.

At minimum test:

- Zod extraction schema
- field normalizer
- duplicate detection
- JSONB extra field handling
- API validation

Avoid spending excessive time testing trivial UI components during early development.

---

# 53. Test Card Scenarios

Use test cases covering:

## Business card

```text
John Smith
Senior Engineer
ABC Technology
+855 12 345 678
john@example.com
www.example.com
```

## Membership card

```text
Member Name: Sokha
Member No: MB-10023
Tier: Gold
Valid Until: 31/12/2027
```

## Employee card

```text
Jane Lim
Finance Manager
Employee ID: EMP-0029
Department: Finance
```

## Unknown field

```text
ABC-7788
```

The model should not confidently invent a label.

---

# 54. Quality Requirements

The application should:

- compile without TypeScript errors
- pass linting
- handle failed extraction
- handle missing fields
- handle extra fields
- handle empty results
- handle invalid files
- maintain authentication security
- protect user data
- work on mobile

---

# 55. TypeScript Rules

Use strict TypeScript.

Avoid:

```ts
any
```

unless unavoidable.

Prefer:

```ts
unknown
```

followed by validation.

Use clear interfaces and Zod schemas.

---

# 56. Coding Style

Use:

- readable names
- small focused components
- clear business logic
- meaningful functions
- async/await
- early returns

Avoid:

- giant components
- repeated Supabase calls
- deeply nested conditionals
- unnecessary abstraction
- magic strings

---

# 57. Server vs Client

Keep server-only work on the server.

Server-only:

- AI API calls
- secret keys
- privileged Supabase operations

Client-side:

- file selection
- camera
- preview
- review form
- interactive editing

Never send AI API keys to the client.

---

# 58. Supabase RLS

Enable RLS for all user-owned tables.

For `cards`, policies should effectively enforce:

```text
user_id = auth.uid()
```

for:

- select
- insert
- update
- delete

Never rely only on frontend filtering.

---

# 59. Storage Security

If images contain sensitive card information, use a private Supabase bucket.

Generate temporary signed URLs for display.

Do not expose the entire storage bucket publicly.

---

# 60. Migration Strategy

Keep database migrations under version control.

Suggested:

```text
supabase/migrations/
```

Do not manually modify production schema without a migration.

---

# 61. Logging

Log server-side operational information.

Examples:

```text
extraction started
extraction completed
extraction failed
card created
storage upload failed
```

Never log:

- API keys
- Supabase service-role keys
- full authentication tokens

Avoid logging full card content unless debugging explicitly requires it.

---

# 62. Privacy

Card data may contain personal information.

The application must:

- limit access by user
- protect images
- avoid unnecessary third-party transmission
- clearly control AI processing
- avoid retaining AI-provider payloads unnecessarily when configurable

---

# 63. MVP Scope

The first completed version should include exactly these major capabilities:

## Authentication

- sign in
- sign out
- protected application

## Scanning

- camera capture through file input
- file upload
- image preview

## AI

- image extraction
- standard fields
- extra fields
- confidence

## Review

- edit standard fields
- edit extra fields
- add field
- remove field

## Storage

- upload original image

## Database

- save final card

## Card Management

- list
- detail
- edit
- archive/delete

## Search

- keyword search

---

# 64. Do Not Build Yet

Do not implement these until MVP is working:

- RAG
- vector embeddings
- semantic search
- chatbot
- Redis
- Upstash
- message queues
- multi-tenant organization hierarchy
- OCR microservices
- live edge detection
- automatic perspective correction
- real-time synchronization
- complex analytics
- workflow automation

---

# 65. Phase 1 — Foundation

Tasks:

```text
1. Create Next.js TypeScript project.
2. Configure Tailwind.
3. Configure shadcn/ui.
4. Configure Supabase.
5. Set up environment variables.
6. Implement authentication.
7. Configure protected routes.
8. Create cards database migration.
9. Enable RLS.
10. Create private card-images bucket.
```

Definition of done:

```text
User can sign in and access protected pages.
Database connection works.
Storage connection works.
```

---

# 66. Phase 2 — Scan UI

Tasks:

```text
1. Create /scan page.
2. Add image capture/upload.
3. Validate file.
4. Preview image.
5. Replace/remove image.
6. Add Extract button.
7. Add loading state.
```

Definition of done:

```text
User can take or select a card image and preview it.
```

---

# 67. Phase 3 — AI Extraction

Tasks:

```text
1. Create AI service abstraction.
2. Create extraction prompt.
3. Create TypeScript interfaces.
4. Create Zod schema.
5. Create /api/cards/extract endpoint.
6. Submit image to AI.
7. Parse structured response.
8. Validate AI response.
9. Return safe JSON.
10. Handle extraction errors.
```

Definition of done:

```text
A card image produces validated structured card data.
```

---

# 68. Phase 4 — Review Screen

Tasks:

```text
1. Create CardReviewForm.
2. Display standard fields.
3. Display extra fields.
4. Show confidence.
5. Highlight low confidence.
6. Allow editing.
7. Allow adding custom fields.
8. Allow deleting custom fields.
```

Definition of done:

```text
User can fully correct AI output before saving.
```

---

# 69. Phase 5 — Save Card

Tasks:

```text
1. Create final card ID.
2. Upload image to private storage.
3. Save structured card record.
4. Save JSONB extra fields.
5. Handle failure states.
6. Redirect to card details.
```

Definition of done:

```text
Reviewed card and image are safely stored.
```

---

# 70. Phase 6 — Card Management

Tasks:

```text
1. Create card list.
2. Create card detail.
3. Create card edit.
4. Add archive.
5. Add delete.
6. Add image display with signed URL.
```

Definition of done:

```text
User can manage previously scanned cards.
```

---

# 71. Phase 7 — Search

Tasks:

```text
1. Add search box.
2. Search name.
3. Search company.
4. Search phone.
5. Search email.
6. Search job title.
7. Search card number.
8. Add filters if required.
```

Definition of done:

```text
User can quickly locate stored cards.
```

---

# 72. Phase 8 — Duplicate Detection

Tasks:

```text
1. Normalize email.
2. Normalize phone.
3. Search for matching email.
4. Search for matching phone.
5. Compare name + company.
6. Show duplicate warning.
```

Definition of done:

```text
User is warned before creating obvious duplicates.
```

---

# 73. Phase 9 — Production Hardening

Tasks:

```text
1. Review RLS.
2. Review storage policies.
3. Validate all API input.
4. Add error handling.
5. Add rate limiting if necessary.
6. Improve image handling.
7. Test mobile browsers.
8. Test authentication expiration.
9. Test AI failures.
10. Test duplicate cards.
```

---

# 74. Expected User Journey

The final user flow should feel like:

```text
Login

↓
Dashboard

↓
Scan Card

↓
Take Photo

↓
Preview

↓
Extract Information

↓
AI Processing

↓
Review Fields

↓
Correct if needed

↓
Save

↓
Card Details
```

The user should never have to understand JSON, OCR, AI prompts, or database structure.

---

# 75. Example Extraction Result

For this card:

```text
JOHN SMITH
Senior Software Engineer
ABC Technology Co., Ltd.

T: +855 12 345 678
E: john.smith@abc.com

Employee Code: EMP-1001
Branch: Phnom Penh
```

Expected result:

```json
{
  "cardType": "business_card",
  "name": "John Smith",
  "company": "ABC Technology Co., Ltd.",
  "jobTitle": "Senior Software Engineer",
  "department": null,
  "email": "john.smith@abc.com",
  "phone": "+855 12 345 678",
  "secondaryPhone": null,
  "website": null,
  "address": null,
  "cardNumber": null,
  "overallConfidence": 0.97,
  "extraFields": [
    {
      "label": "Employee Code",
      "key": "employee_code",
      "value": "EMP-1001",
      "confidence": 0.99
    },
    {
      "label": "Branch",
      "key": "branch",
      "value": "Phnom Penh",
      "confidence": 0.96
    }
  ]
}
```

---

# 76. Important Agent Instructions

When implementing this project:

1. Work phase by phase.
2. Do not skip validation.
3. Do not expose secrets.
4. Do not bypass Supabase RLS.
5. Do not save AI output without a review step.
6. Do not guess unknown card fields.
7. Do not create unnecessary infrastructure.
8. Use TypeScript strictly.
9. Keep AI integration replaceable.
10. Preserve original scan information.
11. Keep the UI mobile-friendly.
12. Use safe server-side API calls.
13. Run lint and build after meaningful changes.
14. Fix TypeScript issues rather than suppressing them.
15. Avoid `any`.
16. Keep database migrations version controlled.

---

# 77. Commands

Typical development commands:

```bash
npm install
npm run dev
npm run lint
npm run build
```

Before considering a phase complete:

```bash
npm run lint
npm run build
```

Both should succeed.

---

# 78. Completion Criteria

The project is considered complete when a user can:

```text
✓ Sign in

✓ Take a picture of a card

✓ Upload an image

✓ Preview the image

✓ Run AI extraction

✓ Extract common card fields

✓ Extract custom fields

✓ See confidence information

✓ Correct extracted data

✓ Add custom fields

✓ Remove incorrect fields

✓ Save card image

✓ Save card information

✓ Browse scanned cards

✓ Search cards

✓ Open card details

✓ Edit cards

✓ Archive or delete cards
```

The system must work even when different cards contain different fields.

The final solution must remain simple enough to maintain while providing a clear path toward later features such as:

```text
OCR pipeline
semantic search
RAG
natural-language search
multi-tenant support
card sharing
automatic cropping
advanced duplicate detection
```

Do not implement those advanced features until the core scanning workflow is stable.

---

# 79. Incremental Roadmap After Phase 9

Phases 1–9 have implementation code, with front/back scanning and duplicate
warnings already implemented. Full production sign-off still depends on the
remaining release checks. Use the latest dated verification in README.md as the
current evidence; older phase snapshots are historical.

Phase 10 has automated tooling implemented; physical-device, screen-reader,
real-photo and hosted release checks remain pending. Phase 11 has password-flow
code and hosted Auth/email acceptance checks completed for localhost. Deployed
HTTPS verification remains part of the Phase 10 release checks. Phases 12–17
are planned.
Work sequentially, preserving the existing scanning/review/save flow.
Keep the MVP completion criteria separate from these enhancements. Do not
rebuild front/back scanning or duplicate warnings as new features.

For every phase, add meaningful tests for its business logic and security,
run the applicable existing tests, lint and production build, and record dated
results and unresolved checks in README.md. Version all schema changes and
preserve RLS, private images, source extraction and mandatory final review.

## Phase 10 — Release Validation and Automated Checks

Status (2026-10-10): CI workflow, opt-in real-photo evaluator and HTTPS deployment
checker implemented. Local automated checks pass; hosted CI execution and manual
release evidence remain pending. Use `docs/phase-10-validation.md` for the device
matrix, evaluator instructions, deployment checklist and sign-off record.

Tasks:

1. Test physical Android and iOS capture/upload in mobile Chrome and Safari,
   including replacement, cancellation, front/back images and interrupted saves.
2. Test keyboard and screen-reader journeys through extraction, review,
   duplicate warnings, editing, archive/restore and deletion. Check focus,
   announcements, narrow layouts, zoom and reduced motion.
3. Evaluate permitted real photos across card types, layouts, Khmer/English,
   blur and glare. Record the provider/model, expected values, missing or invented
   values, correction needs, failures and latency. Keep fixtures private or use
   consented fictional cards; synthetic smoke tests alone do not establish accuracy.
4. Verify deployed HTTPS, proxy headers, upload/read timeouts and hosting abuse
   controls. Address the hosted leaked-password-protection warning where the
   project plan supports it; document any remaining limitation.
5. Add CI checks for supported Node, clean dependency installation, lint,
   automated tests and production build on pull requests. Keep live Supabase and
   paid AI checks opt-in with protected test credentials and fictional fixtures.

Definition of done:

- CI passes, and physical-device, screen-reader, real-photo and deployment
  results are documented with any failures fixed or explicitly tracked.
- Do not mark unavailable hardware or unperformed checks as passed.

## Phase 11 — Password Recovery and Account Password Changes

Status (2026-10-10): password request, explicit recovery verification, protected
new-password and current-password change flows implemented. Local tests, lint,
build and production HTTP checks pass. Hosted Gmail SMTP, recovery template,
exact localhost redirect and 12-character minimum are configured and read back.
Real email delivery, recovery/password update, new/old password checks, used-link
denial and actual expiry denial passed with disposable accounts. The expiry test
used a temporary 60-second setting; the original 3600 seconds was restored.
Production deployment/domain verification remains a Phase 10 release requirement.
See `docs/phase-11-passwords.md` for setup and acceptance evidence.

Tasks:

1. Add a labeled Forgot password flow and Supabase recovery callback handling.
2. Add a protected new-password screen with validation, confirmation and safe
   expired/invalid-link errors. Validate redirect destinations.
3. Add an authenticated change-password action with appropriate reauthentication.
4. Configure production SMTP, recovery templates and allowed redirect URLs;
   keep email credentials server-side and responses neutral about account existence.
5. Verify recovery delivery, valid/expired links, password change and subsequent
   sign-in with disposable accounts.

Definition of done:

- Users can recover access and change passwords without administrator help;
  existing authentication and protected routes remain secure.

## Phase 12 — Card Filters and Sorting

Tasks:

1. Add card-type, company and created-date filters alongside keyword search and
   the existing active/archived selector.
2. Add newest/oldest and name ascending/descending sorting with deterministic
   tie-breakers and defined handling of missing names.
3. Validate query parameters and allowlist sort fields server-side. Preserve
   search/filter/sort state in URLs and pagination; reset the page on changes.
4. Keep reads owner-scoped through RLS, provide clear/reset controls and useful
   empty states, and verify combinations, date boundaries and user isolation.

Definition of done:

- Users can combine search, filters and sorting, share their own list URL, and
  paginate consistently without exposing another user's records.

## Phase 13 — CSV and vCard Export

Tasks:

1. Export selected cards or all cards matching the current search and filters,
   making archive inclusion explicit and supporting results beyond one page.
2. Produce UTF-8 CSV with standard columns and a documented representation of
   custom-field arrays that preserves labels, keys, values and confidence.
3. Produce compatible vCard contact files for available contact fields. Preserve
   unsupported custom information in notes or clearly explain export limitations.
4. Escape CSV formula-like values and vCard separators/newlines safely; verify
   Khmer, multiline values, missing fields and import into representative tools.
5. Authenticate exports, enforce ownership, bound export sizes and avoid logging
   card contents. Exclude secrets, storage paths and signed image URLs.

Definition of done:

- Users can import exported data into spreadsheets and phone contacts; CSV
  preserves custom fields, and cross-user export attempts are denied.

## Phase 14 — Secure Draft Recovery

Tasks:

1. Offer opt-in recovery for selected images, extracted source data and corrected
   review fields after refresh or accidental navigation.
2. Store drafts server-side behind owner RLS and private storage, separate from
   final cards. Do not persist sensitive card data in browser localStorage.
3. Provide resume/discard controls, an explicit retention period and cleanup of
   expired/discarded draft images. Document any limits on image recovery.
4. Handle interrupted writes, session expiration and concurrent tabs; validate
   restored data and preserve the existing final review and duplicate checks.
5. Clear or mark the draft consumed after a confirmed final save, with retry
   behavior that avoids duplicate cards and premature source-image deletion.

Definition of done:

- A user can resume an opted-in draft after reload; other users cannot access it,
  and resuming never silently creates a final card or triggers paid extraction.

## Phase 15 — Khmer and English Interface

Tasks:

1. Add Khmer/English language selection and persist the nonsensitive preference.
2. Translate navigation, forms, validation, loading, errors, dialogs and
   accessibility announcements through a shared message catalog.
3. Provide appropriate document language, readable Khmer fonts and localized
   date/number formatting with English fallback for missing messages.
4. Preserve extracted names, labels and source values as written; switching UI
   language must not translate or alter card contents or stored schema keys.
5. Verify narrow layouts, long translations, keyboard and screen-reader usage
   in both languages, with human review of Khmer translations.

Definition of done:

- The complete user journey works in either language without losing data or
  changing extraction semantics.

## Phase 16 — Consistent Cambodia Dates and Daily Counts

Tasks:

1. Use a shared Asia/Phnom_Penh time-zone policy for the dashboard's Scanned today
   count, displayed dates and created-date filter boundaries.
2. Keep timestamps stored in UTC; calculate local-day boundaries server-side
   and convert them to UTC for database queries.
3. Use explicit locale/time-zone formatting and clarify the chosen zone in UI
   where needed. Avoid dependence on the deployment server's local clock zone.
4. Test both sides of Cambodia midnight, month/year boundaries and inclusive
   date ranges using an exclusive next-day upper bound.

Definition of done:

- Dashboard counts and date filters agree with displayed Cambodia dates,
  regardless of the browser or hosting machine's time zone.

## Phase 17 — Tags, Notes and Favorites

Tasks:

1. Add owner-scoped tags and card/tag relations through migrations; do not use
   comma-separated tags. Enforce ownership for both sides of every relation.
2. Add user-authored notes and a favorite flag, separate from raw OCR and
   original AI extraction. Validate length and render notes safely.
3. Allow adding/removing tags, editing notes and toggling favorites on cards;
   add tag/favorite filters without losing existing search and sort state.
4. Define archive, restore and delete behavior, clean relations on permanent
   deletion, and preserve notes/tags in CSV exports with documented mapping.
5. Test duplicate tag names, concurrent edits, inaccessible cards and cross-user
   relation creation/read/update/delete attempts.

Definition of done:

- Users can organize their own cards by tags and favorites and add notes;
  organization metadata remains private and source extraction is unchanged.

These phases do not authorize RAG, chatbots, embeddings, organization hierarchies,
queues or extra backend services. Those remain outside the incremental roadmap.
