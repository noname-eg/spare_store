import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SITE_URL = "https://www.nonameeg.com";
const OUTPUT = resolve(process.cwd(), "public", "sitemap.xml");

const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/shop", changefreq: "daily", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.5" },
  { path: "/shipping", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
];

type SitemapProduct = { id: string; updated_at?: string | null };
type SitemapCategory = { slug?: string | null; name?: string | null };

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function entry(location: string, options: { changefreq?: string; priority?: string; lastmod?: string | null }): string {
  const parts = [`    <loc>${xmlEscape(location)}</loc>`];
  if (options.lastmod) parts.push(`    <lastmod>${xmlEscape(options.lastmod.slice(0, 10))}</lastmod>`);
  if (options.changefreq) parts.push(`    <changefreq>${options.changefreq}</changefreq>`);
  if (options.priority) parts.push(`    <priority>${options.priority}</priority>`);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

export function renderSitemap(products: SitemapProduct[], _categories: SitemapCategory[]): string {
  const urls = [
    ...STATIC_ROUTES.map((route) => entry(`${SITE_URL}${route.path}`, route)),
    // Category filter permutations are deliberately excluded: /shop?category=* canonicals to /shop.
    ...products.map((product) =>
      entry(`${SITE_URL}/product/${encodeURIComponent(product.id)}`, {
        changefreq: "weekly",
        priority: "0.7",
        lastmod: product.updated_at || null,
      })
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

async function main() {
  const { supabase } = await import("../server/db");

  const [productsResult, categoriesResult] = await Promise.all([
    supabase.from("products").select("id, updated_at").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("categories").select("slug, name, name_ar").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  if (productsResult.error) throw productsResult.error;

  const products = (productsResult.data || []) as SitemapProduct[];
  const categories = (categoriesResult.data || []).map((row) => ({
    slug: (row as { slug?: string | null }).slug,
    name: (row as { name?: string | null }).name,
  })) as SitemapCategory[];

  const xml = renderSitemap(products, categories);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, xml, "utf8");
  console.log(`[sitemap] wrote ${products.length} products + ${STATIC_ROUTES.length} static routes to public/sitemap.xml`);
}

main().catch((error) => {
  // Fail open: a sitemap build failure must never break the production build.
  console.warn(`[sitemap] skipped (${error instanceof Error ? error.message : String(error)}). Keeping the previous public/sitemap.xml.`);
  process.exit(0);
});
