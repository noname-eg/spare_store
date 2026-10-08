import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildCollectionJsonLd,
  buildLanguageAlternates,
  buildProductJsonLd,
  cleanPath,
  DEFAULT_DESCRIPTION,
  isNoIndexPath,
  LANGUAGE_STORAGE_KEY,
  ogLocale,
  productDescription,
  productSeo,
  productUnitPrice,
  resolveInitialLanguage,
  resolveLanguageFromQuery,
  ROUTE_META,
  SITE_URL,
  truncateText,
  type SeoProductLike,
} from "./seo";

const product: SeoProductLike = {
  id: "dress-01",
  name: "Siena Dress",
  nameAr: "فستان Siena",
  description: "A  long silk dress with a soft drape and a relaxed fit for everyday wear.",
  descriptionAr: "فستان حرير طويل بملمس ناعم.",
  image: "/images/dress-01.jpg",
  images: ["/images/dress-01.jpg", "/images/dress-01b.jpg"],
  numericPrice: 2400,
  originalPrice: 3000,
  salePrice: 2400,
};

describe("SITE_URL", () => {
  it("A: is pinned to the production domain with no trailing slash", () => {
    expect(SITE_URL).toBe("https://www.nonameeg.com");
  });
});

describe("cleanPath", () => {
  it("B: keeps the root as a single slash", () => {
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("")).toBe("/");
  });

  it("C: strips a trailing slash so canonicals stay canonical", () => {
    expect(cleanPath("/shop/")).toBe("/shop");
    expect(cleanPath("/product/dress-01/")).toBe("/product/dress-01");
  });

  it("D: drops query and hash fragments", () => {
    expect(cleanPath("/shop?category=sets")).toBe("/shop");
    expect(cleanPath("/product/dress-01#gallery")).toBe("/product/dress-01");
  });

  it("E: collapses duplicate slashes", () => {
    expect(cleanPath("//shop//dress")).toBe("/shop/dress");
  });
});

describe("absoluteUrl", () => {
  it("F: prefixes site-relative paths with SITE_URL", () => {
    expect(absoluteUrl("/shop")).toBe(`${SITE_URL}/shop`);
    expect(absoluteUrl("shop")).toBe(`${SITE_URL}/shop`);
  });

  it("G: leaves already-absolute URLs untouched", () => {
    expect(absoluteUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("isNoIndexPath", () => {
  it("H: allows indexing on public, declared routes", () => {
    expect(isNoIndexPath("/")).toBeNull();
    expect(isNoIndexPath("/shop")).toBeNull();
    expect(isNoIndexPath("/about/")).toBeNull();
    expect(isNoIndexPath("/product/dress-01")).toBeNull();
  });

  it("I: blocks indexing on private routes and their children", () => {
    expect(isNoIndexPath("/cart")).toBe("/cart");
    expect(isNoIndexPath("/checkout")).toBe("/checkout");
    expect(isNoIndexPath("/order-summary/NN-1")).toBe("/order-summary/NN-1");
    expect(isNoIndexPath("/admin")).toBe("/admin");
    expect(isNoIndexPath("/admin/login")).toBe("/admin/login");
  });

  it("J: blocks indexing on unknown paths so 404s stay out of the index", () => {
    expect(isNoIndexPath("/does-not-exist")).toBe("/does-not-exist");
    expect(isNoIndexPath("/shop/nope")).toBe("/shop/nope");
  });

  it("K: does not treat a product id prefix collision as a product", () => {
    expect(isNoIndexPath("/products/dress-01")).toBe("/products/dress-01");
  });
});

describe("truncateText", () => {
  it("L: collapses whitespace and truncates with an ellipsis", () => {
    expect(truncateText("a   b\n c", 40)).toBe("a b c");
    expect(truncateText("x".repeat(300), 10)).toHaveLength(10);
  });
});

describe("productUnitPrice", () => {
  it("M: uses the sale price only when it is a real discount", () => {
    expect(productUnitPrice(product)).toBe(2400);
  });

  it("N: ignores a sale price that is not below the original price", () => {
    // numericPrice is the effective price (db.ts: finalPrice = sale || original), so it wins.
    expect(productUnitPrice({ ...product, salePrice: 3000, originalPrice: 3000 })).toBe(2400);
    expect(productUnitPrice({ ...product, salePrice: 4000, originalPrice: 3000 })).toBe(2400);
  });
});

describe("productDescription", () => {
  it("O: picks the language variant and stays within the snippet budget", () => {
    const ar = productDescription(product, "ar");
    const en = productDescription(product, "en");
    expect(ar).toContain("فستان");
    expect(en.length).toBeLessThanOrEqual(160);
  });

  it("P: falls back to a store line when the product has no description", () => {
    expect(productDescription({ id: "x", name: "X", image: "/x.jpg", numericPrice: 1 }, "en")).toContain("No Name");
  });
});

describe("productSeo", () => {
  it("Q: builds a branded title, absolute image and product URL", () => {
    const seo = productSeo(product, "en");
    expect(seo.title).toBe("Siena Dress | No Name");
    expect(seo.image).toBe(`${SITE_URL}/images/dress-01.jpg`);
    expect(seo.url).toBe(`${SITE_URL}/product/dress-01`);
    expect(seo.robots).toBe("index, follow");
  });
});

describe("buildLanguageAlternates", () => {
  it("R: emits en, ar and x-default pointing at the same path", () => {
    const alternates = buildLanguageAlternates("/shop", "en");
    expect(alternates.map((a) => a.hreflang)).toEqual(["en", "ar", "x-default"]);
    expect(alternates[0].href).toBe(`${SITE_URL}/shop?lang=en`);
    expect(alternates[1].href).toBe(`${SITE_URL}/shop?lang=ar`);
  });

  it("S: keeps the root query bare", () => {
    expect(buildLanguageAlternates("/", "ar")[1].href).toBe(`${SITE_URL}/?lang=ar`);
  });
});

describe("buildProductJsonLd", () => {
  it("T: emits a Product with an Offer, price and no fabricated ratings", () => {
    const schema = buildProductJsonLd(product, { language: "en" }) as Record<string, never>;
    expect(schema["@type"]).toBe("Product");
    expect((schema.offers as Record<string, unknown>).price).toBe("2400.00");
    expect((schema.offers as Record<string, unknown>).priceCurrency).toBe("EGP");
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.review).toBeUndefined();
    expect((schema.image as string[]).length).toBe(2);
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("U: numbers trail items from 1 and links them absolutely", () => {
    const schema = buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shop", path: "/shop" },
      { name: "Siena Dress", path: "/product/dress-01" },
    ]) as Record<string, { itemListElement: { position: number; item: string }[] }>;
    expect(schema.itemListElement[0].position).toBe(1);
    expect(schema.itemListElement[2].item).toBe(`${SITE_URL}/product/dress-01`);
  });
});

describe("buildCollectionJsonLd", () => {
  it("V: counts items and links each product page", () => {
    const schema = buildCollectionJsonLd([{ id: "dress-01", name: "Siena" }], { language: "en" }) as Record<string, never>;
    expect(schema.numberOfItems).toBe(1);
    expect((schema.itemListElement as { url: string }[])[0].url).toBe(`${SITE_URL}/product/dress-01`);
  });
});

describe("resolveLanguageFromQuery", () => {
  it("W: accepts ar and en and rejects anything else", () => {
    expect(resolveLanguageFromQuery("?lang=ar")).toBe("ar");
    expect(resolveLanguageFromQuery("?lang=en")).toBe("en");
    expect(resolveLanguageFromQuery("?lang=fr")).toBeNull();
    expect(resolveLanguageFromQuery("")).toBeNull();
  });
});

describe("resolveInitialLanguage", () => {
  it("X: prefers the query over storage, and falls back to en", () => {
    expect(resolveInitialLanguage("?lang=ar", "never-set")).toBe("ar");
    expect(resolveInitialLanguage("", "never-set")).toBe("en");
  });

  it("Y: uses the storage key the app already writes, so returning visitors keep their pick", () => {
    expect(LANGUAGE_STORAGE_KEY).toBe("no-name-language");
  });
});

describe("ROUTE_META", () => {
  it("Y: gives every public route a title, description and indexable robots", () => {
    for (const [path, meta] of Object.entries(ROUTE_META)) {
      expect(meta.title, path).toBeTruthy();
      expect(meta.description, path).toBeTruthy();
      expect(meta.title.length, path).toBeLessThanOrEqual(70);
      expect(meta.robots, path).toBe("index, follow");
    }
  });

  it("Z: keeps the home description identical to the static head default", () => {
    expect(ROUTE_META["/"].description).toBe(DEFAULT_DESCRIPTION);
  });
});

describe("ogLocale", () => {
  it("AA: maps the UI language to the Open Graph locale", () => {
    expect(ogLocale("ar")).toBe("ar_EG");
    expect(ogLocale("en")).toBe("en_US");
  });
});
