import path from "node:path";
import { createServer } from "./index";
import { createSeoHeadMiddleware } from "./seoPrerender";
import * as express from "express";

const app = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");
const indexHtmlPath = path.join(distPath, "index.html");
const CANONICAL_HOST = "www.nonameeg.com";

// SEO redirects. Runs before the static handler and never touches the API,
// so request/response shapes stay byte-for-byte identical.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) return next();

  // apex -> www, the canonical host
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (host === "nonameeg.com") {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }

  // /shop/ -> /shop, so canonicals and hreflang tags stay canonical
  const [pathname, search = ""] = req.originalUrl.split("?");
  if (pathname.length > 1 && pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(pathname)) {
    return res.redirect(301, `${pathname.replace(/\/+$/, "")}${search ? `?${search}` : ""}`);
  }

  next();
});

// Serve static files
app.use(express.static(distPath));

// API paths never render the shell.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  next();
});

// Rewrites the shell's <head> per route, so the HTML a crawler receives already
// carries the right title, canonical and product tags. Must stay after express.static.
app.use(createSeoHeadMiddleware(indexHtmlPath));

// Handle React Router - serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return res.sendFile(indexHtmlPath);
  }

  next();
});

app.listen(port, () => {
  console.log(`🚀 No Name server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
