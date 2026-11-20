import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDB } from "../config/db.js";
import { verifyAdmin } from "../middleware/auth.js";
import { serialize } from "../utils/serialize.js";
import { escapeRegex, paginate, parsePagination } from "../utils/query.js";
import { badRequest, validate } from "../utils/validate.js";

const router = Router();

router.use(verifyAdmin);

const roleSchema = z.object({
  role: z.enum(["customer", "owner", "admin"]),
});

const equipmentStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
});

router.get("/users", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.role && req.query.role !== "all") {
    filter.role = req.query.role;
  }

  if (req.query.search && String(req.query.search).trim()) {
    const term = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
    filter.$or = [{ name: term }, { email: term }];
  }

  const { items, total, pages } = await paginate(
    getDB().collection("user"),
    filter,
    {
      page,
      limit,
      skip,
      project: {
        name: 1,
        email: 1,
        role: 1,
        phone: 1,
        address: 1,
        image: 1,
        createdAt: 1,
      },
    },
  );

  res.json({
    data: serialize(items),
    page,
    limit,
    total,
    pages,
  });
});

router.patch("/users/:id/role", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "User not found" });
  }

  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot change your own role" });
  }

  const parsed = validate(roleSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const result = await getDB()
    .collection("user")
    .findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { role: parsed.data.role, updatedAt: new Date() } },
      { returnDocument: "after", projection: { password: 0 } },
    );

  if (!result) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ data: serialize(result) });
});

router.get("/equipment", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.status && req.query.status !== "all") {
    filter.status = req.query.status;
  }

  if (req.query.search && String(req.query.search).trim()) {
    const term = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
    filter.$or = [{ name: term }, { location: term }, { ownerEmail: term }];
  }

  const { items, total, pages } = await paginate(
    getDB().collection("equipment"),
    filter,
    { page, limit, skip },
  );

  res.json({
    data: serialize(items),
    page,
    limit,
    total,
    pages,
  });
});

router.patch("/equipment/:id/status", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const parsed = validate(equipmentStatusSchema, req.body);
  if (!parsed.ok) return badRequest(res, parsed.errors);

  const result = await getDB()
    .collection("equipment")
    .findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: parsed.data.status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

  if (!result) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  res.json({ data: serialize(result) });
});

router.get("/bookings", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.status && req.query.status !== "all") {
    filter.bookingStatus = req.query.status;
  }

  if (req.query.search && String(req.query.search).trim()) {
    const term = new RegExp(escapeRegex(String(req.query.search).trim()), "i");
    filter.$or = [
      { equipmentName: term },
      { customerName: term },
      { customerEmail: term },
      { ownerName: term },
    ];
  }

  const { items, total, pages } = await paginate(
    getDB().collection("bookings"),
    filter,
    { page, limit, skip },
  );

  res.json({
    data: serialize(items),
    page,
    limit,
    total,
    pages,
  });
});

router.get("/messages", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.read === "true") filter.read = true;
  if (req.query.read === "false") filter.read = false;

  const { items, total, pages } = await paginate(
    getDB().collection("contactMessages"),
    filter,
    { page, limit, skip },
  );

  res.json({ data: serialize(items), page, limit, total, pages });
});

router.patch("/messages/:id/read", async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Message not found" });
  }

  const result = await getDB()
    .collection("contactMessages")
    .findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: { read: true, readAt: new Date() } },
      { returnDocument: "after" },
    );

  if (!result) {
    return res.status(404).json({ message: "Message not found" });
  }

  res.json({ data: serialize(result) });
});

function monthKeys(months = 6) {
  const keys = [];
  const now = new Date();

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  return keys;
}

router.get("/stats", async (req, res) => {
  const db = getDB();

  const [
    totalUsers,
    totalOwners,
    totalCustomers,
    totalEquipment,
    pendingApprovals,
    totalBookings,
    completedRentals,
    revenue,
  ] = await Promise.all([
    db.collection("user").countDocuments(),
    db.collection("user").countDocuments({ role: "owner" }),
    db.collection("user").countDocuments({ role: "customer" }),
    db.collection("equipment").countDocuments(),
    db.collection("equipment").countDocuments({ status: "pending" }),
    db.collection("bookings").countDocuments(),
    db.collection("bookings").countDocuments({ bookingStatus: "completed" }),
    db
      .collection("bookings")
      .aggregate([
        {
          $match: {
            paymentStatus: "paid",
            bookingStatus: { $in: ["confirmed", "active", "completed"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmountCents" } } },
      ])
      .toArray(),
  ]);

  const start = new Date();
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const monthly = await db
    .collection("bookings")
    .aggregate([
      { $match: { createdAt: { $gte: start }, paymentStatus: "paid" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          bookings: { $sum: 1 },
          revenueCents: { $sum: "$totalAmountCents" },
        },
      },
    ])
    .toArray();

  const monthlyMap = new Map(monthly.map((entry) => [entry._id, entry]));

  res.json({
    data: {
      totalUsers,
      totalOwners,
      totalCustomers,
      totalEquipment,
      pendingApprovals,
      totalBookings,
      completedRentals,
      totalRevenueCents: revenue[0]?.total ?? 0,
      monthly: monthKeys().map((key) => ({
        month: key,
        bookings: monthlyMap.get(key)?.bookings ?? 0,
        revenueCents: monthlyMap.get(key)?.revenueCents ?? 0,
      })),
    },
  });
});

export default router;
