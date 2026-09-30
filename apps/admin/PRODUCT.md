# Commission Admin

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the site owner maintaining a personal collection of commissioned artwork.
Typical work is to select a record, make a precise change, save it, and continue maintaining the
collection. The private admin is a browser tool used across desktop and narrow screens.

Public-site visitors are an indirect audience: they browse the collection by character, time, and
keyword. They do not use the admin. The owner confirmed this audience and product purpose during
initialization; this product record is scoped to `apps/admin`.

## Product Purpose

Make collection maintenance accurate and efficient, then publish a collection whose artwork is easy
to find. The admin supports recording delivered artwork, correcting metadata, organizing characters
and works, improving search vocabulary, and publishing saved changes to the public site.

Success means completing these tasks without losing drafts, changing unrelated records, or confusing
saved data with published content.

## Positioning

A private editorial tool for one owner's commission archive. Its organizing model combines artwork
records, characters, explicit delivery metadata, source links, search aliases, and optional numbered
parts. It maintains a separate static public index rather than serving as a marketplace.

## Operating Context

- Production admin runs at `admin.crystallize.cc` behind Cloudflare Zero Trust; the public collection
  runs at `crystallize.cc`.
- The existing frontend is a React SPA. All data operations go through the admin Worker; durable
  records and image objects live in D1 and R2.
- Saving a record and publishing the public site are separate actions. Successful changes mark the
  collection as pending publication; a publish must preserve changes saved during its own request.
- Default development from the repository root is `pnpm run dev:admin`, pairing the frontend on port
  4174 with a local Worker on port 8787 and remote D1/R2.
- `pnpm run test:admin-ui` uses intercepted API fixtures and starts only the frontend. Fixture checks
  provide local regression evidence, not authenticated production verification.

## Capabilities and Constraints

- Overview: maintenance destinations, recent artwork, collection totals, publication status, and
  connection diagnostics.
- Create: select or add a character, prepare an image, enter delivery and descriptive metadata,
  attach source links, and optionally mark a work hidden or assign explicit numbered parts.
- Edit: find works, edit or delete records, replace images, manage characters and ordering, and
  preview bulk keyword replacements. Partial successes must remain visible and recoverable.
- Aliases: maintain alternate character names, creator names, and keywords while retaining drafts
  across tabs; save only changed rows.
- Suggestion: choose and order up to six initial public-search keywords from the pool or manual input.
- `Active` and `Archived` are character states. Archived characters are folded by default on the
  public site. Archiving is distinct from an individual work's `Hidden` setting.
- User-facing work identity is the immutable `publicId`; internal numeric IDs and asset keys are
  implementation details. Date and creator are explicit metadata. Unknown creators display as `Anon`.
- Numbered parts are explicit relationships; sharing a character, artist, date, or link must not
  silently group records or merge their images.
- Create and replacement uploads share the crop tool: move, zoom, rotate, and resize a fixed-ratio
  frame. Output is a 1280 × 525 JPEG at 95% quality, with transparency flattened onto white and a
  warning when upscaling is needed. Metadata-only edits preserve the existing image.
- Background refresh must preserve drafts, focus, query, and ordering context. Loading, failure, and
  confirmed empty results are different states. Errors remain actionable until resolved or dismissed.
- API contracts and maintenance rules remain authoritative in the repository's `AGENTS.md` files,
  `docs/api-reference.md`, and `docs/ai-agent-guide.md`.

## Brand Commitments

The application name is Commission Admin within Commission Index. Existing product copy is concise
English with a practical, private editorial-tool voice. Preserve real artwork and metadata, clear
terminology, and the existing light/dark theme support. Existing visual constraints remain in the
app's `.impeccable.md`, admin guidance, and implementation.

## Evidence on Hand

- `src/app/sections.ts` defines the five maintenance routes and their purpose.
- `src/components/`, `src/pages/`, and `src/lib/imageCrop.ts` implement the workflows and crop contract.
- `public/favicon.svg` and `public/fonts/` contain existing identity assets.
- `test/visual/` contains browser fixtures and regression coverage. Repository-level admin audit
  documents record earlier observations with their own validation boundaries.
- Production records and source artwork are existing collection content, accessed through the Worker.
  Do not fabricate records, usage metrics, or testimonials to fill an interface.

## Product Principles

1. Keep select, adjust, confirm, and continue in one maintenance context.
2. Protect exact record identity, image relationships, and unsaved work throughout asynchronous tasks.
3. Make save, pending publication, and publication outcomes unambiguous.
4. Make output constraints and irreversible actions understandable at the point of use.
5. Preserve every maintenance capability across supported input methods and screen sizes.

## Accessibility & Inclusion

Preserve keyboard, pointer, and touch access; visible focus; dialog focus management; and accessible
names for icon actions and full record identities. Support narrow screens, 200% text zoom, and reduced
motion. Ordering must remain possible with keyboard controls as well as dragging. Product-specific
accessibility needs beyond these existing requirements remain undecided.
