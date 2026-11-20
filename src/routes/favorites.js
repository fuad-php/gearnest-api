import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";
import { serialize } from "../utils/serialize.js";

const router = Router();

router.use(verifyToken);

router.get("/", async (req, res) => {
  const favorites = await getDB()
    .collection("favorites")
    .aggregate([
      { $match: { userId: new ObjectId(req.user.id) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "equipment",
          localField: "equipmentId",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      { $match: { "equipment.status": "approved" } },
    ])
    .toArray();

  res.json({
    data: favorites.map((favorite) => ({
      id: String(favorite._id),
      createdAt: favorite.createdAt,
      equipment: serialize(favorite.equipment),
    })),
  });
});

router.get("/ids", async (req, res) => {
  const favorites = await getDB()
    .collection("favorites")
    .find({ userId: new ObjectId(req.user.id) })
    .project({ equipmentId: 1 })
    .toArray();

  res.json({ data: favorites.map((favorite) => String(favorite.equipmentId)) });
});

router.post("/:equipmentId", async (req, res) => {
  const { equipmentId } = req.params;

  if (!ObjectId.isValid(equipmentId)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const equipment = await getDB()
    .collection("equipment")
    .findOne({ _id: new ObjectId(equipmentId), status: "approved" });

  if (!equipment) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  const userId = new ObjectId(req.user.id);

  await getDB()
    .collection("favorites")
    .updateOne(
      { userId, equipmentId: equipment._id },
      { $setOnInsert: { userId, equipmentId: equipment._id, createdAt: new Date() } },
      { upsert: true },
    );

  res.status(201).json({ message: "Saved to favorites", data: { equipmentId } });
});

router.delete("/:equipmentId", async (req, res) => {
  const { equipmentId } = req.params;

  if (!ObjectId.isValid(equipmentId)) {
    return res.status(404).json({ message: "Equipment not found" });
  }

  await getDB()
    .collection("favorites")
    .deleteOne({
      userId: new ObjectId(req.user.id),
      equipmentId: new ObjectId(equipmentId),
    });

  res.json({ message: "Removed from favorites", data: { equipmentId } });
});

export default router;
