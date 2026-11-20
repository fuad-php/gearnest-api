import { Router } from "express";
import { z } from "zod";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

const uploadSchema = z.object({
  image: z.string().min(100, "Image data is required"),
});

const hits = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;

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

router.post("/image", async (req, res) => {
  if (!process.env.IMGBB_API_KEY) {
    return res.status(503).json({
      message: "Image upload is not configured. Paste a direct image URL instead.",
    });
  }

  if (rateLimited(req.ip)) {
    return res.status(429).json({ message: "Too many uploads. Try again later." });
  }

  const parsed = validate(uploadSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const match = parsed.data.image.match(
    /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/,
  );

  if (!match) {
    return res.status(400).json({
      message: "Upload a PNG, JPG or WebP image",
    });
  }

  const base64 = match[2].replace(/\s/g, "");

  if (Buffer.byteLength(base64, "base64") > 5 * 1024 * 1024) {
    return res.status(413).json({ message: "Image must be smaller than 5MB" });
  }

  const form = new URLSearchParams();
  form.append("image", base64);
  form.append("name", `gearnest-${Date.now()}`);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    { method: "POST", body: form },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.success) {
    return res.status(502).json({
      message: body?.error?.message ?? "imgbb rejected the upload",
    });
  }

  return res.status(201).json({
    data: {
      url: body.data.url,
      displayUrl: body.data.display_url,
      thumb: body.data.thumb?.url ?? body.data.url,
      deleteUrl: body.data.delete_url,
    },
  });
});

export default router;
