import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

let jwks;

function getJwks() {
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("BETTER_AUTH_URL is not set");

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${baseUrl}/api/auth/jwks`));
  }

  return jwks;
}

export async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const baseUrl = process.env.BETTER_AUTH_URL;
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: baseUrl,
      audience: baseUrl,
    });

    if (!payload.sub || !ObjectId.isValid(payload.sub)) {
      return res.status(401).json({ message: "Invalid session token" });
    }

    const user = await getDB()
      .collection("user")
      .findOne({ _id: new ObjectId(payload.sub) });

    if (!user) {
      return res.status(401).json({ message: "Account no longer exists" });
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: user.role ?? "customer",
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session token" });
  }
}

function verifyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to do that" });
    }

    return next();
  };
}

export const verifyRenter = [verifyToken, verifyRole("customer")];
export const verifyOwner = [verifyToken, verifyRole("owner")];
export const verifyAdmin = [verifyToken, verifyRole("admin")];
export const verifyOwnerOrAdmin = [verifyToken, verifyRole("owner", "admin")];
