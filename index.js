import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB, getDB } from "./src/config/db.js";
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

const app = express();
const port = process.env.PORT || 5000;

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
    app.listen(port, () => {
      console.log(`GearNest API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
