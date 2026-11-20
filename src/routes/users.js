import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";
import { serialize } from "../utils/serialize.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  image: z.union([z.url(), z.literal("")]).optional().default(""),
});

router.get("/me", verifyToken, async (req, res) => {
  const user = await getDB()
    .collection("user")
    .findOne({ _id: new ObjectId(req.user.id) });

  if (!user) return res.status(404).json({ message: "Account not found" });

  const { password, ...safe } = user;
  res.json({ data: serialize(safe) });
});

router.patch("/me", verifyToken, async (req, res) => {
  const parsed = validate(profileSchema.partial(), req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const updates = { ...parsed.data, updatedAt: new Date() };
  if (updates.image === "") updates.image = null;

  await getDB()
    .collection("user")
    .updateOne({ _id: new ObjectId(req.user.id) }, { $set: updates });

  const user = await getDB()
    .collection("user")
    .findOne({ _id: new ObjectId(req.user.id) });

  const { password, ...safe } = user;
  res.json({ data: serialize(safe) });
});

export default router;
