# GearNest API

The Express 5 + MongoDB API behind the GearNest equipment rental marketplace. It serves the
public catalogue, handles authentication-aware profile and favourite operations, runs Stripe
Checkout, confirms bookings, and exposes owner and admin management endpoints.

Client repository: sibling `../client` (Next.js 16).

---

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 20+, ES modules |
| Framework | Express 5 |
| Database | MongoDB (native driver v7) |
| Auth | BetterAuth JWTs verified with `jose` against the client's JWKS |
| Payments | Stripe Checkout + signed webhook |
| Validation | zod |
| Uploads | imgbb (server-side proxy) |
| Scheduling | node-cron (hourly booking status sweep) |
| Email | nodemailer over SMTP (console fallback when unconfigured) |
| Logging | morgan |

### npm packages used

- `express` — HTTP server and routing
- `mongodb` — database driver
- `jose` — JWT verification via remote JWKS
- `stripe` — Checkout sessions and webhook verification
- `zod` — request validation
- `node-cron` — scheduled booking status updates
- `nodemailer` — completion emails to renters and owners
- `cors` — origin allow-list for the client
- `dotenv` — environment loading
- `morgan` — request logging
- `nodemon` (dev) — auto-restart

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | API port, defaults to `5000` |
| `MONGODB_URI` | yes | MongoDB connection string (database `gear_nest`) |
| `BETTER_AUTH_URL` | yes | Client origin; JWT issuer, audience and JWKS host |
| `CLIENT_URL` | yes | Comma-separated allowed CORS origins |
| `STRIPE_SECRET_KEY` | no | Enables real Stripe Checkout |
| `STRIPE_WEBHOOK_SECRET` | no | Verifies the Stripe webhook signature |
| `IMGBB_API_KEY` | no | Enables image uploads |
| `SMTP_HOST` | no | SMTP server for completion emails |
| `SMTP_PORT` | no | SMTP port, defaults to `587` |
| `SMTP_SECURE` | no | `true` for implicit TLS (port 465) |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials |
| `MAIL_FROM` | no | From header, e.g. `GearNest <no-reply@gearnest.com>` |

The server starts without the optional keys. Without `STRIPE_SECRET_KEY`, checkout runs in
a clearly labelled demo mode so the full booking flow remains testable. Without SMTP
credentials, completion emails are written to the console (`[mail:skipped] …`) instead of
failing, so the cron job still works locally.

### 3. Seed

```bash
npm run seed
```

Creates the demo users, twelve approved listings and review data. Safe to re-run; it upserts
by email and skips duplicates.

### 4. Run

```bash
npm run dev     # nodemon
npm start       # plain node
```

Health check: `GET http://localhost:5000/api/health`.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with nodemon |
| `npm start` | Start with node |
| `npm run seed` | Seed demo users, equipment and reviews |

---

## Authentication model

1. BetterAuth (in the client repo) owns identity: `user`, `session`, `account`, `jwks`.
2. The client requests a short-lived JWT from `GET /api/auth/token`.
3. Every protected request carries `Authorization: Bearer <token>`.
4. `verifyToken` verifies the signature with `jose` against
   `${BETTER_AUTH_URL}/api/auth/jwks` (issuer and audience both `BETTER_AUTH_URL`).
5. The middleware then **re-reads the user's role from MongoDB** — a role in the token is
   never trusted on its own.

Role guards:

| Middleware | Allows |
| --- | --- |
| `verifyToken` | any signed-in user |
| `verifyRenter` | customers (checkout, confirm, cancel, favourites) |
| `verifyOwner` | owners (equipment CRUD, owner rentals, owner stats) |
| `verifyOwnerOrAdmin` | owners and admins |
| `verifyAdmin` | admins (users, moderation, platform stats) |

---

## API reference

Base URL: `http://localhost:5000`.

### Public

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + database ping |
| `GET` | `/api/equipment` | `search`, `category`, `rentalType`, `minPrice`, `maxPrice`, `availability`, `sort`, `page`, `limit` |
| `GET` | `/api/equipment/featured` | Six featured, approved listings |
| `GET` | `/api/equipment/categories` | Categories with live counts |
| `GET` | `/api/equipment/:id` | Approved listing + owner summary |
| `GET` | `/api/equipment/:id/availability` | `startDate`, `endDate` → remaining units |
| `GET` | `/api/reviews` | `limit`, `featured` |
| `POST` | `/api/contact` | Rate-limited contact message |

### Authenticated

| Method | Path | Notes |
| --- | --- | --- |
| `GET`/`PATCH` | `/api/users/me` | Profile read/update |
| `GET` | `/api/favorites` | Favourites with equipment |
| `GET` | `/api/favorites/ids` | Equipment ids only |
| `POST`/`DELETE` | `/api/favorites/:equipmentId` | Add/remove |
| `POST` | `/api/uploads/image` | Base64 image → imgbb URL |
| `GET` | `/api/bookings/my` | Customer bookings, paginated (`page`, `limit`, `status`) + per-status `counts` |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel before start |

### Payments

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/payments/checkout` | Validates dates/quantity, checks availability, creates a draft, returns Stripe (or demo) URL |
| `POST` | `/api/payments/confirm` | Verifies the session is paid, then writes booking + payment idempotently |
| `POST` | `/api/payments/webhook` | Stripe signature check; mounted with a raw body parser |

### Owner

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/equipment` | Create listing (status `pending`) |
| `PATCH`/`DELETE` | `/api/equipment/:id` | Update/delete own listing |
| `GET` | `/api/owner/equipment` | Own listings, optional `status` |
| `GET` | `/api/owner/equipment/:id` | Single own listing |
| `GET` | `/api/owner/bookings` | Bookings on own equipment |
| `PATCH` | `/api/owner/bookings/:id/status` | `confirmed → active/cancelled`, `active → completed` |
| `GET` | `/api/owner/stats` | Equipment, completed rentals, earnings, 6-month series |

### Admin

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/users` | Paginated, `role`, `search` |
| `PATCH` | `/api/admin/users/:id/role` | Cannot change own role |
| `GET` | `/api/admin/equipment` | Paginated, `status`, `search` |
| `PATCH` | `/api/admin/equipment/:id/status` | `pending` / `approved` / `rejected` |
| `GET` | `/api/admin/bookings` | Paginated, `status`, `search` |
| `GET` | `/api/admin/stats` | Users, equipment, approvals, bookings, revenue, 6-month series |

---

## Booking lifecycle

```
checkout ──▶ bookingDrafts (TTL 30 min)
                 │
                 ▼ Stripe reports paid
           payments (unique stripeSessionId)
                 │
                 ▼
            bookings (confirmed)
                 │
        owner marks active
                 ▼
              active ──▶ completed
                 │
          cancel before start
                 ▼
            cancelled (payment refunded)
```

- **No booking exists before payment is confirmed.** Checkout only creates a draft.
- Confirmation is idempotent: the unique index on `payments.stripeSessionId` prevents
  duplicates from a double redirect or a webhook arriving after the success page.
- Availability = sum of overlapping `confirmed`/`active` bookings + requested quantity ≤
  equipment quantity.
- Money is stored as integer cents (`totalAmountCents`); equipment rates are whole dollars.

### Automated completion and email

- `node-cron` runs a sweep **hourly at minute 0 (UTC)**, plus once three seconds after boot
  so a restarted server catches up immediately.
- Every `confirmed` or `active` booking whose `rentalEndDate` is in the past is moved to
  `completed` with an atomic `findOneAndUpdate`, which also records `completedAt` and
  `completionReason: "rental-end"`. The owner dashboard uses the same helper, so a manual
  completion and the cron job can never double-process a booking.
- On completion, `notifyCompletion` emails the **renter** and the **equipment owner**
  (`completionEmails`). `completionNotifiedAt` is written after sending, so retries and
  restarts do not spam inboxes.
- Without SMTP credentials the emails are logged, not sent — the status update still runs.

---

## Project structure

```
index.js                  app wiring, CORS, webhook mount, route mounts
scripts/seed.js           demo users, equipment and reviews
src/
  config/db.js            Mongo connection and index creation
  constants/index.js      categories and rental types
  middleware/auth.js      verifyToken + role guards
  middleware/error.js     404 and error handler
  jobs/booking-status.js  hourly cron sweep + post-boot catch-up
  routes/
    equipment.js          public catalogue + owner CRUD
    reviews.js            public reviews
    contact.js            rate-limited contact messages
    uploads.js            imgbb proxy
    users.js              profile
    favorites.js          favourites
    payments.js           checkout + confirm
    webhook.js            Stripe webhook
    bookings.js           customer bookings
    owner.js              owner management + stats
    admin.js              admin management + stats
  utils/
    availability.js       overlap + booked quantity
    pricing.js            date parsing and totals
    bookings.js           idempotent draft → booking
    completion.js         atomic completion + notification guard
    booking-emails.js     renter and owner completion templates
    mailer.js             nodemailer transport with console fallback
    query.js              shared pagination helpers
    serialize.js          ObjectId/Date serialisation
    validate.js           zod helper + error formatting
```

---

## Deployment

1. Create a Node service on Render, Railway or Fly with
   `npm install && npm start`.
2. Set `MONGODB_URI` (Atlas recommended), `BETTER_AUTH_URL` (the deployed client origin),
   and `CLIENT_URL` (same origin, plus any preview domains).
3. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `IMGBB_API_KEY` to enable those
   integrations, and the `SMTP_*` values to deliver completion emails.
4. Register the webhook: `https://<api-domain>/api/payments/webhook` for the
   `checkout.session.completed` event.
5. Verify `GET /api/health` returns `{ "status": "ok", "database": "connected" }`.

The booking status job runs inside the API process. Keep a single instance (or one instance
per cron owner) so the sweep is not duplicated; the atomic update makes duplicates harmless
anyway, but only one process should send the notification emails.

Keep `.env` out of git. `.env.example` documents every variable without values.
