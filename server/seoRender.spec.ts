import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectSeoHead, renderSeoHead, SEO_END_MARKER, SEO_START_MARKER, type RenderSeoInput } from "./seoRender";
import type { SeoProductLike } from "@/lib/seo";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const product: SeoProductLike = {
  id: "68fa981d-b1b3-49bc-863-1a7e66403712",
  name: "Linen Blend Co-ord Set",
  nameAr: "طقم كتان مخلوط",
  description: "A breathable linen blend two piece set.",
  descriptionAr: "طقم من قطعتين من الكتان المخلوط.",
  image: "https://cdn.example.com/set.jpg",
  images: ["https://cdn.example.com/set.jpg", "https://cdn.example.com/set-2.jpg"],
  numericPrice: 1299,
  originalPrice: 1600,
  salePrice: 1299,
};

const render = (input: Partial<RenderSeoInput> & { path: string }) =>
  renderSeoHead({ language: "en", ...input });

function attribute(head: string, pattern: RegExp): string | undefined {
  return head.match(pattern)?.[1];
}

describe("renderSeoHead", () => {
  it("keeps the homepage tags on the homepage", () => {
    const head = render({ path: "/" });
    expect(head).toContain("<title>No Name — Modest Women's Fashion from Egypt</title>");
    expect(head).toContain('<link rel="canonical" href="https://www.nonameeg.com/" />');
  });

  it("gives a product page its own title, canonical, OG type and image", () => {
    const head = render({ path: `/product/${product.id}`, product });
    expect(head).toContain("<title>Linen Blend Co-ord Set | No Name</title>");
    expect(head).toContain(`<link rel="canonical" href="https://www.nonameeg.com/product/${product.id}" />`);
    expect(head).toContain('<meta property="og:type" content="product" />');
    expect(head).toContain('<meta property="og:image" content="https://cdn.example.com/set.jpg" />');
    expect(head).toContain('<meta property="og:url" content="https://www.nonameeg.com/product/' + product.id + '" />');
  });

  it("emits Product JSON-LD with the discounted offer price", () => {
    const head = render({ path: `/product/${product.id}`, product });
    const json = JSON.parse(head.match(/<script type="application\/ld\+json" data-seo="jsonld">\n([\s\S]*?)\n<\/script>/)![1]);
    expect(json["@type"]).toBe("Product");
    expect(json.sku).toBe(product.id);
    expect(json.offers.price).toBe("1299.00");
    expect(json.offers.priceCurrency).toBe("EGP");
    expect(json.name).toBe("Linen Blend Co-ord Set");
  });

  it("always ships the site-level Organization/WebSite/OnlineStore graph", () => {
    const head = render({ path: `/product/${product.id}`, product });
    const site = JSON.parse(head.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/)![1]);
    expect(site["@graph"].map((node: any) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "OnlineStore",
    ]);
  });

  it("switches to Arabic for ?lang=ar consumers", () => {
    const head = render({ path: `/product/${product.id}`, product, language: "ar" });
    expect(head).toContain("<title>طقم كتان مخلوط | No Name</title>");
    expect(head).toContain('<meta property="og:locale" content="ar_EG" />');
    expect(head).toContain('hreflang="en"');
    expect(head).toContain('hreflang="ar"');
  });

  it("uses route metadata for the static pages", () => {
    const head = render({ path: "/shop" });
    expect(head).toContain("<title>Shop All — Modest Women's Fashion | No Name</title>");
    expect(head).toContain('<link rel="canonical" href="https://www.nonameeg.com/shop" />');
  });

  it("noindexes private routes and unknown URLs", () => {
    expect(render({ path: "/cart" })).toContain('<meta name="robots" content="noindex, follow" />');
    expect(render({ path: "/admin/orders" })).toContain('<meta name="robots" content="noindex, follow" />');
    expect(render({ path: "/definitely-not-a-page" })).toContain(
      '<meta name="robots" content="noindex, follow" />'
    );
  });

  it("noindexes a product id that resolved to nothing", () => {
    const head = renderSeoHead({ path: `/product/${product.id}`, language: "en", product: null, noIndex: true });
    expect(head).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("indexes a real product", () => {
    expect(render({ path: `/product/${product.id}`, product })).toContain(
      '<meta name="robots" content="index, follow" />'
    );
  });

  it("escapes HTML metacharacters in attributes", () => {
    const hostile: SeoProductLike = { ...product, name: 'Bad " onload="alert(1)' };
    const head = render({ path: `/product/${product.id}`, product: hostile });
    expect(head).toContain('&quot;');
    expect(head).not.toMatch(/onload="alert/);
  });

  it("never lets a payload break out of the JSON-LD script tag", () => {
    const hostile: SeoProductLike = { ...product, name: "</script><script>alert(1)</script>" };
    const head = render({ path: `/product/${product.id}`, product: hostile });
    const blocks = head.match(/<\/script>/g) || [];
    expect(blocks).toHaveLength(2);
    expect(head).not.toContain("</script><script>");
  });

  it("truncates a long description to 160 characters", () => {
    const long: SeoProductLike = { ...product, description: "word ".repeat(80), descriptionAr: undefined };
    const head = render({ path: `/product/${product.id}`, product: long });
    const description = attribute(head, /<meta name="description" content="([^"]*)" \/>/)!;
    expect(description.length).toBe(160);
  });
});

describe("injectSeoHead", () => {
  const shell = `${SEO_START_MARKER}\n<title>old</title>\n${SEO_END_MARKER}\n<body></body>`;

  it("replaces only the marked block", () => {
    const html = injectSeoHead(shell, "<title>new</title>");
    expect(html).toBe(`${SEO_START_MARKER}\n    <title>new</title>\n    ${SEO_END_MARKER}\n<body></body>`);
    expect(html).not.toContain("<title>old</title>");
  });

  it("leaves the shell untouched when markers are missing", () => {
    const bare = "<head><title>old</title></head>";
    expect(injectSeoHead(bare, "<title>new</title>")).toBe(bare);
  });
});

describe("index.html static fallback", () => {
  const shell = readFileSync(path.join(repoRoot, "index.html"), "utf-8");

  it("is wrapped in the injection markers", () => {
    expect(shell).toContain(SEO_START_MARKER);
    expect(shell).toContain(SEO_END_MARKER);
  });

  it("already contains every tag the server renders for the homepage", () => {
    // index.html is hand-written, so this is the guard against the two drifting apart.
    const block = shell.slice(shell.indexOf(SEO_START_MARKER), shell.indexOf(SEO_END_MARKER));
    const rendered = render({ path: "/" });

    const missing = rendered
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !block.includes(line));
    expect(missing).toEqual([]);

    // The JSON-LD block is pretty-printed in index.html and minified by the renderer,
    // so compare it as data rather than as text.
    const staticJson = block.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const renderedJson = rendered.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/)![1];
    expect(JSON.parse(renderedJson)).toEqual(JSON.parse(staticJson));
  });

  it("keeps the browser-only head tags outside the replaced block", () => {
    // The server replaces everything between the markers, so anything essential to
    // rendering the app has to live outside it.
    const block = shell.slice(shell.indexOf(SEO_START_MARKER), shell.indexOf(SEO_END_MARKER));
    for (const tag of ['<link rel="icon"', 'name="theme-color"', 'rel="preconnect"', 'id="root"', 'type="module"']) {
      expect(block).not.toContain(tag);
      expect(shell).toContain(tag);
    }
  });
});
