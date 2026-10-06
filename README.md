# ThinkHealth Logistics — Multi-Courier Shipment Tracking Dashboard

A production-grade MERN dashboard for a B2B pharmacy/medical supply business to track
outbound shipments carried by **any courier on TrackingMore** (1,691 couriers in 160
countries, 53 of them Indian — Shree Maruti is the default), with real-time checkpoint updates,
multi-channel notifications (in-app, email, WhatsApp), public no-login customer tracking
links, bulk/CSV and system-to-system shipment ingestion, an actionable Exception workflow,
and basic delivery analytics.

## Why Shree Maruti via TrackingMore, not a scraper

This started from the assumption that Shree Maruti Courier has no public API and would need
to be scraped. Two things changed that during design:

1. **Shree Maruti's own tracking page requires solving a CAPTCHA** before showing results,
   which makes reliable, ethical, ToS-respecting automation impossible.
2. **TrackingMore already supports Shree Maruti Courier natively** — carrier code
   `shreemaruticourier` — as one of its 1,100+ integrated carriers.

So Shree Maruti is tracked through TrackingMore's API, like every other courier. The
backend's carrier-adapter interface (`server/src/adapters/`) stays pluggable — a genuinely
API-less, CAPTCHA-free carrier could get its own adapter later without touching the rest.

## Couriers

Any courier in TrackingMore's catalog can be tracked. `services/courierCatalog.service.js`
loads `GET /v4/couriers/all` (1,691 couriers at the time of writing), caches it for a day and
keeps serving the last good copy if TrackingMore is unreachable.

- **Choosing a courier.** The Add shipment dialog has a searchable courier picker (popular
  Indian couriers first, keyboard-driven). It remembers the last courier used. CSV import
  takes an optional `carrier_code` column; the ingest API an optional `carrierCode`.
  Anything omitted falls back to `DEFAULT_CARRIER_CODE` (`shreemaruticourier`,
  `server/src/config/carrier.js`), so older CSVs and integrations keep working. Unknown
  codes are rejected with a 400 naming the code; the same AWB can't be added twice for the
  same courier.
- **"Suggest from AWB"** calls TrackingMore's `couriers/detect`. It guesses from the
  number's format and is often wrong (for a real Shree Maruti AWB it ranked Delhivery
  first), so suggestions are offered as chips and never applied automatically.
- **Couriers needing extra fields.** ~80 international couriers need a destination
  postcode — sent automatically from the delivery address pincode; a ship date is sent
  from the shipping date. A handful need an account number or key, which isn't supported
  yet; the picker warns when one of those is chosen.
- **Everywhere else:** each shipment shows its courier (logo + name); the dashboard gets a
  courier filter once 2+ couriers are in use; the shipment page shows the courier's phone
  and website from the catalog; Analytics has a **Courier comparison** table (shipments,
  delivered, average transit, on-time %, exceptions per courier).
- **Endpoints:** `GET /api/carriers` (staff; full catalog + featured + default),
  `GET /api/carriers/detect?trackingNumber=` (staff), `GET /api/public/couriers/summary`
  (public; counts + well-known names for the landing page). `GET /api/shipments` accepts
  `?carrier=<code>`.

## Shipment status states

Reduced to 5 decision-relevant states (`server/src/utils/statusMap.js`):
**Pending → In Transit → Out for Delivery → Delivered**, or **Exception** (delay, failed
attempt, damage, or a stalled/expired tracking record — anything needing a human to act).
`Out for Delivery` is pre-selected as a default notification trigger for new users.

## Getting new shipments into the app

Four ways in, all going through the same `tracking.service.registerShipment`:

1. **Manual "+ Add Shipment"** — one at a time, tracking number + product/customer details.
   **Scan label** (next to it, and as a drop zone at the top of the form) fills the form from
   a photo or PDF of the shipping label / booking slip: AWB, courier, consignee name, phone,
   address and pincode, contents and quantity, weight, freight and dates. The browser
   shrinks phone photos to ≤2000px JPEG first; `POST /api/shipments/extract` sends the image
   to Google Gemini (`gemini-3.5-flash` by default, JSON response schema; if Google reports
   the model busy it retries on `gemini-3-flash-preview`, then `gemini-flash-latest`) with the
   list of Indian couriers so it can name one. The courier is checked against TrackingMore's
   catalog, the AWB is checked for an existing shipment, and the product is matched to a
   stock line's product code. Nothing is saved by the scan — fields the reader wasn't sure
   of are outlined in amber and the person presses **Add shipment**, because one misread
   AWB digit would track someone else's parcel. Needs `GEMINI_API_KEY`; without it the
   button explains that it isn't set up.
2. **CSV bulk import** — the "Bulk Import" button next to it. Expects a header row
   (`tracking_number, product_name, sku, quantity, category, customer_name, customer_email,
   customer_phone, customer_address, delivery_city, delivery_state, delivery_pincode,
   weight_kg, freight, shipping_date, estimated_delivery`); only `tracking_number` is
   required. Import is partial-success — a bad row (e.g. a 5-digit pincode) doesn't block the rest.
3. **Push ingestion API** (`POST /api/ingest/shipments`, header `X-Ingest-Key: <INGEST_API_KEY>`)
   — for whatever system generates AWB numbers today (an order system, a booking API, a
   Zapier bridge) to call when a shipment is booked. TrackingMore/Shree Maruti has no API to
   "list new shipments," so this push endpoint is what makes ingestion automatic instead of
   manual. It's idempotent by tracking number (safe to retry) and attributes ingested
   shipments to the user in `INGEST_OWNER_EMAIL`.

The existing `node-cron` background job (`server/src/jobs/refreshShipments.job.js`) is the
other half of "live" — it keeps polling TrackingMore for status changes on shipments already
in the system, independent of how they got in.

## Delivery address, weight and freight

Each shipment has optional **weight (kg)**, **freight (₹)** and a structured **client
delivery address** (`deliveryAddress { line, city, state, pincode }`), shown as the
"Deliver to" and "Weight · Freight" columns and the *Delivery & charges* card on the
shipment page. All three entry paths accept them (form, CSV, ingest API as `weightKg`,
`freightAmount`, `deliveryAddress`), and they can be edited later.

Where the delivery location comes from - checked against a live Shree Maruti AWB:

| Data | Source |
| --- | --- |
| Destination city + state, origin city + state | **Courier, automatic** - TrackingMore's `destination_city/state`, `origin_city/state`, stored as `carrierRoute` on every sync |
| Pickup date / delivery date | Courier milestones; pickup also fills an empty shipping date |
| Street address, pincode | **Not provided** by Shree Maruti (`recipient_postcode`, `scheduled_address` come back empty) - comes from the booking |
| Weight | Not provided for this carrier (`weight_kg` empty); read automatically if it ever is |
| City + state from a pincode | India Post's public directory via `GET /api/geo/pincode/:pin` (cached a day) - typing a pincode fills them in |

If no address was entered, the courier's destination is shown, labelled "From courier".
If both exist and the **states** disagree, the shipment is flagged (a likely wrong address
on the booking). The booking scan's long description contains the *sender's* pickup
address - it's deliberately not used as the delivery address.

## The shipments dashboard

**WhatsApp message.** Next to Export, *WhatsApp* builds a ready-to-send message for exactly
the shipments in the current view (filters, courier, search and sort applied), grouped by
status with exceptions first — AWB, courier, customer, destination, ETA and lateness, with
optional tracking links. Copy it, or *Open in WhatsApp* to pick the chat or group. The
default sort is **Soonest ETA**.

Built around triage rather than vanity counts:

- **Attention band** at the top, rendered *only* when something is wrong: unworked
  exceptions (an exception someone already marked "being followed up" drops out) and
  shipments past their promised ETA. Nothing to do → no banner, so the band stays meaningful.
- **Delivery urgency** derived from `estimatedDelivery`: `2d late`, `Due today`,
  `Due tomorrow` (see `client/src/utils/urgency.ts`). A shipment only counts as late once
  the whole promised day has passed, so in-flight deliveries aren't flagged at 00:01.
- **Filter pills double as the counts** — clicking "Exception 1" filters to it. Statuses with
  nothing in them are hidden. Filtering, search and sorting all happen client-side, so they're
  instant; at a few shipments/week the whole set is already in memory.
- **Sort** by soonest ETA (default), recently updated, or recently added.
- **Bulk select** in either view → archive/restore or export just the selection.
- **Sync all** forces an immediate TrackingMore refresh of every active shipment instead of
  waiting for the next cron tick (capped per sweep, bounded concurrency).
- **Export CSV** of whatever is currently on screen — the mirror of CSV import.
- `/` focuses search, `Esc` clears the selection.

### Self-healing registration

TrackingMore only returns data for tracking numbers registered with it, so a shipment could
previously become permanently unsyncable if its registration failed when it was added (bad or
missing API key at the time, a transient outage, or a row written straight to the database).
`trackingmore.adapter.js` now detects that specific error on refresh, registers the number,
and retries once — so those recover on the next sync instead of failing forever.

## Public tracking links

Every shipment can be shared via `https://<your-app>/track/<trackingNumber>` — no login
required, matching standard courier UX. The tracking number is the only "credential," so the
public API (`GET /api/public/tracking/:trackingNumber`, no auth, rate-limited) deliberately
returns a minimal payload: status, location, ETA, product name, and checkpoints — **no**
customer name, email, phone, or address, and no internal IDs. "Copy tracking link" is on
every shipment's detail page.

The page shows a four-step progress rail (pending → in transit → out for delivery →
delivered) above the checkpoint history. A shipment in `exception` doesn't get a fake
position on that rail; it gets a notice saying the parcel is being followed up instead.

## Public site and route map

`/` is a public marketing page for anyone who isn't signed in, and redirects to the
dashboard for anyone who is. Its hero carries the same tracking lookup a customer would
otherwise need a shared link for — typing an AWB goes straight to `/track/<AWB>`.

| Route | Auth | Purpose |
| --- | --- | --- |
| `/` | public → redirects when signed in | Marketing page, tracking lookup, API docs |
| `/track/:trackingNumber` | public | Customer-facing delivery progress |
| `/login` | public | Sign in; `?mode=register` opens the register tab |
| `/dashboard` | protected | Shipment triage list |
| `/analytics`, `/shipments/:id`, `/settings`, `/profile` | protected | As before |
| `/stock` | protected | Stock sheet, counts, WhatsApp stock update |
| `/stock/live/:token` | secret link | Read-only live stock for the logistics WhatsApp group |

Archiving has no page of its own. Hiding a closed consignment is a view preference, not a
separate part of the app, so it's an **Archived** filter pill on the dashboard — and that pill
only appears once something is actually archived. Select rows and use the bulk bar to archive
or restore. Archived shipments stay in the database and keep counting toward analytics; they
just leave the working queue.

One palette across the whole app: the `brand` teal scale in `client/tailwind.config.js` on a
light canvas, so the public pages and the authenticated dashboard look like one product. The
public site is multi-courier: the hero and proof strip show the live courier count, a
"Works with the couriers you already book" strip names well-known Indian couriers (real
names from the live catalog, plain text — no third-party logos on the marketing page), and
the How-it-works diagram shows 1,600+ couriers → tracking hub → dashboard, alerts, customer
link. Counts come from `GET /api/public/couriers/summary`, with a built-in fallback.

## Notifications

Settings has three channel toggles — in-app, email (Nodemailer/SMTP), and **WhatsApp** (via
[Gupshup](https://www.gupshup.io/)'s WhatsApp API, chosen over Twilio for easier onboarding
with Indian numbers) — plus a status filter (which of the 5 states trigger a notification).
Each channel no-ops gracefully and logs a debug line if its credentials aren't configured, so
missing SMTP/Gupshup config never breaks the notification flow, it just skips that channel.

Every outbound notification carries the shipment's public tracking link, so whoever reads it
goes straight to the live page.

## Delivery thank-you and customer feedback

These notifications go to the **customer on the shipment**, not the dashboard user.

The first time a shipment reaches `delivered`, `customerNotification.service` sends the
customer a thank-you on every channel it has an address for — email to
`customerInfo.email`, WhatsApp to `customerInfo.phone` — containing:

- "Thank you for choosing ThinkHealth", with their order and item
- a **feedback form link** (`/feedback/<trackingNumber>`)
- the **tracking link** (`/track/<trackingNumber>`), so they can pull the delivery details up later

Both links are public and keyed by tracking number, the same access model as the tracking
page — the customer never creates an account and there's no token to expire. Links are built
from `CLIENT_URL`, so **that must be set to your real public origin in production** or the
customer will be sent a `localhost` link.

Sending is guarded by `deliveryNoticeSentAt` on the shipment: carriers do re-issue
checkpoints and a manual re-sync must not mail the same customer twice. The stamp is only
written if a channel actually accepted the message, so an unconfigured SMTP/Gupshup means
it's retried rather than silently marking the customer as notified. Delivered shipments
drop out of status polling, so the retry is its own sweep (`retryPendingDeliveryNotices`,
run on every refresh cycle): any delivered, unarchived shipment with a customer contact
and no stamp, delivered within the last 7 days, is tried again. Connect SMTP or Gupshup
later and the backlog goes out on its own. The shipment's Customer feedback panel shows
which state it's in, with **Preview form** and **Copy link** for the
`/feedback/<AWB>` page.

**Feedback storage** — `models/Feedback.js`, one document per shipment (unique on
`shipmentId`). A second submission from the same customer updates their answer rather than
filing a second review, so `createdAt` is when they first replied and `updatedAt` is their
latest edit.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/public/feedback/:trackingNumber` | none | Form state: is it delivered, what did they already say |
| `POST /api/public/feedback/:trackingNumber` | none | Submit/update `{ rating: 1-5, comment }` |
| `GET /api/shipments/:id/feedback` | JWT | The rating on the ops side |
| `POST /api/shipments/:id/delivery-notice` | JWT | Re-send the thank-you (customer says they never got it) |

The public routes are rate-limited (writes tighter than reads, `feedbackLimiter`) and the
public payload carries no customer name, email, phone or address. The form refuses to open
for a shipment that hasn't been delivered, and a rating outside 1–5 is rejected.

Ops sees the result on the shipment detail page (rating, comment, and whether the request
has gone out) and in aggregate on Analytics as **Customer satisfaction** — average rating,
response rate against delivered orders, and the 1–5 distribution.

## Landing page interactivity

- **Hero simulator** (`ShipmentSimulator.tsx`) plays three scripted journeys — on time,
  running late, held at customs — scan by scan, and shows what the product does about each.
  The data is illustrative and lives in the component; it never touches the API. Autoplay
  cycles through all three until the visitor picks one, pauses when scrolled off screen,
  and shows the finished journey immediately under `prefers-reduced-motion`.
- **How it works** (`HowItWorks.tsx`) is a stepper that spotlights the matching part of the
  system diagram. Auto-advances while visible; clicking a step takes over.
- **Pricing volume slider** recommends a plan from `maxShipments` in `config/pricing.ts`, and
  the chosen volume is saved with the enquiry.
- **Scroll reveals** (`Reveal.tsx`) fade sections in once; disabled under reduced motion.

## Pricing, reviews and enquiries (the public site)

**Pricing** lives in one file: `client/src/config/pricing.ts`. The numbers in it are
**placeholders** — illustrative, not researched against your costs. Set `monthlyInr` on each
plan from your own unit economics before the site goes public. The model is monthly shipment
volume with a seat allowance, so the bill tracks parcels watched rather than logins. The
annual toggle charges `ANNUAL_MONTHS_CHARGED` (10) months for 12 and displays the effective
monthly rate, which is what buyers compare on. The FAQ copy is in the same file.

**Reviews are real or absent.** The section on the landing page renders actual customer
feedback, and a review only appears when **both** are true:

1. the customer ticked "ThinkHealth may publish this review" on the feedback form
   (`consentToPublish`, opt-in, unticked by default), and
2. someone on the team featured it from the shipment detail page (`isPublished`).

Withdrawing consent on a re-submit un-publishes the review automatically, and the API
refuses to feature one that was never consented to. When nothing qualifies, the section
renders nothing — there are no hardcoded testimonials to fall back on, deliberately.
Fabricated reviews on a page you sell from are both dishonest and a liability under India's
ASCI advertising code.

The cards scroll in an infinite horizontal marquee (`Reviews.tsx` + `.marquee-track` in
`styles/index.css`). The track renders the set twice and slides exactly one half-width, so
the wrap point is pixel-identical and invisible; with only a couple of reviews the set
repeats until a half is wider than the viewport, or there'd be a visible gap. Speed is
constant per card regardless of how many there are, it pauses on hover and keyboard focus,
and `prefers-reduced-motion` stops it entirely.

**Enquiries.** The pricing buttons open an enquiry form (`POST /api/public/leads`,
rate-limited to 5/hour per IP). Submissions are stored in the `leads` collection. There is
no in-app screen for them - the Leads section was removed - so read them from the database
until another follow-up route (e.g. emailing each enquiry to sales) is added.

⚠️ **Before launch:** `npm run seed` inserts six demo reviews (on six archived demo
shipments), so the marquee has something to show. Every
demo reviewer's name ends in **`(demo)`** and that suffix renders on the public page — it's
there so a seeded testimonial can never be mistaken for a real one. Delete them:

```js
// in a mongo shell, or add to a one-off script
db.feedbacks.deleteMany({ customerName: /\(demo\)$/ });
db.shipments.deleteMany({ 'customerInfo.name': /\(demo\)$/ });
```

Note the pre-existing demo shipments use real hospital brand names (Fortis, Apollo, Max).
That's harmless for internal demo data, but never let one of those become a published
review — a testimonial attributed to a real company you don't have a relationship with is
the worst version of this problem.

Also set the `og:url`/`canonical` values in `client/index.html` to your real domain, and
`CLIENT_URL` on the server.

## Exception workflow

A shipment in Exception status gets a red action panel on its detail page (and a "Needs
follow-up" badge on its dashboard card until someone acts): a "Mark as being followed up"
toggle and a note thread, so exceptions don't sit silently — `POST
/api/shipments/:id/notes` and `PATCH /api/shipments/:id` (`isBeingFollowedUp`).

## Stock and the WhatsApp stock update

Replaces the hand-typed "STOCK AVAILABLE" message the logistics manager posts in the
WhatsApp group. `/stock` holds the same lines, grouped the same way (AED, AED Trainer, AED
Pads, Training Pads), with notes ("3 without pad"), expiry dates and optional low-stock
levels. The seed loads the real 28/09 message as the starting point.

- **Counting.** Quantities are edited with −/+ or by typing (Enter jumps to the next line)
  and saved together as one count. Every change is logged in `StockMovement` with who,
  when and by how much — the WhatsApp thread only ever kept the latest number.
- **The message writes itself.** `GET /api/stock/message` renders stock in the group's
  existing format (`*bold*` headings, numbered pad lists, `exp dd-mm-yyyy`). Category
  totals are computed; the hand-typed totals in the 28/09 message didn't add up (AED said
  133, the lines sum to 114). After a count is saved the app offers the message straight
  away: **Copy**, or **Open in WhatsApp** (`wa.me/?text=`), which pre-fills it so the
  manager only picks the group and presses send.
- **Old + new stock.** Lines written by hand as "(8) +40 =48" are split lines
  (`oldQuantity` 8 of `quantity` 48). They're counted with separate Old / New steppers,
  shown as "48 (8 old + 40 new)" in the message, and old stock always goes out first.
- **Private notes.** Every product has a note only the team sees in the app
  (`internalNote`) - reservations, who to chase. It never appears in the WhatsApp message
  or on the live link. Company and place names from the old messages ("7 block for beng",
  "Goa return") were moved into these notes instead of being treated as products.
- **Stock out.** "Record stock out" on any line takes the quantity off (old first) and
  logs who it went to; that day's stock-outs appear as a *Stock Out* section at the end
  of the message, like the manual one did.
- **Shipments deduct stock.** Give a stock line a product code; any shipment booked with
  that code (manual, CSV or ingest API) takes its quantity off automatically, logged as a
  `shipment` movement linked to the AWB. Over-shipping clamps to 0 and flags a recount.
- **Size.** An optional size / dimension per line ("5×4", "10×20", "Big"), kept apart
  from the name so "Crepe Bandage" is one product in three sizes. Shown as a chip on the
  sheet and after the name in the message ("Crepe Bandage 5×4 - 47"); "5*4" or "5x4"
  typed in the form is stored as "5×4".
- **List styles.** Each category is plain, numbered (1. 2. 3.) or lettered (A. B. C.),
  matching how the team writes each block.
- **Long messages.** The full update is ~4,000 characters; WhatsApp caps one message at
  4,096, so the automatic send splits it at category boundaries into numbered parts.
- **Daily automatic update.** A per-minute job (`jobs/stockBroadcast.job.js`) sends the
  message to saved numbers once a day at the configured India time, via Gupshup.
- **Live link.** `/stock/live/:token` shows current stock read-only to anyone with the
  secret link — pin it in the group once. The token is compared in constant time and can
  be replaced from the Automate dialog to cut off old copies.

### Zoho Books stock sync

Connect once from Stock → **Connect Zoho Books** (OAuth, read-only scope
`ZohoBooks.settings.READ`). From then on Zoho Books is the source of truth for every linked
line:

- **Purchases add stock, sales take it off.** Each sync compares Zoho's `stock_on_hand`
  with the line here and logs the difference as a `zoho` movement — a bill shows as stock
  in (new stock), an invoice as stock out (old stock first) that also appears under
  *Stock Out* in the WhatsApp update with the customer's name.
- **Linking is automatic.** Zoho SKU = the line's product code first, then an exact name
  match (name + size, "5x4" = "5×4"); only an unambiguous match links. Lines that aren't in
  Zoho stay manual.
- **New products appear by themselves.** A Zoho item with stock and no match gets a line in
  "From Zoho Books" (can be turned off). Lines removed here aren't recreated.
- **Linked lines are read-only here** while connected: no −/+ count, no stock out, and a
  shipment with that product code doesn't deduct again (the invoice already did). The
  server enforces this (409), not just the UI. Disconnecting makes every line manual again.
- **When it runs.** Every 15 minutes (`ZOHO_SYNC_CRON`), on **Sync now**, and a few seconds
  after Zoho calls the webhook. For instant updates, add Zoho Books workflow rules (Bills,
  Invoices, Credit Notes, Vendor Credits, Inventory Adjustments → created or edited →
  Webhook, POST, default payload) pointing at the URL shown in the dialog
  (`/api/integrations/zoho/webhook/<secret>`). The webhook's bill/invoice number and party
  label the resulting movements ("Invoice INV-0042 · Sai Pharma"). Zoho can only reach it
  once the API is deployed at a public `SERVER_URL`.
- **Security.** The refresh token is stored AES-256-GCM encrypted; the access token is
  reused for its hour (Zoho limits how many a refresh token may mint); the OAuth round-trip
  is guarded by a one-time `state`, and the webhook secret is compared in constant time and
  can be replaced.

Setup: in the Zoho API Console for your region (India: api-console.zoho.in) add a
*Server-based Application* with redirect URI `<SERVER_URL>/api/integrations/zoho/callback`,
put `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` (and `ZOHO_DC` outside India) in `server/.env`,
restart, then connect from the Stock page. API: `GET|PATCH|DELETE /api/integrations/zoho`,
`POST /api/integrations/zoho/connect`, `POST /api/integrations/zoho/sync`,
`POST /api/integrations/zoho/webhook-token/rotate`, public `GET /api/integrations/zoho/callback`
and `POST /api/integrations/zoho/webhook/:token`.

**WhatsApp groups:** the WhatsApp Business API (Gupshup, Meta Cloud API) delivers to
individual numbers, not into ordinary WhatsApp groups. So the group is reached by the
one-tap "Open in WhatsApp" share or the pinned live link; the scheduled send goes to people
directly. It needs `GUPSHUP_API_KEY` / `GUPSHUP_SOURCE_NUMBER` / `GUPSHUP_APP_NAME`, and
Meta's 24-hour rule applies — a recipient who hasn't messaged the business number in the
last 24 hours can only be sent an approved template, so register the stock update as a
template in Gupshup before relying on the daily send.

API (all `requireAuth` except the live link): `GET /api/stock`, `GET /api/stock/message`,
`GET /api/stock/movements`, `POST /api/stock/count`, `POST|PATCH|DELETE
/api/stock/items[/:id]`, `POST|PATCH|DELETE /api/stock/categories[/:id]`, `PATCH
/api/stock/settings`, `POST /api/stock/broadcast`, `POST /api/stock/share-token/rotate`,
and public `GET /api/public/stock/:token`.

## Analytics

`/analytics` (also `GET /api/analytics/summary?from=&to=`) shows, live-updating as shipments
change: **average transit time** (Pending → Delivered), **on-time delivery %** (against
`estimatedDelivery`, since there's no separate SLA field), the overall **exception rate**, and
a **Courier comparison** table (shipments, delivered, average transit, on-time %, exceptions
per courier; "Fastest" is only shown once two couriers have deliveries). Computed in plain JS
over the user's shipments rather than a Mongo aggregation pipeline, since the stated volume
(a few shipments/week) makes that unnecessary complexity.

**Where orders go** (`locationBreakdown`): orders, units and freight per city and per state,
busiest first, from the client's delivery address or — when there isn't one — the courier's
reported destination. A city entered without a state inherits the state seen on other
shipments to that city, so "Pune" and "Pune, Maharashtra" count as one. Ranked horizontal
bars (top 10, the rest in the Table view) with the top location and the top-3 share.

**By day of the week** (`weekdayBreakdown`, Monday first, India time): orders and units by
the day they were booked (shipping date, else first scan, else when added) and deliveries
by the day they were delivered. Shown as a column chart with a Chart/Table toggle, the
busiest and quietest day, and the weekend share; it follows the date range at the top.

## Architecture

```
Logistics-app/
  server/    Node + Express + Mongoose API, TrackingMore integration, Socket.IO, node-cron jobs
  client/    React + TypeScript + Vite + Tailwind dashboard
  docker-compose.yml
```

- **Unified tracking service** (`server/src/services/tracking.service.js`) is the only thing
  the rest of the backend talks to for tracking data. It resolves a carrier to an adapter,
  diffs new checkpoints against what's stored, persists them, and fans out real-time +
  notification side effects.
- **TrackingMore adapter** (`server/src/adapters/trackingmore.adapter.js`) is the only adapter
  registered today, covering Shree Maruti.
- **Real-time updates**: Socket.IO, JWT-authenticated, one room per user. The dashboard and
  analytics page invalidate their React Query caches and show a toast when a shipment updates.
- **Background refresh**: an in-process `node-cron` job periodically refreshes any
  non-archived shipment not already `delivered`, with bounded concurrency (`p-limit`).

## Prerequisites

- Node.js 18+
- A MongoDB instance: a local install, Docker (`docker compose up mongo`), or
  [MongoDB Atlas](https://www.mongodb.com/atlas)'s free tier. **Don't have any of those handy?**
  `npm run dev:db --prefix server` spins up a real local MongoDB (via
  `mongodb-memory-server`, a devDependency) bound to `127.0.0.1:27017` — no install needed.
  It downloads a real `mongod` binary the first time (~780MB, cached after that) and keeps
  its data on disk in `server/.dev-data`, so shipments and stock survive closing the window
  or restarting the computer. Delete that folder for a clean start. Fine for local
  dev/demos; for production point `MONGODB_URI` at a real instance (Atlas or similar).
- A [TrackingMore](https://www.trackingmore.com/) account + API key (dashboard → API keys) for
  live Shree Maruti tracking data. Without a key the app still runs fully — shipments are
  created and every other feature works — you just won't get real checkpoint data until a
  key is configured.
- (Optional) SMTP credentials for email notifications, and/or a
  [Gupshup](https://www.gupshup.io/) WhatsApp API app for WhatsApp notifications. Both no-op
  gracefully if left unconfigured.

## Local setup

```bash
# from the repo root
npm run install:all

cp server/.env.example server/.env      # fill in the keys you have; see table below
cp client/.env.example client/.env      # defaults already point at localhost:5000

# no MongoDB installed? run this in its own terminal and leave it running:
npm run dev:db --prefix server

# seed demo data (a demo user + 4 Shree Maruti shipments with realistic checkpoint
# histories, written directly to MongoDB — no TrackingMore key needed to see it populated).
# Run it once on a fresh database: it replaces the demo user's shipments and all stock.
npm run seed

npm run dev   # runs server (5000) and client (5173) together
```

Then open **http://localhost:5173** and sign in with **demo@thinkhealth.in / Demo@12345**, or
register a new account from the login screen.

Once `TRACKINGMORE_API_KEY` is set, newly-added shipments (however they're added) register
with TrackingMore and refresh automatically every `REFRESH_CRON` interval (default: every 15
minutes), or on-demand via "Refresh" on a shipment's detail page.

## Environment variables

See `server/.env.example` and `client/.env.example` for the full, commented list. Key ones:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs auth tokens — use a long random value in production |
| `SIGNUP_ALLOWED_DOMAINS` | Email domains allowed to create an account (default `thinkhealth.in`) |
| `TRACKINGMORE_API_KEY` | Enables live tracking data and the courier catalog |
| `REFRESH_CRON` / `MIN_REFRESH_INTERVAL_MINUTES` | Background status-refresh cadence |
| `SMTP_*` / `EMAIL_FROM` | Outbound email for status-change notifications |
| `GUPSHUP_API_KEY` / `GUPSHUP_SOURCE_NUMBER` / `GUPSHUP_APP_NAME` | WhatsApp notifications |
| `INGEST_API_KEY` | Shared secret upstream systems send in `X-Ingest-Key` to push new shipments |
| `INGEST_OWNER_EMAIL` | Existing user account that owns push-ingested shipments |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Enables **Scan label** (Gemini reads shipment details from a label photo) |
| `SERVER_URL` | Public address of the API — Zoho's sign-in redirect and webhook point here |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_DC` | Zoho Books stock sync (server-based OAuth app; `in` by default) |
| `ZOHO_SYNC_CRON` / `ZOHO_TOKEN_KEY` | Zoho sync cadence (default every 15 min); optional key for encrypting the stored Zoho token |
| `VITE_API_URL` / `VITE_SOCKET_URL` | Where the client points for the API and Socket.IO |

**Never commit `.env` files.** All secrets are read from environment variables server-side only;
the client never sees the TrackingMore/Gupshup keys, SMTP credentials, or ingest key.

## Deployment

- **Backend**: containerize with `server/Dockerfile` (plain `node:20-slim` — no headless
  browser needed) and deploy to Render, Railway, Fly.io, or ECS. Use MongoDB Atlas for a
  managed database.
- **Frontend**: `client/Dockerfile` builds the Vite app and serves it via nginx; deploy the
  static output to Vercel, Netlify, or S3+CloudFront just as easily — set `VITE_API_URL` and
  `VITE_SOCKET_URL` (or the Docker build args of the same name) to your backend's public URL.
- **Local/staging all-in-one**: `docker compose up --build` starts MongoDB, the API, and the
  client together. Set `JWT_SECRET`, `TRACKINGMORE_API_KEY`, `INGEST_API_KEY`/
  `INGEST_OWNER_EMAIL`, and the SMTP/Gupshup vars in your shell or an `.env` file next to
  `docker-compose.yml` before starting.
- **Scaling**: the node-cron refresh job runs in-process, fine for one backend instance. If
  shipment volume grows enough to need multiple instances, swap the cron job for BullMQ +
  Redis behind the same `tracking.service.refreshShipment` call — no other code needs to
  change, since everything already goes through that one function.
- **HTTPS/CORS**: set `CLIENT_URL` to your deployed frontend's origin (used for both CORS and
  the Socket.IO CORS policy); put the API behind HTTPS via your platform's load balancer or a
  reverse proxy (nginx/Caddy) with a Let's Encrypt certificate.

## What's verified vs. what needs live credentials

Verified in this environment:
- A 16-check smoke test against a real Express app + ephemeral MongoDB covering: carrier
  lock-down (server ignores/ ignores non-Shree-Maruti carrier fields and filters reads),
  the 5-state status enum, CSV bulk import (valid + invalid rows, partial success), the
  ingest endpoint (rejected without the API key, idempotent replay with it), public tracking
  (found, PII-free payload, 404 for unknown numbers), the exception note/follow-up
  round-trip, WhatsApp preference persistence, and analytics numbers matching hand-computed
  expected values against seeded data.
- Browser-driven verification (headless Chrome) of the actual UI: dashboard with no carrier
  filter and a visible "Needs follow-up" badge, the Exception action panel after adding a
  note and toggling follow-up, the Analytics page's live numbers, the Settings WhatsApp
  toggle, and the public `/track/:id` page loaded in a separate logged-out browser context —
  zero console errors throughout.
- Live TrackingMore integration (from the initial build) using a real API key and a real
  Shree Maruti tracking number through the full client → adapter → normalizer →
  `tracking.service` pipeline.
- The frontend type-checks (`tsc -b`) and builds (`vite build`) cleanly.
- Scan label: live against the real Gemini API on a generated test label (all 13 fields
  read correctly, day-first date parsed, courier matched; a non-label screenshot rejected),
  a 17-check test against a mock Gemini (request shape, fallback to the next model on 503,
  busy / rate-limited / bad-key / no-access / safety-block / truncated / not-a-label /
  bad-file-type paths, AWB/phone/pincode clean-up), and the dialog in headless Chrome (one
  request per photo, fields filled, uncertain fields outlined and cleared on edit).
- Zoho Books: a 29-check end-to-end test against the real Express app, in-memory MongoDB
  and a mock Zoho (OAuth connect + state check, encrypted token, SKU and name linking,
  auto-created items, invoice webhook → stock out with customer in the WhatsApp message,
  form-encoded bill webhook → stock in, expired-token refresh, read-only enforcement,
  no double deduction from shipments, removed lines not recreated, disconnect).

**Not verified here** (no credentials available in this environment): outbound SMTP email
delivery, Gupshup WhatsApp delivery, photos of real courier labels (only a generated one so
far), and a real Zoho Books organisation. The email and WhatsApp paths log and skip cleanly
when unconfigured; confirm actual delivery once real credentials are set.
