export const SITE_URL = "https://www.nonameeg.com";

export type SeoLanguage = "ar" | "en";

export type SeoProductLike = {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  image: string;
  images?: string[];
  numericPrice: number;
  salePrice?: number;
  originalPrice?: number;
};

export type RouteMeta = {
  title: string;
  description: string;
  robots: string;
};

export const DEFAULT_DESCRIPTION =
  "No Name — modest women's fashion from Egypt. Sets, tops, skirts, denim and dresses designed for everyday comfort.";

export const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "No Name — Modest Women's Fashion from Egypt",
    description: DEFAULT_DESCRIPTION,
    robots: "index, follow",
  },
  "/shop": {
    title: "Shop All — Modest Women's Fashion | No Name",
    description: "Browse the full No Name collection: sets, blouses and shirts, skirts and pants, denims, jackets and dresses.",
    robots: "index, follow",
  },
  "/about": {
    title: "About No Name — Independent Egyptian Label",
    description: "no name is an independent Egyptian label designing modest women's fashion with comfortable fabrics and considered cuts.",
    robots: "index, follow",
  },
  "/shipping": {
    title: "Shipping & Returns | No Name",
    description: "Shipping and exchange information for No Name orders across Egypt, including cash on delivery and wallet transfer.",
    robots: "index, follow",
  },
  "/contact": {
    title: "Contact No Name",
    description: "Get in touch with the No Name team for sizing, styling and order questions.",
    robots: "index, follow",
  },
};

const PRIVATE_ROUTE_PREFIXES = ["/cart", "/checkout", "/order-summary", "/admin"];

export function cleanPath(pathname: string): string {
  const raw = (pathname || "/").split("?")[0].split("#")[0];
  const collapsed = raw.replace(/\/{2,}/g, "/");
  if (!collapsed) return "/";
  if (collapsed.length > 1 && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed;
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function isNoIndexPath(path: string): string | null {
  const target = cleanPath(path);
  if (target === "/") return null;
  if (PRIVATE_ROUTE_PREFIXES.some((prefix) => target === prefix || target.startsWith(`${prefix}/`))) return target;
  // Any path without a declared route is a 404 and must never be indexed.
  const known = Object.keys(ROUTE_META).some((route) => target === route);
  const isProduct = /^\/product\/[^/]+$/.test(target);
  return known || isProduct ? null : target;
}

export function truncateText(value: string, max = 160): string {
  const collapsed = (value || "").replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function productUnitPrice(product: SeoProductLike): number {
  if (typeof product.salePrice === "number" && typeof product.originalPrice === "number" && product.salePrice < product.originalPrice) {
    return product.salePrice;
  }
  return product.numericPrice;
}

export function productName(product: SeoProductLike, language: SeoLanguage): string {
  return (language === "ar" ? product.nameAr || product.name : product.name) || "No Name";
}

export function productDescription(product: SeoProductLike, language: SeoLanguage): string {
  const raw = language === "ar" ? product.descriptionAr || product.description : product.description || product.descriptionAr;
  const text = truncateText(raw || "", 160);
  return text || `${productName(product, language)} — modest women's fashion by No Name.`;
}

export function productSeo(product: SeoProductLike, language: SeoLanguage): RouteMeta & { image: string; url: string } {
  const name = productName(product, language);
  const url = absoluteUrl(`/product/${product.id}`);
  return {
    title: `${name} | No Name`,
    description: productDescription(product, language),
    robots: "index, follow",
    image: absoluteUrl(product.image),
    url,
  };
}

export type LanguageAlternate = { hreflang: string; href: string };

export function buildLanguageAlternates(path: string, language: SeoLanguage): LanguageAlternate[] {
  const target = cleanPath(path);
  const withLang = (lang: SeoLanguage) => absoluteUrl(target === "/" ? `/?lang=${lang}` : `${target}?lang=${lang}`);
  return [
    { hreflang: "en", href: withLang("en") },
    { hreflang: "ar", href: withLang("ar") },
    { hreflang: "x-default", href: withLang("en") },
  ];
}

export function buildProductJsonLd(
  product: SeoProductLike,
  options: { language: SeoLanguage; currency?: string }
): Record<string, unknown> {
  const currency = options.currency || "EGP";
  const name = productName(product, options.language);
  const images = Array.from(new Set([product.image, ...(product.images || [])].filter(Boolean))).map(absoluteUrl);
  const price = productUnitPrice(product);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: productDescription(product, options.language),
    image: images,
    sku: product.id,
    brand: { "@type": "Brand", name: "No Name" },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.id}`),
      priceCurrency: currency,
      price: price.toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "No Name" },
    },
  };
}

export function buildBreadcrumbJsonLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildCollectionJsonLd(items: { id: string; name: string; nameAr?: string }[], options: { language: SeoLanguage }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/product/${item.id}`),
      name: productName(item as SeoProductLike, options.language),
    })),
  };
}

export function resolveLanguageFromQuery(search: string): SeoLanguage | null {
  try {
    const value = new URLSearchParams(search || "").get("lang");
    return value === "ar" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export const LANGUAGE_STORAGE_KEY = "no-name-language";

export function resolveInitialLanguage(
  search = typeof window === "undefined" ? "" : window.location.search,
  storageKey = LANGUAGE_STORAGE_KEY
): SeoLanguage {
  const fromQuery = resolveLanguageFromQuery(search);
  if (fromQuery) return fromQuery;
  try {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
    if (stored === "ar" || stored === "en") return stored;
  } catch {
    return "en";
  }
  return "en";
}

/* ---------- DOM writers (browser only) ---------- */

type SeoDoc = Document;

function upsertTag(doc: SeoDoc, selector: string, create: () => Element, apply: (el: Element) => void) {
  let element = doc.head.querySelector(selector);
  if (!element) {
    element = create();
    doc.head.appendChild(element);
  }
  apply(element);
}

export function setTitle(doc: SeoDoc, title: string) {
  doc.title = title;
}

export function setMeta(doc: SeoDoc, key: string, content: string, isProperty = false) {
  const attr = isProperty ? "property" : "name";
  upsertTag(doc, `meta[${attr}="${key}"]`, () => doc.createElement("meta"), (el) => {
    el.setAttribute(attr, key);
    el.setAttribute("content", content);
  });
}

export function setCanonical(doc: SeoDoc, url: string) {
  upsertTag(doc, 'link[rel="canonical"]', () => doc.createElement("link"), (el) => {
    el.setAttribute("rel", "canonical");
    el.setAttribute("href", url);
  });
}

export function setRobots(doc: SeoDoc, value: string) {
  setMeta(doc, "robots", value);
  setMeta(doc, "googlebot", value, true);
}

export function setJsonLd(doc: SeoDoc, data: object | object[]) {
  upsertTag(doc, 'script[data-seo="jsonld"]', () => doc.createElement("script"), (el) => {
    el.setAttribute("type", "application/ld+json");
    el.setAttribute("data-seo", "jsonld");
    el.textContent = JSON.stringify(data);
  });
}

export function setLanguageAlternates(doc: SeoDoc, alternates: LanguageAlternate[]) {
  doc.head.querySelectorAll('link[data-seo="hreflang"]').forEach((el) => el.remove());
  alternates.forEach((alternate) => {
    const link = doc.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", alternate.hreflang);
    link.setAttribute("href", alternate.href);
    link.setAttribute("data-seo", "hreflang");
    doc.head.appendChild(link);
  });
}

export function setOpenGraph(doc: SeoDoc, values: { title: string; description: string; url: string; image: string; locale: string; type?: string }) {
  setMeta(doc, "og:title", values.title, true);
  setMeta(doc, "og:description", truncateText(values.description, 200), true);
  setMeta(doc, "og:url", values.url, true);
  setMeta(doc, "og:image", values.image, true);
  setMeta(doc, "og:image:alt", values.title, true);
  setMeta(doc, "og:locale", values.locale, true);
  setMeta(doc, "og:type", values.type || "website", true);
  setMeta(doc, "og:site_name", "No Name", true);
}

export function setTwitter(doc: SeoDoc, values: { title: string; description: string; image: string }) {
  setMeta(doc, "twitter:card", "summary_large_image");
  setMeta(doc, "twitter:title", values.title);
  setMeta(doc, "twitter:description", truncateText(values.description, 200));
  setMeta(doc, "twitter:image", values.image);
}

export const OG_DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1200&h=630&q=90";

export function ogLocale(language: SeoLanguage): string {
  return language === "ar" ? "ar_EG" : "en_US";
}

export type ApplySeoInput = {
  path: string;
  title: string;
  description: string;
  robots: string;
  language: SeoLanguage;
  image?: string;
  type?: string;
  jsonLd?: object | object[];
};

export function applySeo(doc: SeoDoc, input: ApplySeoInput) {
  const canonical = absoluteUrl(cleanPath(input.path));
  const image = input.image || OG_DEFAULT_IMAGE;
  setTitle(doc, input.title);
  setMeta(doc, "description", truncateText(input.description, 160));
  setCanonical(doc, canonical);
  setRobots(doc, input.robots);
  setLanguageAlternates(doc, buildLanguageAlternates(input.path, input.language));
  setOpenGraph(doc, {
    title: input.title,
    description: input.description,
    url: canonical,
    image,
    locale: ogLocale(input.language),
    type: input.type,
  });
  setTwitter(doc, { title: input.title, description: input.description, image });
  if (input.jsonLd) setJsonLd(doc, input.jsonLd);
}
