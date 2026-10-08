import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Facebook, Instagram, Menu, MessageCircle, Music2, Search, ShoppingBag, X, Youtube } from "lucide-react";
import { addCartLine } from "@/lib/cart";
import { createIdempotencyKey, parseOrderSubmitResponse, type OrderSubmitResult } from "@/lib/orderFlow";
import { adminJsonInit, adminRequest, type AdminWriteResult } from "@/lib/adminWrites";
import { resolveInitialLanguage } from "@/lib/seo";

const englishProductNames: Record<string, string> = {
  "everyday-jacket": "Everyday Jacket",
  "siena-dress": "Siena Silk Dress",
  "wide-leg-pants": "Wide Leg Pants",
  "linen-shirt": "Soft Linen Shirt",
  "laila-dress": "Laila Day Dress",
  "classic-blazer": "Classic Blazer",
  "linen-set": "Camel Linen Set",
  "blue-overshirt": "Blue Printed Overshirt",
  "set-01": "Camel Linen Set",
  "set-02": "Grey Everyday Set",
  "set-03": "Olive Relaxed Set",
  "set-04": "Comfort Travel Set",
  "set-05": "Soft Cream Set",
  "set-06": "Summer Linen Set",
  "top-01": "Soft Linen Shirt",
  "top-02": "Ribbed Black Top",
  "top-03": "Relaxed White Shirt",
  "top-04": "Front Button Blouse",
  "top-05": "Stone Linen Top",
  "top-06": "Blue Printed Shirt",
  "pants-02": "Straight Linen Pants",
  "pants-03": "Classic Black Pants",
  "pants-04": "Wide Sand Pants",
  "pants-05": "Comfort Jersey Pants",
  "pants-06": "Straight Leg Jeans",
  "jacket-03": "Oversized Denim Jacket",
  "jacket-04": "Light Linen Jacket",
  "jacket-05": "Long Cardigan",
  "jacket-06": "Ivory Blazer",
  "denim-01": "Straight Blue Jeans",
  "denim-02": "Light Wide Jeans",
  "denim-03": "Classic Denim Jacket",
  "denim-04": "Dark Straight Jeans",
  "denim-05": "Long Denim Skirt",
  "denim-06": "Light Denim Shirt",
  "dress-01": "Siena Silk Dress",
  "dress-02": "Laila Day Dress",
  "dress-03": "Long Linen Dress",
  "dress-04": "Relaxed Summer Dress",
  "dress-05": "Simple Black Dress",
  "dress-06": "Soft Cream Dress",
};

const englishCategories: Record<string, string> = { "أطقم": "Sets", "توبس": "Blouses / shirts", "بنطال": "Skirts / pants", "جينز": "Denims", "جاكيتات": "Jackets", "فساتين": "Dresses", Sets: "Sets", "Blouses / shirts": "Blouses / shirts", "Skirts / pants": "Skirts / pants", Denims: "Denims", Dresses: "Dresses", Jackets: "Jackets" };
const normalizeCategory = (category: string) => englishCategories[category] || category;
export const getProductName = (product: StoreProduct, language: Language) => language === "en" ? product.name || englishProductNames[product.id] : product.nameAr || product.name;
export const getCategoryName = (category: string, language: Language) => {
  const normalized = normalizeCategory(category);
  return normalized;
};
export const getProductBadge = (product: StoreProduct) => product.badge?.trim() || product.tag?.trim() || "";
export const getProductDiscount = (product: StoreProduct) => {
  if (typeof product.originalPrice !== "number" || typeof product.salePrice !== "number" || product.salePrice >= product.originalPrice) return null;
  return Math.round((1 - product.salePrice / product.originalPrice) * 100);
};
export const getProductUnitPrice = (product: StoreProduct) => getProductDiscount(product) === null ? product.numericPrice : product.salePrice!;
export const formatProductAmount = (amount: number, language: Language) => `${amount.toLocaleString("en-US")} ${language === "en" ? "L.E" : "ج.م"}`;
export const getProductPrice = (product: StoreProduct, language: Language) => formatProductAmount(getProductUnitPrice(product), language);
const productColors: Record<string, string[]> = {
  أطقم: ["#d8d1c2", "#6f756b", "#222222"],
  توبس: ["#f4f1e8", "#222222", "#9b9b92"],
  بنطال: ["#1e2937", "#b3b5b4", "#8b6f58", "#222222"],
  جاكيتات: ["#222222", "#d2c7b6", "#7d8a76"],
  جينز: ["#91b6d6", "#45627a", "#1e2937"],
};
export const getProductColors = (product: StoreProduct) => product.colors?.length ? product.colors : productColors[product.category] || ["#222222", "#d8d1c2"];

export const categories = [
  { label: "فساتين", image: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=850&q=85" },
  { label: "طقم كامل", image: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=850&q=85" },
  { label: "أساسيات", image: "https://images.unsplash.com/photo-1496217590455-aa63a8350eea?auto=format&fit=crop&w=850&q=85" },
];

export type StoreVariant = { id?: string; productId?: string; size: string; color: string; sku?: string; stock: number };
export type StoreProduct = { id: string; name: string; price: string; numericPrice: number; originalPrice?: number; category: string; image: string; tag?: string; nameAr?: string; description?: string; descriptionAr?: string; stock?: number; lowStockThreshold?: number; salePrice?: number; badge?: string; colors?: string[]; sizes?: string[]; video?: string; images?: string[]; variants?: StoreVariant[] };
export type CartItem = { product: StoreProduct; quantity: number; variantId?: string; size?: string; color?: string };
export type SiteSettings = { announcement: string; accent: string; heroTitle?: string; heroDescription?: string; walletNumber?: string; instapayNumber?: string; salesWhatsappNumber?: string; salesWhatsappUrl?: string; discoverVideos?: string[]; socialLinks?: { instagram?: string; facebook?: string; youtube?: string; whatsapp?: string; tiktok?: string }; shippingCost?: number; freeShippingThreshold?: number };
export type SectionSettings = { title: string; description: string; image: string; video?: string };
export type PageSettings = {
  about: { titleAr: string; titleEn: string; introAr: string; introEn: string; beliefTitleAr: string; beliefTitleEn: string; bodyAr: string; bodyEn: string; body2Ar: string; body2En: string; image1: string; image2: string };
  shipping: { titleAr: string; titleEn: string; contentAr: string; contentEn: string };
  contact: { titleAr: string; titleEn: string; contentAr: string; contentEn: string; recipientEmail: string };
};
export type Coupon = { code: string; discount: number; uses: number; active: boolean };
export type PaymentMethod = "cod" | "wallet" | "instapay";
export type StoreOrderItem = { name: string; quantity: number; unitPrice: number; total: number; originalUnitPrice?: number; discountAmount?: number; productId?: string; variantId?: string; size?: string; color?: string };
export type StoreOrder = { id: string; date: string; total: number; subtotal?: number; discountAmount?: number; shippingAmount?: number; couponCode?: string; status: "جديد" | "قيد التجهيز" | "مكتمل"; items: number; customerName?: string; phone?: string; address?: string; notes?: string; paymentMethod?: PaymentMethod; transferNumber?: string; receipt?: string; idempotencyKey?: string; orderItems?: StoreOrderItem[] };
export type Language = "ar" | "en";
export const getSalesWhatsAppUrl = (settings: SiteSettings) => {
  const number = settings.salesWhatsappNumber?.replace(/\D/g, "");
  return settings.salesWhatsappUrl?.trim() || (number ? `https://wa.me/${number}` : settings.socialLinks?.whatsapp || "https://wa.me/201553003040");
};
type StoreContextValue = { cart: number; cartItems: CartItem[]; catalog: StoreProduct[]; catalogLoading: boolean; siteSettings: SiteSettings; sections: Record<string, SectionSettings>; pageSettings: PageSettings; coupons: Coupon[]; appliedCouponCode: string; setAppliedCouponCode: (code: string) => void; orders: StoreOrder[]; addToCart: (product: StoreProduct, options?: { variantId?: string; size?: string; color?: string }) => void; removeFromCart: (productId: string, variantId?: string) => void; updateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void; clearCart: () => void; addProduct: (product: StoreProduct) => Promise<AdminWriteResult>; updateProduct: (product: StoreProduct) => Promise<AdminWriteResult>; deleteProduct: (id: string) => Promise<AdminWriteResult>; addOrder: (order: StoreOrder) => Promise<OrderSubmitResult>; setOrders: (orders: StoreOrder[]) => void; setCoupons: (coupons: Coupon[]) => void; updateSiteSettings: (settings: SiteSettings) => Promise<AdminWriteResult>; updateSection: (key: string, section: SectionSettings) => Promise<AdminWriteResult>; updatePageSettings: (settings: PageSettings) => Promise<AdminWriteResult>; addCoupon: (coupon: Coupon) => Promise<AdminWriteResult>; deleteCoupon: (code: string) => Promise<AdminWriteResult>; liked: number[]; toggleLike: (index: number) => void; language: Language; toggleLanguage: () => void };
const StoreContext = createContext<StoreContextValue | null>(null);
export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreLayout");
  return context;
};

export function StoreLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ announcement: "Free shipping on orders over 2,500 EGP · Cash on delivery available", accent: "#d4775c", heroTitle: "New for Summer 2026", heroDescription: "Modest styles designed for everyday comfort.", salesWhatsappNumber: "201068568250", salesWhatsappUrl: "https://wa.me/201068568250", socialLinks: { instagram: "", facebook: "", youtube: "", whatsapp: "https://wa.me/201553003040", tiktok: "" }, shippingCost: 80, freeShippingThreshold: 2500 });
  const defaultSections: Record<string, SectionSettings> = { arrivals: { title: "New Collection", description: "New pieces have just arrived.", image: "" }, categories: { title: "Shop by category", description: "Find the section closest to your style.", image: "" }, editorial: { title: "Effortless style", description: "Thoughtful designs for every moment.", image: "" }, discover: { title: "Discover your style", description: "Explore the latest looks.", image: "" }, sets: { title: "Sets", description: "", image: "" }, tops: { title: "Blouses / shirts", description: "", image: "" }, pants: { title: "Skirts / pants", description: "", image: "" }, dresses: { title: "Dresses", description: "", image: "" } };
  const [sections, setSections] = useState<Record<string, SectionSettings>>(defaultSections);
  const defaultPageSettings: PageSettings = {
    about: { titleAr: "لما تكوني على طبيعتك.", titleEn: "When you are yourself.", introAr: "بدأت no name من سؤال بسيط: ليه لازم نختار بين إننا نكون مرتاحين وإننا نكون أنيقين؟", introEn: "no name began with a simple question: why should we choose between feeling comfortable and looking beautiful?", beliefTitleAr: "اللبس الحلو بيبدأ من الإحساس.", beliefTitleEn: "Good clothes start with a feeling.", bodyAr: "نحن علامة مصرية مستقلة نصمم للمرأة التي تعرف نفسها جيداً. نختار خامات مريحة، قصّات ذكية، وألواناً تعيش أبعد من موسم واحد.", bodyEn: "We are an independent Egyptian label designing for women who know themselves well. We choose comfortable fabrics, considered cuts, and colors that live beyond one season.", body2Ar: "كل قطعة تُصنع بالتعاون مع حرفيين محليين في القاهرة. لأن التفاصيل الصغيرة، من أول غرزة لآخر زر، هي التي تجعل القطعة خاصة.", body2En: "Every piece is made with local artisans in Cairo. The smallest details, from the first stitch to the last button, are what make a piece special.", image1: "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1100&q=90", image2: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=700&q=90" },
    shipping: { titleAr: "الشحن والاستبدال", titleEn: "Shipping & returns", contentAr: "نوفر شحناً سريعاً داخل مصر مع إمكانية الاستبدال بسهولة. تواصلي معنا لمعرفة التفاصيل.", contentEn: "We offer fast shipping across Egypt with easy exchanges. Contact us for full details." },
    contact: { titleAr: "تواصلي معنا", titleEn: "Contact us", contentAr: "يسعدنا الرد على استفساراتك ومساعدتك في اختيار القطعة المناسبة.", contentEn: "We would love to answer your questions and help you find the right piece.", recipientEmail: "" },
  };
  const [pageSettings, setPageSettings] = useState<PageSettings>(defaultPageSettings);
  const [coupons, setCouponsState] = useState<Coupon[]>([]);
  const [orders, setOrdersState] = useState<StoreOrder[]>([]);

  useEffect(() => {
    fetch('/api/products').then(res => res.json()).then(data => { if (Array.isArray(data)) setCatalog(data); setCatalogLoading(false); }).catch(() => setCatalogLoading(false));
    fetch('/api/coupons').then(res => res.json()).then(data => { if (Array.isArray(data)) setCoupons(data); }).catch(console.error);
    fetch('/api/settings').then(res => res.json()).then(data => {
       if (data?.siteSettings) setSiteSettings({ ...siteSettings, ...data.siteSettings });
       if (data?.sections) setSections({ ...defaultSections, ...data.sections });
       if (data?.pageSettings) setPageSettings({ ...defaultPageSettings, ...data.pageSettings });
    }).catch(console.error);
  }, []);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [liked, setLiked] = useState<number[]>([]);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [language, setLanguage] = useState<Language>(() => resolveInitialLanguage());
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isEnglish = language === "en";
  const activeSection = (query: string) => {
    if (location.pathname !== "/shop") return false;
    return new URLSearchParams(location.search).toString() === new URLSearchParams(query).toString();
  };
  useEffect(() => { const handleScroll = () => setIsScrolled(window.scrollY > 12); handleScroll(); window.addEventListener("scroll", handleScroll, { passive: true }); return () => window.removeEventListener("scroll", handleScroll); }, []);
  useEffect(() => { setCatalog((current) => current.filter((product) => product.id !== "check-print-set")); }, []);
  useEffect(() => { localStorage.setItem("no-name-language", language); localStorage.setItem("no-name-language-version", "2"); document.documentElement.lang = language; document.documentElement.dir = isEnglish ? "ltr" : "rtl"; }, [language, isEnglish]);
  const toggleLanguage = () => {
    const next: Language = language === "ar" ? "en" : "ar";
    setLanguage(next); // the persistence effect above writes localStorage for us
    // Keep the language in the URL so the choice is shareable and survives a reload.
    const params = new URLSearchParams(location.search);
    params.set("lang", next);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname, location.search]);
  const addToCart = (product: StoreProduct, options?: { variantId?: string; size?: string; color?: string }) => {
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    setCartItems((current) => {
      const merged = addCartLine(
        current.map((item) => ({
          productId: item.product.id,
          hasVariants: Array.isArray(item.product.variants) && item.product.variants.length > 0,
          variantId: item.variantId,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
        })),
        { productId: product.id, hasVariants, variantId: options?.variantId, size: options?.size, color: options?.color, quantity: 1 }
      );
      return merged.map((line) => ({
        product: line.productId === product.id ? product : current.find((item) => item.product.id === line.productId)?.product || product,
        quantity: line.quantity,
        variantId: line.variantId,
        size: line.size,
        color: line.color,
      }));
    });
  };
  const removeFromCart = (productId: string, variantId?: string) => setCartItems((current) => current.filter((item) => !(item.product.id === productId && item.variantId === variantId)));
  const updateQuantity = (productId: string, variantId: string | undefined, quantity: number) => setCartItems((current) => quantity < 1 ? current.filter((item) => !(item.product.id === productId && item.variantId === variantId)) : current.map((item) => item.product.id === productId && item.variantId === variantId ? { ...item, quantity } : item));
  const clearCart = () => { setCartItems([]); setAppliedCouponCode(""); };
  const cart = cartItems.reduce((total, item) => total + item.quantity, 0);
  const toggleLike = (index: number) => setLiked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  const addProduct = async (product: StoreProduct): Promise<AdminWriteResult> => {
    const result = await adminRequest('/api/admin/products', adminJsonInit('POST', product));
    if (result.kind !== 'success') { console.error('Add product failed:', result.status, result.message); return result; }
    setCatalog((current) => [...current, product]);
    return result;
  };
  const updateProduct = async (product: StoreProduct): Promise<AdminWriteResult> => {
    const result = await adminRequest(`/api/admin/products/${product.id}`, adminJsonInit('PUT', product));
    if (result.kind !== 'success') { console.error('Update product failed:', result.status, result.message); return result; }
    setCatalog((current) => current.map((item) => item.id === product.id ? product : item));
    return result;
  };
  const deleteProduct = async (id: string): Promise<AdminWriteResult> => {
    const result = await adminRequest(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (result.kind !== 'success') { console.error('Delete product failed:', result.status, result.message); return result; }
    setCatalog((current) => current.filter((item) => item.id !== id));
    return result;
  };
  const addOrder = async (order: StoreOrder): Promise<OrderSubmitResult> => {
    const idempotencyKey = createIdempotencyKey(order.idempotencyKey);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          customerName: order.customerName,
          phone: order.phone,
          address: order.address,
          notes: order.notes,
          paymentMethod: order.paymentMethod,
          couponCode: order.couponCode,
          transferNumber: order.transferNumber,
          receipt: order.receipt,
          orderItems: (order.orderItems || []).map((item) => ({
            productId: (item as any).productId || undefined,
            variantId: (item as any).variantId || undefined,
            size: (item as any).size || undefined,
            color: (item as any).color || undefined,
            quantity: item.quantity,
          })),
        })
      });
      const bodyText = await res.text().catch(() => null);
      const result = parseOrderSubmitResponse(res.status, bodyText);
      if (result.kind === "success") {
        setOrdersState((current) => [{ ...order, id: result.reference }, ...current]);
      } else {
        console.error('Order save error:', result.status, result.message);
      }
      return result;
    } catch (e) {
      console.error('Order save error:', e);
      return { ok: false, kind: "network", message: "We could not reach the server. Check your connection and try again." };
    }
  };
  const setOrders = (next: StoreOrder[]) => setOrdersState(next);
  const setCoupons = (next: Coupon[]) => setCouponsState(next);
  const updateSiteSettings = async (settings: SiteSettings): Promise<AdminWriteResult> => {
    const result = await adminRequest('/api/admin/settings', adminJsonInit('POST', { type: 'siteSettings', data: settings }));
    if (result.kind !== 'success') { console.error('Update site settings failed:', result.status, result.message); return result; }
    setSiteSettings(settings);
    return result;
  };
  const updateSection = async (key: string, section: SectionSettings): Promise<AdminWriteResult> => {
    const next = { ...sections, [key]: section };
    const result = await adminRequest('/api/admin/settings', adminJsonInit('POST', { type: 'sections', data: next }));
    if (result.kind !== 'success') { console.error('Update section failed:', result.status, result.message); return result; }
    setSections(next);
    return result;
  };
  const updatePageSettings = async (settings: PageSettings): Promise<AdminWriteResult> => {
    const result = await adminRequest('/api/admin/settings', adminJsonInit('POST', { type: 'pageSettings', data: settings }));
    if (result.kind !== 'success') { console.error('Update page settings failed:', result.status, result.message); return result; }
    setPageSettings(settings);
    return result;
  };
  const addCoupon = async (coupon: Coupon): Promise<AdminWriteResult> => {
    const result = await adminRequest('/api/admin/coupons', adminJsonInit('POST', coupon));
    if (result.kind !== 'success') { console.error('Add coupon failed:', result.status, result.message); return result; }
    setCouponsState((current) => [...current, coupon]);
    return result;
  };
  const deleteCoupon = async (code: string): Promise<AdminWriteResult> => {
    const result = await adminRequest(`/api/admin/coupons/${code}`, { method: 'DELETE' });
    if (result.kind !== 'success') { console.error('Delete coupon failed:', result.status, result.message); return result; }
    setCouponsState((current) => current.filter((coupon) => coupon.code !== code));
    return result;
  };
  const nav = (path: string) => { setMenuOpen(false); navigate(path); };

  return <StoreContext.Provider value={{ cart, cartItems, catalog, catalogLoading, siteSettings, sections, pageSettings, coupons, appliedCouponCode, setAppliedCouponCode, orders, addToCart, removeFromCart, updateQuantity, clearCart, addProduct, updateProduct, deleteProduct, addOrder, setOrders, setCoupons, updateSiteSettings, updateSection, updatePageSettings, addCoupon, deleteCoupon, liked, toggleLike, language, toggleLanguage }}>
    <main dir={isEnglish ? "ltr" : "rtl"} className="min-h-screen overflow-x-clip bg-white text-[#171717]">
      <div className="fixed inset-x-0 top-0 z-40 h-[30px] overflow-hidden border-b border-[#1c2822]/10 bg-[#f4f2e9] px-5 py-1.5 text-center text-[8px] tracking-[0.08em] text-[#1c2822]/75 sm:text-[9px]"><div className="announcement-track flex w-max items-center gap-16 whitespace-nowrap"><span>{siteSettings.announcement || (isEnglish ? "Free Shipping on Orders Over 3,000 EGP" : "شحن مجاني للطلبات فوق ٣٠٠٠ جنيه")}</span><span>{isEnglish ? "Enjoy Up to 50% Off · Welcome Anew" : "خصم يصل إلى ٥٠٪ · أهلاً بكِ"}</span><span>{siteSettings.announcement || (isEnglish ? "Free Shipping on Orders Over 3,000 EGP" : "شحن مجاني للطلبات فوق ٣٠٠٠ جنيه")}</span><span>{siteSettings.announcement || (isEnglish ? "Free Shipping on Orders Over 3,000 EGP" : "شحن مجاني للطلبات فوق ٣٠٠٠ جنيه")}</span><span>{isEnglish ? "Enjoy Up to 50% Off · Welcome Anew" : "خصم يصل إلى ٥٠٪ · أهلاً بكِ"}</span><span>{siteSettings.announcement || (isEnglish ? "Free Shipping on Orders Over 3,000 EGP" : "شحن مجاني للطلبات فوق ٣٠٠٠ جنيه")}</span></div></div>
      <header className={`z-30 ${isHome ? (isScrolled ? "fixed inset-x-0 top-[30px] border-b border-black/10 bg-[#eeece1] text-[#171717] shadow-sm" : "fixed inset-x-0 top-[30px] bg-transparent text-white") : "sticky top-[30px] border-b border-black/10 bg-[#eeece1] text-[#171717]"}`}>
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-5 lg:px-8">
          <button className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><Menu size={21} strokeWidth={1.4} /></button>
          <nav className="hidden items-center gap-4 text-[10px] font-medium tracking-[0.08em] lg:flex">
            <Link to="/shop?collection=new" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?collection=new") ? "font-semibold underline underline-offset-8" : ""}`}>New Collection</Link>
            <Link to="/shop?category=Sets" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?category=Sets") ? "font-semibold underline underline-offset-8" : ""}`}>Sets</Link>
            <Link to="/shop?category=Skirts%20%2F%20pants" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?category=Skirts%20%2F%20pants") ? "font-semibold underline underline-offset-8" : ""}`}>Skirts / pants</Link>
            <Link to="/shop?category=Blouses%20%2F%20shirts" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?category=Blouses%20%2F%20shirts") ? "font-semibold underline underline-offset-8" : ""}`}>Blouses / shirts</Link>
            <Link to="/shop?category=Denims" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?category=Denims") ? "font-semibold underline underline-offset-8" : ""}`}>Denims</Link>
            <Link to="/shop?category=Dresses" className={`text-[13px] hover:underline hover:underline-offset-8 ${activeSection("?category=Dresses") ? "font-semibold underline underline-offset-8" : ""}`}>Dresses</Link>
          </nav>
          <Link to="/" className="store-logo absolute left-1/2 -translate-x-1/2 text-center leading-none" aria-label="الصفحة الرئيسية">
            <div className="font-['Times_New_Roman'] text-[22px] font-semibold tracking-[0.12em]">No Name</div>
            <div className="mt-1 text-[7px] tracking-[0.38em]">MODEST WEAR</div>
          </Link>
          <div className="flex items-center gap-3 text-[10px] tracking-wide"><button className="hidden border border-current/30 px-2 py-1 text-[10px] lg:inline-flex" onClick={toggleLanguage} aria-label={isEnglish ? "Switch to Arabic" : "Switch to English"}>{isEnglish ? "العربية" : "English"}</button><button onClick={() => setSearchOpen((open) => !open)} aria-label={isEnglish ? "Search" : "بحث"}><Search size={17} strokeWidth={1.4} /></button><button className="relative" onClick={() => navigate("/cart")} aria-label="حقيبة التسوق"><ShoppingBag size={17} strokeWidth={1.4} />{cart > 0 && <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d68b71] px-1 text-[9px] text-white">{cart}</span>}</button></div>
        </div>
        {searchOpen && <form onSubmit={(event) => { event.preventDefault(); navigate(`/shop?search=${encodeURIComponent((event.currentTarget.elements.namedItem("search") as HTMLInputElement).value)}`); setSearchOpen(false); }} className="mx-auto flex max-w-[1240px] border-t border-[#1c2822]/10 px-5 py-4 lg:px-8"><input name="search" autoFocus placeholder={isEnglish ? "Search for a piece..." : "ابحثي عن قطعة..."} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><button className="text-[11px] font-bold">{isEnglish ? "Search" : "بحث"} <ArrowLeft className="mr-2 inline" size={15} /></button></form>}
        {menuOpen && <div className="fixed inset-0 z-50 bg-[#1c2822] p-6 text-[#f6f3ee]"><button onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={24} /></button><div className="mt-20 flex flex-col gap-6 text-2xl"><button className="text-right" onClick={() => nav("/shop?collection=new")}>New Collection</button><button className="text-right" onClick={() => nav("/shop?category=Sets")}>Sets</button><button className="text-right" onClick={() => nav("/shop?category=Skirts%20%2F%20pants")}>Skirts / pants</button><button className="text-right" onClick={() => nav("/shop?category=Blouses%20%2F%20shirts")}>Blouses / shirts</button><button className="text-right" onClick={() => nav("/shop?category=Denims")}>Denims</button><button className="text-right" onClick={() => nav("/shop?category=Dresses")}>Dresses</button></div><button onClick={toggleLanguage} className="absolute bottom-8 left-6 right-6 border border-[#f6f3ee]/30 py-3 text-center text-sm" aria-label={isEnglish ? "Switch to Arabic" : "Switch to English"}>{isEnglish ? "العربية" : "English"}</button></div>}
      </header>
      {children}
      <footer id="journal" className="bg-white px-5 py-16 lg:px-8"><div className="mx-auto max-w-[1240px]"><div className="grid gap-12 border-b border-[#1c2822]/15 pb-14 md:grid-cols-[1.4fr_1fr_1fr_1.5fr]"><div><Link to="/" className="store-logo font-['Times_New_Roman'] text-3xl font-semibold tracking-[0.14em]">No Name</Link><div className="mt-5 flex gap-4"><a href={siteSettings.socialLinks?.instagram || "https://instagram.com"} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={16} /></a><a href={siteSettings.socialLinks?.facebook || "https://facebook.com"} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={16} /></a><a href={siteSettings.socialLinks?.youtube || "https://youtube.com"} target="_blank" rel="noreferrer" aria-label="YouTube"><Youtube size={16} /></a><a href={siteSettings.socialLinks?.whatsapp || "https://wa.me/201553003040"} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={16} /></a><a href={siteSettings.socialLinks?.tiktok || "https://tiktok.com"} target="_blank" rel="noreferrer" aria-label="TikTok"><Music2 size={16} /></a><Link to="/admin/login" className="hidden">{isEnglish ? "Admin dashboard" : "لوحة التحكم"}</Link></div></div><div><h3 className="mb-5 text-[11px] font-bold">{isEnglish ? "Shop" : "تسوقي"}</h3><div className="flex flex-col gap-3 text-[12px] text-[#1c2822]/60"><Link to="/shop?collection=new">{isEnglish ? "New collection" : "وصل حديثاً"}</Link><Link to="/shop?category=أطقم">{isEnglish ? "Sets" : "الأطقم"}</Link><Link to="/shop?category=توبس">{isEnglish ? "Blouses / shirts" : "البلوزات والقمصان"}</Link><Link to="/shop?category=بنطال">{isEnglish ? "Skirts / pants" : "التنانير والبناطيل"}</Link><Link to="/shop?category=جينز">{isEnglish ? "Denims" : "الجينز"}</Link><Link to="/shop?category=فساتين">{isEnglish ? "Dresses" : "الفساتين"}</Link></div></div><div><h3 className="mb-5 text-[11px] font-bold">{isEnglish ? "Help" : "مساعدة"}</h3><div className="flex flex-col gap-3 text-[12px] text-[#1c2822]/60"><Link to="/about">{isEnglish ? "About no name" : "عن no name"}</Link><Link to="/shipping">{isEnglish ? "Shipping & returns" : "الشحن والاستبدال"}</Link><Link to="/contact">{isEnglish ? "Contact us" : "تواصلي معنا"}</Link></div></div><div><h3 className="mb-5 text-[11px] font-bold">{isEnglish ? "Stay in the know" : "خليكي على اطلاع"}</h3><p className="mb-4 text-[12px] leading-6 text-[#1c2822]/60">{isEnglish ? "Subscribe for first access to every new drop." : "اشتركي عشان تعرفي كل جديد قبل أي حد."}</p>{subscribed ? <p className="text-[12px] font-bold text-[#d4775c]">{isEnglish ? "You are subscribed. Welcome in." : "تم الاشتراك بنجاح، أهلاً بكِ."}</p> : <form onSubmit={(event) => { event.preventDefault(); if (email) setSubscribed(true); }} className="flex border-b border-[#1c2822]"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="بريدك الإلكتروني" className="min-w-0 flex-1 bg-transparent py-3 text-[12px] outline-none placeholder:text-[#1c2822]/40" /><button aria-label="اشتراك"><ArrowLeft size={17} /></button></form>}</div></div><div className="flex flex-col justify-between gap-3 pt-6 text-[10px] text-[#1c2822]/45 sm:flex-row"><span className="flex flex-col gap-1"><span className="inline-flex items-center gap-1">صنع بحب في القاهره 2026 <Link to="/admin/login" aria-label="Admin dashboard" title="Admin dashboard" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#1c2822]/55 text-[8px] font-medium leading-none text-[#1c2822] transition hover:bg-[#1c2822] hover:text-white"><span aria-hidden="true">R</span></Link></span><span>تم التطوير بواسطه فريق</span><a href="https://wa.me/201553003040" target="_blank" rel="noreferrer" className="underline underline-offset-2">Casper.Dev</a></span><span /></div></div></footer>
    </main>
  </StoreContext.Provider>;
}

export function ProductCard({ product, index }: { product: StoreProduct; index: number }) {
  const { liked, toggleLike, addToCart, cartItems, language } = useStore();
  const added = cartItems.some((item) => item.product.id === product.id);
  const navigate = useNavigate();
  const productName = getProductName(product, language);
  const isEnglish = language === "en";
  const colors = getProductColors(product);
  const sizes = product.sizes === undefined ? ["S", "M", "L", "XL", "XXL"] : product.sizes;
  const discount = getProductDiscount(product);
  const hasDiscount = discount !== null;
  const originalPrice = product.originalPrice ?? product.numericPrice;
  const salePrice = product.salePrice ?? product.numericPrice;
  const badge = hasDiscount ? getProductBadge(product) || `-${discount}%` : getProductBadge(product);
  const openProduct = () => navigate(`/product/${product.id}`);
  return <article className="group min-w-0 cursor-pointer" onClick={openProduct} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openProduct(); }} role="link" tabIndex={0}><div className="relative aspect-[.82] overflow-hidden rounded-2xl bg-[#f0f0ee]"><Link to={`/product/${product.id}`} className="block h-full"><img src={product.image} alt={productName} loading="lazy" decoding="async" width={600} height={730} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></Link>{badge && <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-bold ${hasDiscount ? "bg-[#d4775c] text-white" : "bg-white/90"}`}>{isEnglish ? (badge === "جديد" ? "New" : badge === "الأكثر مبيعاً" ? "Bestseller" : badge) : badge}</span>}<button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleLike(index); }} className="absolute left-3 top-3 text-lg" aria-label={isEnglish ? "Add to wishlist" : "إضافة للمفضلة"}><span className={liked.includes(index) ? "text-[#d4775c]" : "text-white drop-shadow"}>♥</span></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const hasVariants = Array.isArray(product.variants) && product.variants.length > 0; if (hasVariants) { openProduct(); } else { addToCart(product); } }} className={`absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full text-[#171717] transition hover:bg-[#171717] hover:text-white ${added ? "bg-black text-white" : "bg-[#e9e3d7]"}`} aria-label={isEnglish ? "Add to cart" : "إضافة إلى السلة"}><ShoppingBag size={16} strokeWidth={1.5} /></button></div><div className="mt-4 text-center"><h3 className="text-[13px] font-medium"><Link to={`/product/${product.id}`} onClick={(event) => event.stopPropagation()} className="transition hover:underline">{productName}</Link></h3><div className="mt-1 text-[12px]">{hasDiscount ? <div className="grid grid-cols-[1fr_auto_1fr] items-baseline"><span className="justify-self-end text-black/40 line-through mx-3">{formatProductAmount(originalPrice, language)}</span><span className="mx-auto font-semibold">{formatProductAmount(salePrice, language)}</span><span aria-hidden="true" /></div> : <span className="mx-auto block w-fit text-black">{getProductPrice(product, language)}</span>}</div><div className="mt-2 flex justify-center gap-1.5" aria-label={isEnglish ? "Available colors" : "الألوان المتاحة"}>{colors.map((color) => <span key={color} className="h-3 w-3 rounded-full border border-black/15" style={{ backgroundColor: color }} />)}</div>{sizes.length > 0 && <div className="mt-2 flex flex-wrap justify-center gap-1" aria-label="Available sizes">{sizes.map((size) => <span key={size} className="inline-flex h-5 min-w-6 items-center justify-center border border-black/15 px-1.5 text-[9px] text-black/55">{size}</span>)}</div>}</div></article>;
}
