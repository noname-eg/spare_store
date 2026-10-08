import {
  absoluteUrl,
  buildLanguageAlternates,
  buildProductJsonLd,
  cleanPath,
  ogLocale,
  OG_DEFAULT_IMAGE,
  productSeo,
  ROUTE_META,
  truncateText,
  isNoIndexPath,
  type SeoLanguage,
  type SeoProductLike,
} from "@/lib/seo";

/**
 * Server-side head rendering.
 *
 * The SPA shell ships one static <head>, so crawlers and social scrapers used to see
 * the homepage tags on every URL until React hydrated. These helpers render the exact
 * same metadata the client would apply, but into an HTML string the server can inject
 * into the shell. Keeping the rules in @/lib/seo means the two paths cannot drift.
 */

export const SEO_START_MARKER = "<!--seo:start-->";
export const SEO_END_MARKER = "<!--seo:end-->";

const SITE_DESCRIPTION = "Modest women's fashion from Egypt, designed for everyday comfort.";

export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${absoluteUrl("/")}#organization`,
      name: "No Name",
      url: absoluteUrl("/"),
      description: SITE_DESCRIPTION,
      logo: absoluteUrl("/no_name_icon.ico"),
      currenciesAccepted: "EGP",
      paymentAccepted: "Cash on delivery, wallet transfer, InstaPay",
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer service",
          areaServed: "EG",
          availableLanguage: ["en", "ar"],
        },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${absoluteUrl("/")}#website`,
      url: absoluteUrl("/"),
      name: "No Name",
      publisher: { "@id": `${absoluteUrl("/")}#organization` },
      inLanguage: ["en", "ar"],
    },
    {
      "@type": "OnlineStore",
      "@id": `${absoluteUrl("/")}#store`,
      name: "No Name",
      url: absoluteUrl("/"),
      description: SITE_DESCRIPTION,
      currenciesAccepted: "EGP",
      paymentAccepted: "Cash on delivery, wallet transfer, InstaPay",
    },
  ],
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function meta(attribute: "name" | "property", key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeAttribute(content)}" />`;
}

function jsonLdScript(data: object | object[], attributes = ""): string {
  // A bare "</script>" inside the payload would close the tag early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json"${attributes}>\n${json}\n</script>`;
}

export type RenderSeoInput = {
  path: string;
  language: SeoLanguage;
  product?: SeoProductLike | null;
  /** Forces noindex, used when a product id resolves to nothing. */
  noIndex?: boolean;
};

/** Mirrors applySeo() in @/lib/seo, but emits markup instead of mutating the DOM. */
export function renderSeoHead(input: RenderSeoInput): string {
  const path = cleanPath(input.path);
  const language = input.language;
  const product = input.product;

  const meta_ = product ? productSeo(product, language) : ROUTE_META[path];
  const noIndex = Boolean(input.noIndex) || Boolean(isNoIndexPath(path));

  const title = meta_?.title || ROUTE_META["/"].title;
  const rawDescription = meta_?.description || ROUTE_META["/"].description;
  // The client truncates the description tag to 160 but leaves OG/Twitter at 200.
  const description = truncateText(rawDescription, 160);
  const socialDescription = truncateText(rawDescription, 200);
  const robots = noIndex ? "noindex, follow" : meta_?.robots || ROUTE_META["/"].robots;
  const canonical = absoluteUrl(path);
  const image = (product ? absoluteUrl(product.image || "") : "") || OG_DEFAULT_IMAGE;
  const ogType = product ? "product" : "website";

  const lines = [
    meta("name", "description", description),
    meta("name", "robots", robots),
    meta("property", "googlebot", robots),
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    ...buildLanguageAlternates(path, language).map(
      (alternate) =>
        `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeAttribute(alternate.href)}" data-seo="hreflang" />`
    ),
    meta("property", "og:type", ogType),
    meta("property", "og:site_name", "No Name"),
    meta("property", "og:title", title),
    meta("property", "og:description", socialDescription),
    meta("property", "og:url", canonical),
    meta("property", "og:locale", ogLocale(language)),
    meta("property", "og:image", image),
    meta("property", "og:image:alt", title),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", socialDescription),
    meta("name", "twitter:image", image),
    `<title>${escapeAttribute(title)}</title>`,
    jsonLdScript(SITE_JSON_LD),
  ];

  if (product) {
    lines.push(jsonLdScript(buildProductJsonLd(product, { language }), ' data-seo="jsonld"'));
  }

  return lines.join("\n    ");
}

/**
 * Replaces the marked block in the shell. If the markers are absent the shell is
 * returned untouched, so a bad build degrades to the previous behaviour instead of
 * serving a page with no head at all.
 */
export function injectSeoHead(html: string, head: string): string {
  const start = html.indexOf(SEO_START_MARKER);
  const end = html.indexOf(SEO_END_MARKER);
  if (start === -1 || end === -1 || end < start) return html;
  return `${html.slice(0, start + SEO_START_MARKER.length)}\n    ${head}\n    ${html.slice(end)}`;
}
