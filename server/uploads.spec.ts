import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "./index";
import { MAX_UPLOAD_BYTES } from "./routes/uploads";
import { supabase } from "./db";

vi.mock("./db", () => {
    const storage = { from: vi.fn() };
    return { supabase: { storage } };
});

const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

async function sendUpload(body: object) {
    const server = createServer().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    try {
        return await fetch(`http://127.0.0.1:${address.port}/api/uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

afterEach(() => {
    vi.clearAllMocks();
});

describe("uploads security (C/E/D/O)", () => {
    it("C: product upload without an admin session → 401 before any storage call", async () => {
        const response = await sendUpload({
            image_base64: TINY_PNG.toString("base64"),
            file_name: "x.png",
            kind: "product",
        });
        expect(response.status).toBe(401);
        expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it("E/D: receipt upload (public, pre-order) returns ONLY the private storage key — never a URL or Base64", async () => {
        (supabase.storage.from as any).mockReturnValue({
            upload: vi.fn().mockResolvedValue({ data: { path: "receipts/12345_ab12_receipt.png" }, error: null }),
            getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/public/receipts.png" } }),
        });
        const response = await sendUpload({
            image_base64: `data:image/png;base64,${TINY_PNG.toString("base64")}`,
            file_name: "receipt.png",
            kind: "receipt",
        });
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.key).toBe("receipts/12345_ab12_receipt.png");
        expect(body.key.startsWith("receipts/")).toBe(true);
        expect(body.url).toBeUndefined();
        expect(body.image_base64).toBeUndefined();
        expect(Object.keys(body).length).toBe(1);
    });

    it("D: skips the base64 content as content-type for the real upload (magic-byte driven)", async () => {
        const upload = vi.fn().mockResolvedValue({ data: { path: "public/x.png" }, error: null });
        (supabase.storage.from as any).mockReturnValue({
            upload,
            getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/x.png" } }),
        });
        await sendUpload({ image_base64: TINY_PNG.toString("base64"), file_name: "x.png", kind: "receipt" });
        expect(upload).toHaveBeenCalled();
        const [path, buffer, options] = upload.mock.calls[0];
        expect(path).toMatch(/^receipts\//);
        expect(buffer).toBeInstanceOf(Buffer);
        expect(options).toMatchObject({ contentType: "image/png", upsert: false });
    });

    it("O: rejects non-image payloads by magic bytes → 400 (no storage call)", async () => {
        const response = await sendUpload({
            image_base64: Buffer.from("#!/bin/bash rm -rf /").toString("base64"),
            file_name: "evil.sh",
            kind: "receipt",
        });
        expect(response.status).toBe(400);
        expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it("O: rejects oversized decoded files → 413 (limit stays 5MB)", async () => {
        const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x50);
        const response = await sendUpload({ image_base64: big.toString("base64"), file_name: "big.png", kind: "receipt" });
        expect(response.status).toBe(413);
        expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it("validates kind strictly → 400 for unknown kinds", async () => {
        const response = await sendUpload({
            image_base64: TINY_PNG.toString("base64"),
            file_name: "x.png",
            kind: "banana",
        });
        expect(response.status).toBe(400);
    });
});