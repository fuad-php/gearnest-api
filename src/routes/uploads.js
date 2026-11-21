
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Image validation schema
const uploadSchema = z.object({
  image: z.string().min(100, "Image data is required"),
});

// Rate limiting
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

// Image upload route
router.post("/image", async (req, res) => {
  try {
    // Check Cloudinary configuration
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({
        message:
          "Image upload is not configured. Paste a direct image URL instead.",
      });
    }

    // Rate limiting
    if (rateLimited(req.ip)) {
      return res.status(429).json({
        message: "Too many uploads. Try again later.",
      });
    }

    // Validate request body
    const parsed = validate(uploadSchema, req.body);

    if (!parsed.ok) {
      return badRequest(res, parsed.errors);
    }

    // Validate image data URI
    const match = parsed.data.image.match(
      /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/
    );

    if (!match) {
      return res.status(400).json({
        message: "Upload a PNG, JPG or WebP image",
      });
    }

    const base64 = match[2].replace(/\s/g, "");

    // Decode and validate actual image size
    const imageBuffer = Buffer.from(base64, "base64");

    if (imageBuffer.length === 0) {
      return res.status(400).json({
        message: "Invalid image data",
      });
    }

    if (imageBuffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({
        message: "Image must be smaller than 5MB",
      });
    }

    // Upload image to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      parsed.data.image,
      {
        folder: "gearnest",
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
        transformation: [
          {
            quality: "auto",
            fetch_format: "auto",
          },
        ],
      }
    );

    // Generate thumbnail URL
    const thumb = cloudinary.url(uploadResult.public_id, {
      secure: true,
      transformation: [
        {
          width: 300,
          height: 300,
          crop: "fill",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    });

    // Success response
    return res.status(201).json({
      data: {
        url: uploadResult.secure_url,
        displayUrl: uploadResult.secure_url,
        thumb,
        publicId: uploadResult.public_id,
      },
    });
  } catch (error) {
    console.error("Cloudinary image upload error:", error);

    return res.status(502).json({
      message: "Image upload failed. Please try again.",
    });
  }
});

export default router;
