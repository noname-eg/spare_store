import { describe, expect, it } from "vitest";
import { adminJsonInit, defaultAdminStatusMessage, parseAdminWriteResponse } from "./adminWrites";

describe("parseAdminWriteResponse", () => {
  it("A: treats 200 with an empty body as success", () => {
    const result = parseAdminWriteResponse(200, "");
    expect(result.ok).toBe(true);
    if (result.kind === "success") expect(result.status).toBe(200);
  });

  it("B: treats 200 with a JSON body as success", () => {
    const result = parseAdminWriteResponse(200, JSON.stringify({ ok: true }));
    expect(result.ok).toBe(true);
  });

  it("C: treats 204 no-content as success", () => {
    const result = parseAdminWriteResponse(204, null);
    expect(result.ok).toBe(true);
  });

  it("D: never reports success for a 500, even with a JSON body", () => {
    const result = parseAdminWriteResponse(500, JSON.stringify({ error: "insert into products failed" }));
    expect(result.ok).toBe(false);
    if (result.kind !== "success") {
      expect(result.kind).toBe("http");
      expect(result.status).toBe(500);
      expect(result.message).toBe("insert into products failed");
    }
  });

  it("E: surfaces the server message for a 400 validation failure", () => {
    const result = parseAdminWriteResponse(400, JSON.stringify({ error: "name is required" }));
    expect(result.ok).toBe(false);
    if (result.kind !== "success") expect(result.message).toBe("name is required");
  });

  it("F: falls back to a default message when the error body is missing", () => {
    const result = parseAdminWriteResponse(401, null);
    expect(result.ok).toBe(false);
    if (result.kind !== "success") expect(result.message).toBe(defaultAdminStatusMessage(401));
  });

  it("G: reads `message` when the server uses that key instead of `error`", () => {
    const result = parseAdminWriteResponse(403, JSON.stringify({ message: "admin only" }));
    expect(result.ok).toBe(false);
    if (result.kind !== "success") expect(result.message).toBe("admin only");
  });

  it("H: never reports success for a 2xx HTML body (proxy error page)", () => {
    const result = parseAdminWriteResponse(200, "<!doctype html><html><body>502</body></html>");
    expect(result.ok).toBe(false);
    if (result.kind !== "success") {
      expect(result.kind).toBe("malformed");
      expect(result.message).toContain("unrecognized response");
    }
  });

  it("I: never reports success for a non-JSON error body", () => {
    const result = parseAdminWriteResponse(502, "<html>Bad Gateway</html>");
    expect(result.ok).toBe(false);
    if (result.kind !== "success") expect(result.kind).toBe("malformed");
  });

  it("J: never reports success for a JSON scalar error body", () => {
    const result = parseAdminWriteResponse(500, JSON.stringify("boom"));
    expect(result.ok).toBe(false);
    if (result.kind !== "success") expect(result.kind).toBe("malformed");
  });
});

describe("defaultAdminStatusMessage", () => {
  it("K: warns the admin that nothing was saved for an unknown status", () => {
    expect(defaultAdminStatusMessage(undefined)).toContain("Nothing was saved");
    expect(defaultAdminStatusMessage(418)).toContain("Nothing was saved");
  });

  it("L: gives an actionable message for the file-size limit", () => {
    expect(defaultAdminStatusMessage(413)).toContain("5MB");
  });
});

describe("adminJsonInit", () => {
  it("M: serialises the body and sets a JSON content type", () => {
    const init = adminJsonInit("POST", { name: "Shirt" });
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Shirt" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});
