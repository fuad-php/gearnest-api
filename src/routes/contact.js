import { Router } from "express";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
});

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.startedAt > WINDOW_MS) {
    hits.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

router.post("/", async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ message: "Too many messages. Try again later." });
  }

  const parsed = validate(contactSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  await getDB()
    .collection("contactMessages")
    .insertOne({ ...parsed.data, createdAt: new Date(), read: false });

  res.status(201).json({ message: "Message received. We will reply within one business day." });
});

export default router;
