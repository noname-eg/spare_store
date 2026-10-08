import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getCategoryName, useStore, type Language } from "@/components/store/StoreLayout";
import { applySeo, cleanPath, isNoIndexPath, ROUTE_META, type RouteMeta } from "@/lib/seo";

function resolveTitle(path: string, search: string, language: Language, pageSettings: ReturnType<typeof useStore>["pageSettings"]): RouteMeta {
  const base = ROUTE_META[path] || ROUTE_META["/"];
  if (path === "/shop") {
    const category = new URLSearchParams(search).get("category");
    if (category) {
      const name = getCategoryName(category, language);
      return { ...base, title: `${name} — Shop | No Name`, description: `Shop ${name.toLowerCase()} from No Name: modest women's fashion designed for everyday comfort.` };
    }
  }
  if (path === "/about") {
    const title = language === "ar" ? pageSettings.about.titleAr : pageSettings.about.titleEn;
    const intro = language === "ar" ? pageSettings.about.introAr : pageSettings.about.introEn;
    if (title) return { ...base, title: `${title} | No Name`, description: intro || base.description };
  }
  if (path === "/shipping") {
    const title = language === "ar" ? pageSettings.shipping.titleAr : pageSettings.shipping.titleEn;
    if (title) return { ...base, title: `${title} | No Name` };
  }
  if (path === "/contact") {
    const title = language === "ar" ? pageSettings.contact.titleAr : pageSettings.contact.titleEn;
    if (title) return { ...base, title: `${title} | No Name` };
  }
  return base;
}

export function RouteSeo() {
  const location = useLocation();
  const { language, pageSettings } = useStore();
  const path = cleanPath(location.pathname);

  useEffect(() => {
    // Product pages own their own metadata and JSON-LD; stay out of the way.
    if (/^\/product\/[^/]+$/.test(path)) return;

    const noIndex = isNoIndexPath(path);
    const meta = resolveTitle(path, location.search, language, pageSettings);

    applySeo(document, {
      path,
      title: meta.title,
      description: meta.description,
      robots: noIndex ? "noindex, follow" : meta.robots,
      language,
      type: "website",
    });
  }, [path, location.search, language, pageSettings]);

  return null;
}
