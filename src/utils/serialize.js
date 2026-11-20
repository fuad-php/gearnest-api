export function serialize(value) {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(serialize);

  if (typeof value === "object") {
    if (value._bsontype === "ObjectId" || value._bsontype === "ObjectID") {
      return value.toString();
    }

    const { _id, ...rest } = value;
    const output = _id !== undefined ? { id: String(_id) } : {};

    for (const [key, item] of Object.entries(rest)) {
      output[key] = serialize(item);
    }

    return output;
  }

  return value;
}

export function toObjectId(id) {
  if (!id || typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) return null;
  return id;
}
