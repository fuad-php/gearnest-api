import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not set. Add it to server/.env");
}

let client;
let db;

export async function connectDB() {
  if (db) return db;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db("gear_nest");

  await ensureIndexes(db);
  console.log("MongoDB connected");
  return db;
}

export function getDB() {
  if (!db) throw new Error("Database has not been connected yet");
  return db;
}

export async function closeDB() {
  await client?.close();
  client = undefined;
  db = undefined;
}

async function ensureIndexes(database) {
  await database
    .collection("equipment")
    .createIndexes([
      { key: { status: 1, createdAt: -1 }, name: "status_created" },
      { key: { category: 1, status: 1 }, name: "category_status" },
      { key: { ownerId: 1, createdAt: -1 }, name: "owner_created" },
      { key: { name: "text", location: "text" }, name: "equipment_search" },
    ]);

  await database
    .collection("favorites")
    .createIndex({ userId: 1, equipmentId: 1 }, { unique: true, name: "favorite_unique" });

  await database
    .collection("bookings")
    .createIndexes([
      { key: { customerId: 1, createdAt: -1 }, name: "customer_created" },
      { key: { ownerId: 1, createdAt: -1 }, name: "owner_bookings" },
      { key: { equipmentId: 1, bookingStatus: 1 }, name: "equipment_status" },
    ]);

  await database
    .collection("payments")
    .createIndex({ stripeSessionId: 1 }, { unique: true, name: "payment_session_unique" });

  await database
    .collection("bookingDrafts")
    .createIndexes([
      { key: { stripeSessionId: 1 }, unique: true, name: "draft_session_unique" },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "draft_ttl" },
    ]);

  await database
    .collection("reviews")
    .createIndex({ featured: 1, createdAt: -1 }, { name: "reviews_featured" });
}
