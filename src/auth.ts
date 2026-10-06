export interface AuthSession {
  authenticated: boolean;
  csrf: string;
  email: string | null;
  pending: boolean;
  retryAfter: number;
}

let csrf = "";

export async function authRequest<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result: { error?: string; csrf?: string };
  try {
    result = await response.json();
  } catch {
    throw new Error("Authentication service is unavailable. Please try again later.");
  }
  if (result.csrf) csrf = result.csrf;
  if (!response.ok) throw new Error(result.error || "The request failed. Please try again.");
  return result as T;
}
