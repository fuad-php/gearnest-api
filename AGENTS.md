# GearNest API — Agent Guide

Express 5 + MongoDB (native driver), JavaScript ESM. Sibling client at `../client`.

## Commands

- `npm run dev` — nodemon on `PORT` (default 5000)
- `npm run start` — production
- `npm run seed` — insert demo users/equipment/reviews (idempotent)

## Layout

```
index.js                 app bootstrap, CORS, JSON, routes, error handlers
src/config/db.js         MongoClient singleton + collection helpers
src/middleware/          verifyToken, verifyRenter, verifyOwner, verifyAdmin, error
src/routes/              equipment, users, favorites, bookings, payments, stats, reviews, contact, uploads
src/utils/               pricing, availability, asyncHandler, validate
scripts/seed.js
```

## Auth contract

- BetterAuth (in the client) issues JWTs. This server never issues tokens.
- `verifyToken` reads `Authorization: Bearer <jwt>`, verifies with `jose` against
  `${BETTER_AUTH_URL}/api/auth/jwks` (issuer/audience must match), then loads the user from
  the `user` collection by `_id` and attaches `req.user` (`{ id, name, email, role, image }`).
- Role always comes from the database, never from the token payload alone.
- `verifyRenter` → role `customer`; `verifyOwner` → `owner`; `verifyAdmin` → `admin`.
- Admin may also call owner endpoints where explicitly allowed (pass `{ allowAdmin: true }`).

## Rules

- Every route validates input with zod; return `{ message, errors? }` on 400.
- Never accept price, total, ownerId, role, or status from the client when the server can derive it.
- Availability: sum quantities of `confirmed`/`active` bookings overlapping the requested
  date range; reject if it exceeds `equipment.quantity`.
- Pricing: daily = days, weekly = ceil(days/7), monthly = ceil(days/30), × quantity, min 1 day.
  Store money as integer cents (`amountCents`).
- Bookings are created only after Stripe confirms payment. `/api/payments/checkout` writes a
  `bookingDrafts` doc; `/api/payments/confirm` verifies the session and writes `bookings` +
  `payments` idempotently (unique index on `stripeSessionId`).
- Public equipment queries always filter `status: "approved"`.
- ObjectIds: convert string params with `ObjectId.isValid`; 404 on missing docs.
- CORS: only `CLIENT_URL`, credentials not needed (Bearer tokens).
- Env: `MONGODB_URI`, `PORT`, `BETTER_AUTH_URL`, `CLIENT_URL`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `IMGBB_API_KEY`. Never hardcode or commit them.

## Response shape

```js
// success
{ data: ..., page, total, pages }   // lists
{ data: ... }                        // single
// error
{ message: "..." }
```

## Git

Conventional commits, one logical change each. This repo needs 12+ meaningful commits.
Do not commit `.env`, `node_modules`, or logs.
