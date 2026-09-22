export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30000),
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new Error(
        "The connection took too long. Please retry when you’re connected.",
      );
    throw new Error(
      "Could not connect. Check your internet connection and try again.",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The server could not complete the request. Please try again.",
    );
  }
  if (!response.ok)
    throw new Error(body.error || "Request failed. Please try again.");
  return body as T;
}
