import { Router } from "express";
import { getDB } from "../config/db.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

router.get("/", async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
  const filter = {};

  if (req.query.featured === "true") filter.featured = true;

  const reviews = await getDB()
    .collection("reviews")
    .find(filter)
    .sort({ featured: -1, createdAt: -1 })
    .limit(limit)
    .toArray();

  res.json({ data: serialize(reviews) });
});

export default router;
