import "dotenv/config";
import { randomBytes, scrypt } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required to seed the database");
  process.exit(1);
}

const DAY = 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (error, key) => {
        if (error) reject(error);
        else resolve(`${salt}:${key.toString("hex")}`);
      },
    );
  });
}

const DEMO_USERS = [
  {
    name: "Avery Stone",
    email: "admin@gearnest.com",
    password: "Admin123",
    role: "admin",
    phone: "+1 (512) 555-0110",
    address: "120 Congress Ave, Austin, TX",
  },
  {
    name: "Marcus Reed",
    email: "owner@gearnest.com",
    password: "Owner123",
    role: "owner",
    phone: "+1 (512) 555-0142",
    address: "88 Barton Springs Rd, Austin, TX",
  },
  {
    name: "Priya Nair",
    email: "customer@gearnest.com",
    password: "Customer123",
    role: "customer",
    phone: "+1 (512) 555-0177",
    address: "45 Rainey St, Austin, TX",
  },
  {
    name: "Elena Cruz",
    email: "elena@gearnest.com",
    password: "Owner123",
    role: "owner",
    phone: "+1 (512) 555-0188",
    address: "2100 S Lamar Blvd, Austin, TX",
  },
];

const OWNER_ONE = "owner@gearnest.com";
const OWNER_TWO = "elena@gearnest.com";

const EQUIPMENT = [
  {
    name: "CAT 320 Excavator",
    description:
      "A 20-ton hydraulic excavator with a 1.2 m³ bucket, ideal for trenching, demolition and site preparation. Delivered with a full tank and a certified operator available on request.",
    category: "Construction Equipment",
    location: "Austin, TX",
    price: 420,
    rentalType: "daily",
    quantity: 2,
    condition: "Excellent",
    brand: "Caterpillar",
    model: "320 GC",
    image:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Operator licence required. Fuel is the renter's responsibility. A refundable security deposit applies. Return clean and on time to avoid additional charges.",
    owner: OWNER_ONE,
    featured: true,
  },
  {
    name: "Concrete Mixer 350L",
    description:
      "Towable 350-litre drum mixer with a reliable 5.5 HP engine. Perfect for footings, patios and small pours. Includes a hose and mixing paddle.",
    category: "Construction Equipment",
    location: "Round Rock, TX",
    price: 65,
    rentalType: "daily",
    quantity: 6,
    condition: "Good",
    brand: "Multiquip",
    model: "MC-64P",
    image:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Drain and rinse the drum before return. Do not use with flammable additives. Late returns are charged at the daily rate.",
    owner: OWNER_ONE,
    featured: true,
  },
  {
    name: "Sony A7 IV Cinema Kit",
    description:
      "Full-frame mirrorless kit with 24-70mm f/2.8 lens, two spare batteries, 128GB cards, cage and a travel case. Tuned for interviews, events and short films.",
    category: "Photography Equipment",
    location: "Austin, TX",
    price: 95,
    rentalType: "daily",
    quantity: 3,
    condition: "Excellent",
    brand: "Sony",
    model: "A7 IV",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Equipment must be returned with all accessories. Damage or water exposure is charged at repair cost. No sub-renting.",
    owner: OWNER_TWO,
    featured: true,
  },
  {
    name: "Aputure 600D Lighting Kit",
    description:
      "Daylight-balanced 600W COB light with softbox, light stand and V-mount battery plate. A dependable key light for studio and location work.",
    category: "Photography Equipment",
    location: "Cedar Park, TX",
    price: 80,
    rentalType: "daily",
    quantity: 4,
    condition: "Excellent",
    brand: "Aputure",
    model: "LS 600D Pro",
    image:
      "https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Allow the fixture to cool before packing. Do not remove the reflector while powered. Case and cables must be returned.",
    owner: OWNER_TWO,
    featured: true,
  },
  {
    name: "Ford F-250 Pickup",
    description:
      "Crew-cab 4x4 pickup with a 6.7L diesel engine, tow package and bed liner. Great for hauling trailers, equipment and crew across town.",
    category: "Vehicles & Transportation",
    location: "Austin, TX",
    price: 130,
    rentalType: "daily",
    quantity: 2,
    condition: "Good",
    brand: "Ford",
    model: "F-250 Lariat",
    image:
      "https://images.unsplash.com/photo-1551830820-330a71b99659?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Valid driver's licence and proof of insurance required. 150 miles per day included, then $0.45 per extra mile. No smoking.",
    owner: OWNER_ONE,
    featured: true,
  },
  {
    name: "Cargo Van 12ft",
    description:
      "High-roof cargo van with 12 feet of load space, shelving and a rear step. Ideal for deliveries, moves and on-site production days.",
    category: "Vehicles & Transportation",
    location: "Pflugerville, TX",
    price: 110,
    rentalType: "daily",
    quantity: 3,
    condition: "Good",
    brand: "Mercedes-Benz",
    model: "Sprinter 2500",
    image:
      "https://images.unsplash.com/photo-1527786356703-4b100091cd2c?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Return with the same fuel level. 200 miles per day included. Cargo must be secured by the renter.",
    owner: OWNER_ONE,
    featured: false,
  },
  {
    name: "John Deere 5075E Tractor",
    description:
      "75 HP utility tractor with front-end loader, box blade and pallet forks. Handles grading, hauling and acreage work with ease.",
    category: "Agriculture Equipment",
    location: "Bastrop, TX",
    price: 260,
    rentalType: "daily",
    quantity: 1,
    condition: "Excellent",
    brand: "John Deere",
    model: "5075E",
    image:
      "https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Operators must be experienced with tractors. Diesel refill required. Implements must be returned cleaned.",
    owner: OWNER_TWO,
    featured: true,
  },
  {
    name: "Combine Harvester",
    description:
      "Self-propelled combine with a 20-foot header, yield monitor and air-conditioned cab. Available for seasonal harvest contracts across Central Texas.",
    category: "Agriculture Equipment",
    location: "Lockhart, TX",
    price: 3200,
    rentalType: "monthly",
    quantity: 1,
    condition: "Good",
    brand: "Case IH",
    model: "Axial-Flow 6150",
    image:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Monthly rental includes scheduled maintenance. Fuel, transport and header repairs are the renter's responsibility. 30-day minimum.",
    owner: OWNER_TWO,
    featured: false,
  },
  {
    name: "DJI Mavic 3 Pro",
    description:
      "Triple-camera drone with 4/3 CMOS sensor, 43-minute flight time and a smart controller. Includes three batteries and a hard case.",
    category: "Electronics",
    location: "Austin, TX",
    price: 75,
    rentalType: "daily",
    quantity: 5,
    condition: "Excellent",
    brand: "DJI",
    model: "Mavic 3 Pro",
    image:
      "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1200&q=80",
    terms:
      "FAA registration and Part 107 certification required for commercial flights. Fly-away or crash damage is charged at replacement value.",
    owner: OWNER_ONE,
    featured: false,
  },
  {
    name: "4K Laser Projector",
    description:
      "6,000-lumen 4K laser projector with HDMI 2.1, lens shift and a 120-inch screen. Built for screenings, conferences and outdoor events.",
    category: "Electronics",
    location: "San Marcos, TX",
    price: 120,
    rentalType: "daily",
    quantity: 3,
    condition: "Excellent",
    brand: "Epson",
    model: "Pro L730U",
    image:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Do not expose the lens to direct sunlight. Return the remote, cables and screen. A cleaning fee applies if the lens is marked.",
    owner: OWNER_TWO,
    featured: false,
  },
  {
    name: "Event Stage & Truss Kit",
    description:
      "Modular 24ft x 16ft stage with adjustable legs, aluminum truss, stairs and skirting. Includes delivery within 30 miles of Austin.",
    category: "Event Equipment",
    location: "Austin, TX",
    price: 380,
    rentalType: "daily",
    quantity: 2,
    condition: "Good",
    brand: "Global Truss",
    model: "F34 Stage Kit",
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    terms:
      "Renter is responsible for safe assembly and supervision. Outdoor use requires weighted ballast. Delivery outside 30 miles is quoted separately.",
    owner: OWNER_ONE,
    featured: false,
  },
  {
    name: "Line Array Sound System",
    description:
      "12-box line array with subwoofers, amps and a digital console. Suitable for 1,500-capacity venues, festivals and corporate events.",
    category: "Event Equipment",
    location: "Georgetown, TX",
    price: 900,
    rentalType: "weekly",
    quantity: 2,
    condition: "Excellent",
    brand: "JBL",
    model: "VTX A8",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
    terms:
      "A technician is required for rigging. Weekly rate includes one setup and one teardown. Damage to drivers is charged per unit.",
    owner: OWNER_TWO,
    featured: false,
  },
];

const REVIEWS = [
  {
    name: "Jordan Ellis",
    location: "Austin, TX",
    rating: 5,
    role: "Customer",
    comment:
      "Booked an excavator on Friday and it was on site by Saturday morning. The listing was accurate and the owner walked me through the controls.",
    featured: true,
  },
  {
    name: "Sofia Bennett",
    location: "Round Rock, TX",
    rating: 5,
    role: "Customer",
    comment:
      "The camera kit arrived spotless and fully charged. Payment was simple and I could see the total before checkout. Will rent again.",
    featured: true,
  },
  {
    name: "Daniel Okafor",
    location: "Cedar Park, TX",
    rating: 4,
    role: "Owner",
    comment:
      "Listing my lighting gear took ten minutes. The approval was quick and the rental calendar keeps double bookings from happening.",
    featured: true,
  },
  {
    name: "Mei Lin",
    location: "Pflugerville, TX",
    rating: 5,
    role: "Customer",
    comment:
      "Needed a cargo van for a last-minute move. The owner replied within the hour and the pickup was painless. Great experience overall.",
    featured: true,
  },
  {
    name: "Carlos Mendes",
    location: "Bastrop, TX",
    rating: 5,
    role: "Owner",
    comment:
      "The dashboard shows exactly what I earn each month. I have added two more machines because the demand is clearly there.",
    featured: true,
  },
  {
    name: "Hannah Brooks",
    location: "San Marcos, TX",
    rating: 4,
    role: "Customer",
    comment:
      "Clear terms, fair pricing and a secure checkout. The only thing I would change is more weekend availability for the sound system.",
    featured: true,
  },
];

const SEED_BOOKINGS = [
  {
    key: "seed_booking_completed",
    equipment: "CAT 320 Excavator",
    startOffset: -45,
    endOffset: -42,
    quantity: 1,
    days: 3,
    amountCents: 126_000,
    bookingStatus: "completed",
    notes: "Left the keys with the site foreman.",
  },
  {
    key: "seed_booking_active",
    equipment: "Sony A7 IV Cinema Kit",
    startOffset: -2,
    endOffset: 3,
    quantity: 1,
    days: 5,
    amountCents: 47_500,
    bookingStatus: "active",
    notes: "Picked up for a three-day shoot, extended by two.",
  },
  {
    key: "seed_booking_confirmed",
    equipment: "Event Stage & Truss Kit",
    startOffset: 10,
    endOffset: 12,
    quantity: 1,
    days: 2,
    amountCents: 76_000,
    bookingStatus: "confirmed",
    notes: "Outdoor community event — ballast required.",
  },
  {
    key: "seed_booking_cancelled",
    equipment: "Cargo Van 12ft",
    startOffset: 20,
    endOffset: 23,
    quantity: 1,
    days: 3,
    amountCents: 33_000,
    bookingStatus: "cancelled",
    notes: "Move date changed.",
  },
];

const SEED_FAVORITES = ["Sony A7 IV Cinema Kit", "DJI Mavic 3 Pro"];

async function seedDemoActivity(db, userIds) {
  const customer = await db
    .collection("user")
    .findOne({ email: "customer@gearnest.com" });

  if (!customer) return;

  const now = Date.now();
  let bookingCount = 0;

  for (const item of SEED_BOOKINGS) {
    const equipment = await db
      .collection("equipment")
      .findOne({ name: item.equipment });

    if (!equipment) continue;

    const exists = await db
      .collection("bookings")
      .findOne({ stripeSessionId: item.key });

    if (exists) continue;

    const start = new Date(now + item.startOffset * DAY);
    const end = new Date(now + item.endOffset * DAY);
    const cancelled = item.bookingStatus === "cancelled";

    await db.collection("bookings").insertOne({
      equipmentId: equipment._id,
      equipmentName: equipment.name,
      equipmentImage: equipment.image,
      customerId: customer._id,
      customerName: customer.name,
      customerEmail: customer.email,
      ownerId: equipment.ownerId,
      ownerName: equipment.ownerName,
      rentalStartDate: start,
      rentalEndDate: end,
      quantity: item.quantity,
      days: item.days,
      totalAmountCents: item.amountCents,
      paymentStatus: cancelled ? "refunded" : "paid",
      bookingStatus: item.bookingStatus,
      contactNumber: customer.phone,
      deliveryAddress: customer.address,
      notes: item.notes,
      stripeSessionId: item.key,
      provider: "demo",
      createdAt: new Date(now + (item.startOffset - 1) * DAY),
      updatedAt: new Date(),
    });

    await db.collection("payments").updateOne(
      { stripeSessionId: item.key },
      {
        $setOnInsert: {
          customerId: customer._id,
          ownerId: equipment.ownerId,
          amountCents: item.amountCents,
          currency: "usd",
          provider: "demo",
          status: cancelled ? "refunded" : "paid",
          createdAt: new Date(now + (item.startOffset - 1) * DAY),
        },
      },
      { upsert: true },
    );

    bookingCount += 1;
  }

  console.log(`demo bookings inserted: ${bookingCount}`);

  for (const name of SEED_FAVORITES) {
    const equipment = await db.collection("equipment").findOne({ name });
    if (!equipment) continue;

    await db.collection("favorites").updateOne(
      { userId: customer._id, equipmentId: equipment._id },
      {
        $setOnInsert: {
          userId: customer._id,
          equipmentId: equipment._id,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("gear_nest");

  const userIds = new Map();

  for (const demo of DEMO_USERS) {
    let user = await db.collection("user").findOne({ email: demo.email });

    if (!user) {
      const now = new Date();
      const _id = new ObjectId();
      user = {
        _id,
        name: demo.name,
        email: demo.email,
        emailVerified: true,
        image: null,
        role: demo.role,
        phone: demo.phone,
        address: demo.address,
        createdAt: now,
        updatedAt: now,
      };

      await db.collection("user").insertOne(user);

      await db.collection("account").insertOne({
        _id: new ObjectId(),
        userId: _id,
        accountId: String(_id),
        providerId: "credential",
        password: await hashPassword(demo.password),
        createdAt: now,
        updatedAt: now,
      });

      console.log(`created ${demo.role}: ${demo.email}`);
    } else {
      await db.collection("user").updateOne(
        { _id: user._id },
        { $set: { role: demo.role, phone: demo.phone, address: demo.address } },
      );
      console.log(`updated ${demo.role}: ${demo.email}`);
    }

    userIds.set(demo.email, user._id);
  }

  let created = 0;

  for (const [index, item] of EQUIPMENT.entries()) {
    const exists = await db.collection("equipment").findOne({ name: item.name });
    if (exists) continue;

    const ownerId = userIds.get(item.owner);
    const createdAt = new Date(Date.now() - (EQUIPMENT.length - index) * DAY);

    await db.collection("equipment").insertOne({
      name: item.name,
      description: item.description,
      category: item.category,
      location: item.location,
      price: item.price,
      rentalType: item.rentalType,
      quantity: item.quantity,
      condition: item.condition,
      brand: item.brand,
      model: item.model,
      image: item.image,
      terms: item.terms,
      status: "approved",
      featured: item.featured,
      ownerId,
      ownerName: DEMO_USERS.find((user) => user.email === item.owner)?.name ?? "",
      ownerEmail: item.owner,
      createdAt,
      updatedAt: createdAt,
    });

    created += 1;
  }

  console.log(`equipment inserted: ${created}`);

  const reviewCount = await db.collection("reviews").countDocuments();
  if (reviewCount === 0) {
    const now = Date.now();
    await db.collection("reviews").insertMany(
      REVIEWS.map((review, index) => ({
        ...review,
        avatar: null,
        createdAt: new Date(now - index * DAY),
      })),
    );
    console.log(`reviews inserted: ${REVIEWS.length}`);
  } else {
    console.log(`reviews already present: ${reviewCount}`);
  }

  await seedDemoActivity(db, userIds);

  await db.collection("equipment").createIndexes([
    { key: { status: 1, createdAt: -1 }, name: "status_created" },
    { key: { category: 1, status: 1 }, name: "category_status" },
    { key: { ownerId: 1, createdAt: -1 }, name: "owner_created" },
  ]);
  await db
    .collection("reviews")
    .createIndex({ featured: 1, createdAt: -1 }, { name: "reviews_featured" });

  await client.close();
  console.log("Seed complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
