import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProductBySlug } from "./db";
import { createSeoHeadMiddleware, __resetProductCache } from "./seoPrerender";

vi.mock("./db", () => ({ getProductBySlug: vi.fn() }));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtmlPath = path.join(repoRoot, "index.html");

const mockGetProduct = vi.mocked(getProductBySlug);

const productRow = {
  id: "68fa981d-b1b3-49bc-863-1a7e66403712",
  slug: "linen-coord-set",
  name: "Linen Blend Co-ord Set",
  name_ar: "طقم كتان مخلوط",
  description: "A breathable linen blend two piece set.",
  description_ar: "طقم من قطعتين من الكتان المخلوط.",
  image: "https://cdn.example.com/set.jpg",
  images: ["https://cdn.example.com/set.jpg"],
  original_price: 1600,
  sale_price: 1299,
};

type FakeResponse = {
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  send(body: string): void;
  end(): void;
};

function makeResponse(): FakeResponse {
  return {
    headers: {},
    body: "",
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    send(body) {
      this.body = body;
    },
    end() {
      this.ended = true;
    },
  };
}

async function run(url: string, method = "GET") {
  const [pathname, search = ""] = url.split("?");
  const query = Object.fromEntries(new URLSearchParams(search));
  const res = makeResponse();
  const next = vi.fn();
  await createSeoHeadMiddleware(indexHtmlPath)(
    { method, path: pathname, query, headers: {}, originalUrl: url } as any,
    res as any,
    next
  );
  return { res, next };
}

beforeEach(() => {
  __resetProductCache();
  mockGetProduct.mockReset();
  mockGetProduct.mockResolvedValue(productRow as any);
});

describe("createSeoHeadMiddleware", () => {
  it("inlines the homepage head without touching the rest of the shell", async () => {
    const { res, next } = await run("/");
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toContain("<title>No Name — Modest Women's Fashion from Egypt</title>");
    expect(res.body).toContain('<link rel="canonical" href="https://www.nonameeg.com/" />');
    // App-critical markup survives the rewrite.
    expect(res.body).toContain('<div id="root"></div>');
    expect(res.body).toContain('type="module"');
    expect(res.body).toContain("no-name-language");
  });

  it("serves a product URL with product metadata, not the homepage's", async () => {
    const { res } = await run(`/product/${productRow.id}`);
    expect(res.body).toContain("<title>Linen Blend Co-ord Set | No Name</title>");
    expect(res.body).toContain(`<link rel="canonical" href="https://www.nonameeg.com/product/${productRow.id}" />`);
    expect(res.body).toContain('<meta property="og:type" content="product" />');
    expect(res.body).toContain('"@type":"Product"');
    // The homepage title is gone, not duplicated.
    expect(res.body).not.toContain("<title>No Name — Modest Women's Fashion from Egypt</title>");
  });

  it("answers Arabic requests with Arabic metadata", async () => {
    const { res } = await run(`/product/${productRow.id}?lang=ar`);
    expect(res.body).toContain("<title>طقم كتان مخلوط | No Name</title>");
    expect(res.body).toContain('<meta property="og:locale" content="ar_EG" />');
  });

  it("noindexes a product id that does not exist", async () => {
    mockGetProduct.mockResolvedValue(null);
    const { res } = await run("/product/does-not-exist");
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />');
    expect(res.body).not.toContain('"@type":"Product"');
  });

  it("noindexes private routes without hitting the database", async () => {
    const { res } = await run("/admin/orders");
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />');
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  it("sets HTML content type and revalidation headers", async () => {
    const { res } = await run("/shop");
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
  });

  it("reuses a cached product instead of querying per request", async () => {
    const middleware = createSeoHeadMiddleware(indexHtmlPath);
    const res = makeResponse();
    for (let i = 0; i < 3; i++) {
      await middleware(
        { method: "GET", path: `/product/${productRow.id}`, query: {}, headers: {}, originalUrl: "/" } as any,
        res as any,
        vi.fn()
      );
    }
    expect(mockGetProduct).toHaveBeenCalledTimes(1);
  });

  it("passes HEAD requests through with headers but no body", async () => {
    const { res } = await run(`/product/${productRow.id}`, "HEAD");
    expect(res.ended).toBe(true);
    expect(res.body).toBe("");
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
  });

  it("skips non-GET requests so the SPA fallback can handle them", async () => {
    const { res, next } = await run("/shop", "POST");
    expect(next).toHaveBeenCalled();
    expect(res.body).toBe("");
  });

  it("falls back to next() when the shell cannot be read", async () => {
    const res = makeResponse();
    const next = vi.fn();
    await createSeoHeadMiddleware(path.join(repoRoot, "does-not-exist.html"))(
      { method: "GET", path: "/", query: {}, headers: {}, originalUrl: "/" } as any,
      res as any,
      next
    );
    expect(next).toHaveBeenCalled();
    expect(res.body).toBe("");
  });
});
