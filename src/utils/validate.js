export function validate(schema, payload) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message,
    }));
    return { ok: false, errors };
  }

  return { ok: true, data: result.data };
}

export function badRequest(res, errors) {
  return res.status(400).json({ message: "Validation failed", errors });
}
