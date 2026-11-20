import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { CATEGORIES, RENTAL_TYPES } from "../constants/index.js";
import { verifyOwner, verifyOwnerOrAdmin } from "../middleware/auth.js";
import { bookedQuantity } from "../utils/availability.js";
import { parseDateRange } from "../utils/pricing.js";
import { serialize } from "../utils/serialize.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

const equipmentSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(20).max(4000),
  category: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(120),
  price: z.coerce.number().positive().max(1_000_000),
  rentalType: z.enum(RENTAL_TYPES),
  quantity: z.coerce.number().int().positive().max(10_000),
  condition: z.string().trim().min(2).max(60),
  brand: z.string().trim().max(80).optional().default(""),
  model: z.string().trim().max(80).optional().default(""),
  image: z.string().url(),
  terms: z.string().trim().min(10).max(4000),
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query) {
  const filter = { status: "approved" };
  const { search, category, rentalType, minPrice, maxPrice, availability } = query;

  if (search && String(search).trim()) {
    const term = new RegExp(escapeRegex(String(search).trim()), "i");
    filter.$or = [{ name: term }, { location: term }, { category: term }, { brand: term }];
  }

  if (category && category !== "all") filter.category = category;
  if (rentalType && rentalType !== "all") filter.rentalType = rentalType;

  const price = {};
  if (minPrice !== undefined && minPrice !== "") price.$gte = Number(minPrice);
  if (maxPrice !== undefined && maxPrice !== "") price.$lte = Number(maxPrice);
  if (Object.keys(price).length) filter.price = price;

  if (availability === "available") filter.quantity = { $gt: 0 };
  if (availability === "unavailable") filter.quantity = { $lte: 0 };

  return filter;
}

const SORTS = {
  recent: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  name_asc: { name: 1 },
};

router.get("/", async (req, res) => {
  const db = getDB();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 9));
  const sort = SORTS[req.query.sort] || SORTS.recent;
  const filter = buildFilter(req.query);

  const collection = db.collection("equipment");
  const [items, total] = await Promise.all([
    collection
      .find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
  ]);

  res.json({
    data: serialize(items),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get("/featured", async (req, res) => {
  const items = await getDB()
    .collection("equipment")
    .find({ status: "approved" })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  res.json({ data: serialize(items) });
});

router.get("/categories", async (req, res) => {
  const counts = await getDB()
    .collection("equipment")
    .aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ])
    .toArray();

  const countMap = new Map(counts.map((entry) => [entry._id, entry.count]));

  res.json({
    data: CATEGORIES.map((category) => ({
      ...category,
      count: countMap.get(category.label) ?? 0,
    })),
  });
});

router.get("/:id", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const [equipment] = await getDB()
    .collection("equipment")
    .aggregate([
      { $match: { _id: new ObjectId(req.params.id), status: "approved" } },
      {
        $lookup: {
          from: "user",
          localField: "ownerId",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          owner: {
            $cond: [
              { $ifNull: ["$owner", false] },
              {
                id: { $toString: "$owner._id" },
                name: "$owner.name",
                email: "$owner.email",
                image: "$owner.image",
                phone: "$owner.phone",
                address: "$owner.address",
                createdAt: "$owner.createdAt",
              },
              null,
            ],
          },
        },
      },
      { $project: { ownerId: 0 } },
    ])
    .toArray();

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  res.json({ data: serialize(equipment) });
});

router.get("/:id/availability", async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ message: "startDate and endDate are required" });
  }

  const range = parseDateRange(startDate, endDate);
  if (range.error) return res.status(400).json({ message: range.error });

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const equipment = await getDB()
    .collection("equipment")
    .findOne({ _id: new ObjectId(req.params.id), status: "approved" });

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const booked = await bookedQuantity(
    getDB(),
    equipment._id,
    range.start,
    range.end,
  );

  res.json({
    data: {
      quantity: equipment.quantity,
      booked,
      remaining: Math.max(0, Number(equipment.quantity) - booked),
    },
  });
});

router.post("/", verifyOwner, async (req, res) => {
  const parsed = validate(equipmentSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const now = new Date();
  const doc = {
    ...parsed.data,
    status: "pending",
    ownerId: new ObjectId(req.user.id),
    ownerName: req.user.name,
    ownerEmail: req.user.email,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getDB().collection("equipment").insertOne(doc);
  res.status(201).json({ data: serialize({ ...doc, _id: result.insertedId }) });
});

router.patch("/:id", verifyOwnerOrAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const db = getDB();
  const equipment = await db
    .collection("equipment")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const isOwner = String(equipment.ownerId) === req.user.id;
  if (!isOwner && req.user.role !== "admin") {
    return res.status(403).json({ message: "You can only update your own equipment" });
  }

  const parsed = validate(equipmentSchema.partial(), req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const updates = { ...parsed.data, updatedAt: new Date() };
  if (req.user.role !== "admin") delete updates.status;

  await db
    .collection("equipment")
    .updateOne({ _id: equipment._id }, { $set: updates });

  res.json({ data: serialize({ ...equipment, ...updates }) });
});

router.delete("/:id", verifyOwnerOrAdmin, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const db = getDB();
  const equipment = await db
    .collection("equipment")
    .findOne({ _id: new ObjectId(req.params.id) });

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const isOwner = String(equipment.ownerId) === req.user.id;
  if (!isOwner && req.user.role !== "admin") {
    return res.status(403).json({ message: "You can only delete your own equipment" });
  }

  await db.collection("equipment").deleteOne({ _id: equipment._id });
  await db.collection("favorites").deleteMany({ equipmentId: equipment._id });

  res.json({ message: "Equipment deleted" });
});

export default router;
