export async function request<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!r.ok) {
    let error = "Сервис недоступен.";
    try {
      error = (await r.json()).error ?? error;
    } catch {}
    throw Object.assign(new Error(error), { status: r.status });
  }
  return r.json();
}
