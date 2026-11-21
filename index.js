import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB, closeDB, getDB } from "./src/config/db.js";
import { errorHandler, notFound } from "./src/middleware/error.js";
import equipmentRouter from "./src/routes/equipment.js";
import reviewsRouter from "./src/routes/reviews.js";
import contactRouter from "./src/routes/contact.js";
import uploadsRouter from "./src/routes/uploads.js";
import usersRouter from "./src/routes/users.js";
import favoritesRouter from "./src/routes/favorites.js";
import paymentsRouter from "./src/routes/payments.js";
import bookingsRouter from "./src/routes/bookings.js";
import ownerRouter from "./src/routes/owner.js";
import adminRouter from "./src/routes/admin.js";
import { stripeWebhook } from "./src/routes/webhook.js";
import { startBookingStatusJob } from "./src/jobs/booking-status.js";
import { mailProvider } from "./src/utils/mailer.js";

const app = express();
const port = process.env.PORT || 5000;

// Behind a proxy (Render, Railway, Fly) req.ip must come from X-Forwarded-For
// so the contact rate limiter sees the real client address.
app.set("trust proxy", 1);
app.disable("x-powered-by");

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

app.use(express.json({ limit: "12mb" }));
app.use(morgan("dev"));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    name: "GearNest API",
    version: "1.0.0",
    status: "ok",
    docs: "/api/health",
  });
});

app.get("/api/health", async (req, res) => {
  const db = getDB();
  await db.command({ ping: 1 });
  res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
});

app.use("/api/equipment", equipmentRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/contact", contactRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/users", usersRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/owner", ownerRouter);
app.use("/api/admin", adminRouter);

app.use(notFound);
app.use(errorHandler);

connectDB()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`GearNest API listening on http://localhost:${port}`);
      console.log(`[mail] provider: ${mailProvider()}`);
      startBookingStatusJob();
    });

    async function shutdown(signal) {
      console.log(`${signal} received, closing server`);
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });

      setTimeout(() => process.exit(1), 10_000).unref();
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
