export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers
  });
}

export function text(data: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "text/plain; charset=utf-8");

  return new Response(data, {
    ...init,
    headers
  });
}

export function html(data: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(data, {
    ...init,
    headers
  });
}
