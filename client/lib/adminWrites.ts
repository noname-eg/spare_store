export type AdminWriteResult =
  | { ok: true; kind: "success"; status: number }
  | { ok: false; kind: "http" | "network" | "malformed"; status?: number; message: string };

export function defaultAdminStatusMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return "Some values are invalid. Please review the form and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You are not authorized to perform this action.";
    case 404:
      return "That record no longer exists. Refresh and try again.";
    case 409:
      return "That change conflicts with the current data. Refresh and try again.";
    case 413:
      return "The file is too large. Files must be 5MB or less.";
    case 429:
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "The server could not complete the change. Nothing was saved.";
  }
}

export function parseAdminWriteResponse(status: number, bodyText: string | null | undefined): AdminWriteResult {
  const text = typeof bodyText === "string" ? bodyText.trim() : "";
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (status >= 200 && status < 300) {
    // A 2xx carrying a non-JSON body (e.g. an HTML error page from a proxy) is never a success.
    if (text && (parsed === null || typeof parsed !== "object")) {
      return { ok: false, kind: "malformed", status, message: "The server returned an unrecognized response. Nothing was saved." };
    }
    return { ok: true, kind: "success", status };
  }

  if (text && (parsed === null || typeof parsed !== "object")) {
    return { ok: false, kind: "malformed", status, message: "The server returned an unrecognized response. Nothing was saved." };
  }

  const body = parsed as { error?: unknown; message?: unknown } | null;
  const raw = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
  const message = raw.trim() ? raw : defaultAdminStatusMessage(status);
  return { ok: false, kind: "http", status, message };
}

export async function adminRequest(url: string, init?: RequestInit): Promise<AdminWriteResult> {
  try {
    const response = await fetch(url, { credentials: "same-origin", ...init });
    const bodyText = await response.text().catch(() => null);
    return parseAdminWriteResponse(response.status, bodyText);
  } catch {
    return { ok: false, kind: "network", message: "We could not reach the server. Nothing was saved." };
  }
}

export function adminJsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
