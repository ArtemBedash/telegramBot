export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function ensurePost(req: Request): Response | null {
  if (req.method === "POST") {
    return null;
  }

  return json({ error: "Method not allowed" }, 405);
}
