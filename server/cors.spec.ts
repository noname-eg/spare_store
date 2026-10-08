import { describe, it, expect } from "vitest";
import { buildCorsOptions } from "./cors";

describe("CORS configuration (N: matches APP_ORIGIN)", () => {
    it("allows only the configured origin(s) with credentials — never wildcard", () => {
        const options = buildCorsOptions("https://shop.example.com", "production")!;
        expect(options.credentials).toBe(true);
        expect(Array.isArray(options.origin)).toBe(true);
        expect((options.origin as string[])).toEqual(["https://shop.example.com"]);
        expect((options.origin as string[])).not.toContain("*");
    });

    it("supports comma-separated origins and trims trailing slashes", () => {
        const options = buildCorsOptions("https://a.com/, https://b.com")!;
        expect(options.origin).toEqual(["https://a.com", "https://b.com"]);
    });

    it("in production, missing APP_ORIGIN refuses cross-origin (same-origin still works)", () => {
        const options = buildCorsOptions(undefined, "production")!;
        expect(options.origin).toBe(false);
        expect(options.credentials).toBe(true);
    });

    it("in development, missing APP_ORIGIN keeps the permissive dev default", () => {
        expect(buildCorsOptions(undefined, "development")).toBeUndefined();
    });
});