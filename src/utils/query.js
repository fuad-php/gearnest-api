/**
 * Shared query helpers for paginated list endpoints.
 */

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePagination(query, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(query.limit) || defaultLimit),
  );

  return { page, limit, skip: (page - 1) * limit };
}

export async function paginate(
  collection,
  filter,
  { page, limit, skip, sort = { createdAt: -1 }, project },
) {
  let cursor = collection.find(filter).sort(sort).skip(skip).limit(limit);
  if (project) cursor = cursor.project(project);

  const [items, total] = await Promise.all([
    cursor.toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
