import fs from "node:fs/promises";
import type { RequestHandler } from "express";
import { resolveLanguageFromQuery, type SeoProductLike } from "@/lib/seo";
import { getProductBySlug } from "./db";
import { injectSeoHead, renderSeoHead } from "./seoRender";

/**
 * Serves the SPA shell with per-route <head> metadata already inlined, so crawlers and
 * social scrapers see the real title/canonical/OG for the URL they requested instead of
 * the homepage defaults. Runs after express.static, so only document requests pay for it.
 */

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;
const MISS_CACHE_TTL_MS = 60 * 1000;
const MAX_CACHED_PRODUCTS = 500;

type CacheEntry = { value: SeoProductLike | null; expiresAt: number };

const productCache = new Map<string, CacheEntry>();

/** Test seam: lets a spec assert cache behaviour without touching Supabase. */
export function __resetProductCache() {
  productCache.clear();
}

function mapProductRow(row: any): SeoProductLike {
  const originalPrice = Number(row.original_price || 0);
  const salePrice = row.sale_price ? Number(row.sale_price) : undefined;
  return {
    id: row.id,
    name: row.name || row.name_ar || "",
    nameAr: row.name_ar || undefined,
    description: row.description || undefined,
    descriptionAr: row.description_ar || undefined,
    image: row.image || (Array.isArray(row.images) && row.images[0]) || "",
    images: Array.isArray(row.images) ? row.images : undefined,
    numericPrice: salePrice || originalPrice,
    originalPrice,
    salePrice,
  };
}

async function loadSeoProduct(id: string): Promise<SeoProductLike | null> {
  const cached = productCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: SeoProductLike | null = null;
  try {
    const row = await getProductBySlug(id);
    if (row) value = mapProductRow(row);
  } catch (error) {
    console.error("SEO product lookup failed:", error);
  }

  if (productCache.size >= MAX_CACHED_PRODUCTS) productCache.clear();
  productCache.set(id, {
    value,
    expiresAt: Date.now() + (value ? PRODUCT_CACHE_TTL_MS : MISS_CACHE_TTL_MS),
  });
  return value;
}

export function createSeoHeadMiddleware(indexHtmlPath: string): RequestHandler {
  // The shell only changes on deploy, so it is read once per process.
  let shellPromise: Promise<string> | null = null;
  const loadShell = () => {
    shellPromise ??= fs.readFile(indexHtmlPath, "utf-8").catch((error) => {
      shellPromise = null;
      throw error;
    });
    return shellPromise;
  };

  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    try {
      const shell = await loadShell();
      // resolveLanguageFromQuery expects a full query string, not a bare value.
      const search = String(req.originalUrl || "").split("?")[1] || "";
      const language = resolveLanguageFromQuery(search) || (req.query.lang === "ar" ? "ar" : "en");
      const productMatch = /^\/product\/[^/]+$/.exec(req.path);

      const product = productMatch ? await loadSeoProduct(productMatch[0].split("/").pop()!) : null;
      const head = renderSeoHead({
        path: req.path,
        language,
        product,
        noIndex: Boolean(productMatch) && !product,
      });
      const html = injectSeoHead(shell, head);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.method === "HEAD") return res.end();
      return res.send(html);
    } catch (error) {
      console.error("SEO head injection failed, serving the raw shell:", error);
      return next();
    }
  };
}
