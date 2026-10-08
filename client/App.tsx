import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { StoreLayout } from "./components/store/StoreLayout";
import { RouteSeo } from "./components/seo/RouteSeo";

const Index = lazy(() => import("./pages/Index"));
const Shop = lazy(() => import("./pages/Shop"));
const About = lazy(() => import("./pages/About"));
const Product = lazy(() => import("./pages/Product"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSummary = lazy(() => import("./pages/OrderSummary"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const InfoPage = lazy(() => import("./pages/About").then((module) => ({ default: module.InfoPage })));

const queryClient = new QueryClient();

function AdminGate() {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "include" })
      .then((response) => setStatus(response.ok ? "authenticated" : "unauthenticated"))
      .catch(() => setStatus("unauthenticated"));
  }, []);

  if (status === "loading") return <section className="flex min-h-[calc(100vh-166px)] items-center justify-center bg-[#eeece1] px-5 py-16 text-[12px]">Loading...</section>;
  return status === "authenticated" ? <Suspense fallback={null}><Admin /></Suspense> : <Navigate to="/admin/login" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <StoreLayout>
        <RouteSeo />
        <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/about" element={<About />} />
          <Route path="/shipping" element={<InfoPage type="shipping" />} />
          <Route path="/contact" element={<InfoPage type="contact" />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-summary/:id" element={<OrderSummary />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminGate />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </StoreLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const rootElement = document.getElementById("root")!;
if (!rootElement.dataset.reactMounted) {
  rootElement.dataset.reactMounted = "true";
  createRoot(rootElement).render(<App />);
}
