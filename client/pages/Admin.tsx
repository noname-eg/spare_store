import { useEffect, useState } from "react";
import { BarChart3, Eye, ImagePlus, LayoutDashboard, LogOut, Palette, Plus, Save, Settings, Trash2, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore, type PageSettings, type SectionSettings, type SiteSettings, type StoreProduct } from "@/components/store/StoreLayout";
import type { AdminWriteResult } from "@/lib/adminWrites";
import type { ShippingZone } from "@shared/api";

const categories = ["Sets", "Blouses / shirts", "Skirts / pants", "Denims", "Dresses"];
const categoryLabels: Record<string, string> = { Sets: "Sets", "Blouses / shirts": "Blouses / shirts", "Skirts / pants": "Skirts / pants", Denims: "Denims", Dresses: "Dresses" };
const emptyProduct: StoreProduct = {
  id: "",
  name: "",
  nameAr: "",
  price: "",
  numericPrice: 0,
  originalPrice: 0,
  salePrice: undefined,
  badge: "",
  category: "Dresses",
  image: "",
  tag: "",
  stock: 10,
  lowStockThreshold: 3,
  colors: ["#222222"],
  sizes: ["S", "M", "L"],
  images: [""],
};
const sectionOptions = [
  ["arrivals", "New Collection"],
  ["categories", "Shop by category"],
  ["editorial", "Effortless style"],
  ["discover", "Discover your style"],
  ["sets", "Sets"],
  ["tops", "Blouses / shirts"],
  ["pants", "Skirts / pants"],
  ["dresses", "Dresses"],
];
const inputClass = "admin-input";

// لا يوجد أي احتياط Base64: فشل الرفع = خطأ ظاهر، ولا تُخزَّن صورة مضمنة أبداً
const readFile = (file: File, onSuccess: (value: string) => void, onError: (message: string) => void) => {
  const reader = new FileReader();
  reader.onerror = () => onError("Could not read the selected file.");
  reader.onload = async () => {
    const base64 = String(reader.result);
    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, file_name: file.name, kind: 'product' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) {
          onSuccess(data.url);
          return;
        }
      }
      onError("Image upload failed. Please try again or paste a direct file URL.");
    } catch {
      onError("Image upload failed. Please try again or paste a direct file URL.");
    }
  };
  reader.readAsDataURL(file);
};

function AssetField({ label, value, accept, onChange, isEnglish }: { label: string; value: string; accept: string; onChange: (value: string) => void; isEnglish: boolean }) {
  const [uploadError, setUploadError] = useState("");
  return (
    <label className="block text-[11px] font-bold">
      {label}
      <div className="mt-2 flex gap-2">
        <input value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-0`} placeholder={isEnglish ? "Or paste a direct file URL" : "أو الصقي رابط الملف"} />
        <label className="flex shrink-0 cursor-pointer items-center justify-center border border-[#1c2822]/15 px-3 text-[10px] font-normal">
          <Upload size={14} />
          <input type="file" accept={accept} className="hidden" onChange={(event) => { setUploadError(""); const file = event.target.files?.[0]; if (file) readFile(file, onChange, setUploadError); }} />
        </label>
      </div>
      {uploadError && <p className="mt-1 text-[10px] font-medium text-[#c95f49]">{uploadError}</p>}
    </label>
  );
}

function ReceiptLink({ orderId }: { orderId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/receipt-url`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active && data?.url) setUrl(data.url); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [orderId]);
  if (!url) return <span className="text-black/40">...جاري التحميل</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline">فتح الإيصال</a>;
}

export default function Admin() {
  const navigate = useNavigate();
  const { catalog, siteSettings, sections, pageSettings, coupons, orders, addProduct, updateProduct, deleteProduct, updateSiteSettings, updateSection, updatePageSettings, addCoupon, deleteCoupon, setOrders, setCoupons } = useStore();
  const isEnglish = true;
  const [activeTab, setActiveTab] = useState("overview");
  const [form, setForm] = useState<StoreProduct>(emptyProduct);
  const [sizesInput, setSizesInput] = useState((emptyProduct.sizes || []).join(", "));
  const [imagesInput, setImagesInput] = useState<string[]>(emptyProduct.images || [emptyProduct.image]);
  const [adminCats, setAdminCats] = useState<{ id: string; slug: string; name: string; nameAr: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(siteSettings);
  const [sectionKey, setSectionKey] = useState("arrivals");
  const [pageKey, setPageKey] = useState<keyof PageSettings>("about");
  const [pageDraft, setPageDraft] = useState<PageSettings>(pageSettings);
  const [coupon, setCoupon] = useState({ code: "", discount: 10 });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  // Variant stocks: array of {size, color, stock}
  const [variantRows, setVariantRows] = useState<{ size: string; color: string; stock: number }[]>([]);
  // Shipping zones state
  const [shippingZones, setShippingZones] = useState<ShippingZone[]>((siteSettings as any).shippingZones || []);
  const [newZone, setNewZone] = useState<ShippingZone>({ nameAr: "", nameEn: "", cost: 0, provinces: [] });
  const [newZoneProvinces, setNewZoneProvinces] = useState("");

  useEffect(() => setSettings(siteSettings), [siteSettings]);
  useEffect(() => setPageDraft(pageSettings), [pageSettings]);
  useEffect(() => { setShippingZones((siteSettings as any).shippingZones || []); }, [siteSettings]);

  // تحميل الطلبات والكوبونات الكاملة من الخادم (بعد المصادقة)
  useEffect(() => {
    fetch('/api/admin/orders', { credentials: 'include' }).then(res => res.ok ? res.json() : []).then(data => { if (Array.isArray(data)) setOrders(data); }).catch(() => undefined);
    fetch('/api/admin/coupons', { credentials: 'include' }).then(res => res.ok ? res.json() : []).then(data => { if (Array.isArray(data)) setCoupons(data); }).catch(() => undefined);
    fetch('/api/products/categories').then(res => res.ok ? res.json() : []).then(data => { if (Array.isArray(data) && data.length) setAdminCats(data); }).catch(() => undefined);
  }, []);

  // Sync variant rows when editing a product (preserves existing per-variant stock)
  const syncVariantRows = (product: StoreProduct) => {
    const rows: { size: string; color: string; stock: number }[] = [];
    const sizes = product.sizes?.length ? product.sizes : ['M'];
    const colors = product.colors?.length ? product.colors : ['#222222'];
    const variants: any[] = (product as any).variants || [];
    for (const size of sizes) {
      for (const color of colors) {
        const existing = variants.find((v: any) => v.size === size && v.color === color);
        rows.push({ size, color, stock: existing ? Number(existing.stock ?? 0) : Math.floor((product.stock ?? 10) / (sizes.length * colors.length)) });
      }
    }
    setVariantRows(rows);
  };

  // Update order status via API
  const changeOrderStatus = async (orderId: string, newStatus: string) => {
    const statusMap: Record<string, string> = {
      "جديد": "new",
      "قيد التجهيز": "processing",
      "مكتمل": "completed",
      "ملغي": "cancelled",
    };
    try {
      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, fulfillmentStatus: statusMap[newStatus] || newStatus }),
      });
      // Refresh orders from server
      const res = await fetch('/api/admin/orders');
      if (res.ok) {
        // re-trigger parent store refresh would be ideal, but for now just reload
        window.location.reload();
      }
    } catch (e) {
      console.error('Status update failed:', e);
    }
  };

  // Add shipping zone
  const addShippingZone = () => {
    if (!newZone.nameAr) return;
    const zone: ShippingZone = { ...newZone, provinces: newZoneProvinces.split(',').map(p => p.trim()).filter(Boolean) };
    const updated = [...shippingZones, zone];
    setShippingZones(updated);
    setNewZone({ nameAr: '', nameEn: '', cost: 0, provinces: [] });
    setNewZoneProvinces('');
  };
  const removeShippingZone = (idx: number) => setShippingZones(prev => prev.filter((_, i) => i !== idx));
  const saveShippingZones = async () => {
    const merged = { ...settings, shippingZones };
    notify(await updateSiteSettings(merged as any));
  };

  const lowStock = catalog.filter((product) => (product.stock ?? 0) <= (product.lowStockThreshold ?? 3));
  const sales = orders.reduce((total, order) => total + order.total, 0);
  const currentSection: SectionSettings = sections[sectionKey] || { title: "", description: "", image: "" };
  const notify = (result?: AdminWriteResult) => {
    const message = result && result.kind !== "success" ? result.message : "";
    setSaved(!message);
    setSaveError(message);
    window.setTimeout(() => { setSaved(false); setSaveError(""); }, message ? 4200 : 2200);
  };
  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    navigate("/admin/login", { replace: true });
  };
  const updateField = <K extends keyof StoreProduct>(field: K, value: StoreProduct[K]) => setForm((current) => ({ ...current, [field]: value }));
  const updateColor = (index: number, value: string) => setForm((current) => ({ ...current, colors: (current.colors || []).map((color, colorIndex) => colorIndex === index ? value : color) }));
  const updateVariantRow = (index: number, value: number) => setVariantRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, stock: value } : row));
  const updateImage = (index: number, value: string) => {
    setImagesInput((current) => current.map((image, imageIndex) => imageIndex === index ? value : image));
    if (index === 0) updateField("image", value);
  };
  const setImageCount = (value: string) => {
    const count = Math.min(5, Math.max(1, Number(value) || 1));
    setImagesInput((current) => Array.from({ length: count }, (_, index) => current[index] || ""));
  };
  const addColor = () => setForm((current) => ({ ...current, colors: [...(current.colors || []), "#222222"] }));
  const removeColor = (index: number) => setForm((current) => ({ ...current, colors: (current.colors || []).filter((_, colorIndex) => colorIndex !== index) }));
  const updateDiscoverVideo = (index: number, value: string) => setSettings((current) => { const discoverVideos = [...(current.discoverVideos || [])]; while (discoverVideos.length < 4) discoverVideos.push(""); discoverVideos[index] = value; return { ...current, discoverVideos }; });
  const startNewProduct = () => { setForm(emptyProduct); setSizesInput((emptyProduct.sizes || []).join(", ")); setImagesInput(emptyProduct.images || [emptyProduct.image]); setVariantRows([]); setEditing(false); setActiveTab("products"); window.scrollTo(0, 0); };
  const editProduct = (product: StoreProduct) => { const images = product.images?.length ? [...product.images] : [product.image]; setForm({ ...product, image: images[0] || product.image, images, colors: product.colors?.length ? product.colors : ["#222222"], sizes: product.sizes || [] }); setSizesInput((product.sizes || []).join(", ")); setImagesInput(images); syncVariantRows(product); setEditing(true); setActiveTab("products"); window.scrollTo(0, 0); };
  const removeProduct = async (id: string) => {
    if (!window.confirm(isEnglish ? "Delete this product?" : "هل تريدين حذف هذا المنتج؟")) return;
    const result = await deleteProduct(id);
    notify(result);
    if (result.kind === "success" && form.id === id) { setForm(emptyProduct); setEditing(false); }
  };
  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    const originalPrice = Number(form.originalPrice || form.numericPrice);
    const enteredSalePrice = Number(form.salePrice || 0);
    const hasDiscount = enteredSalePrice > 0 && enteredSalePrice < originalPrice;
    const currentPrice = hasDiscount ? enteredSalePrice : originalPrice;
    const parsedSizes = sizesInput.split(",").map((s) => s.trim()).filter(Boolean);
    // Compute total stock from variant rows if provided
    const totalStockFromVariants = variantRows.length > 0 ? variantRows.reduce((s, r) => s + Number(r.stock || 0), 0) : Number(form.stock || 0);
    const product: StoreProduct = {
      ...form,
      id: form.id || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `product-${Date.now()}`,
      price: `${currentPrice.toLocaleString("en-US")} ج.م`,
      numericPrice: currentPrice,
      originalPrice,
      salePrice: hasDiscount ? enteredSalePrice : undefined,
      badge: form.badge?.trim() || undefined,
      stock: totalStockFromVariants,
      lowStockThreshold: Number(form.lowStockThreshold || 3),
      colors: form.colors?.length ? form.colors : ["#222222"],
      sizes: parsedSizes,
      image: imagesInput[0] || form.image,
      images: imagesInput.filter(Boolean),
      variants: variantRows.length > 0 ? variantRows : undefined,
    } as any;
    const matchedCat = adminCats.find((c) => c.name === form.category || c.slug === form.category);
    (product as any).categoryId = matchedCat?.id || (product as any).categoryId || null;
    const result = editing ? await updateProduct(product) : await addProduct(product);
    // Only reset the form once the server has actually accepted the write.
    if (result.kind === "success") {
      setForm(emptyProduct);
      setSizesInput((emptyProduct.sizes || []).join(", "));
      setImagesInput(emptyProduct.images || [emptyProduct.image]);
      setVariantRows([]);
      setEditing(false);
    }
    notify(result);
  };
  const saveSettings = async (event: React.FormEvent) => { event.preventDefault(); notify(await updateSiteSettings(settings)); };
  const saveSection = async (event: React.FormEvent) => { event.preventDefault(); notify(await updateSection(sectionKey, currentSection)); };
  const currentPage = pageDraft[pageKey] as Record<string, string>;
  const updatePageField = (field: string, value: string) => setPageDraft((current) => ({ ...current, [pageKey]: { ...(current[pageKey] as Record<string, string>), [field]: value } } as PageSettings));
  const savePage = async (event: React.FormEvent) => { event.preventDefault(); notify(await updatePageSettings(pageDraft)); };
  const updateSectionField = (field: keyof SectionSettings, value: string) => { void updateSection(sectionKey, { ...currentSection, [field]: value }); };
  const createCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = coupon.code.trim().toUpperCase();
    if (!code) return;
    const result = await addCoupon({ code, discount: Number(coupon.discount), uses: 0, active: true });
    if (result.kind === "success") setCoupon({ code: "", discount: 10 });
    notify(result);
  };
  const removeCoupon = async (code: string) => {
    if (!window.confirm(isEnglish ? "Delete this coupon?" : "هل تريدين حذف هذا الكوبون؟")) return;
    notify(await deleteCoupon(code));
  };
  const pageFields = pageKey === "about" ? ["titleAr", "titleEn", "introAr", "introEn", "beliefTitleAr", "beliefTitleEn", "bodyAr", "bodyEn", "body2Ar", "body2En", "image1", "image2"] : pageKey === "contact" ? ["titleAr", "titleEn", "contentAr", "contentEn", "recipientEmail"] : ["titleAr", "titleEn", "contentAr", "contentEn"];
  const pageLabel = (field: string) => field === "image1" ? (isEnglish ? "About image 1" : "صورة About الأولى") : field === "image2" ? (isEnglish ? "About image 2" : "صورة About الثانية") : field === "recipientEmail" ? (isEnglish ? "Recipient email" : "البريد المستلم") : field.endsWith("Ar") ? `${isEnglish ? "Arabic" : "العربية"} ${field.replace("Ar", "")}` : `${isEnglish ? "English" : "الإنجليزية"} ${field.replace("En", "")}`;
  const tabs = [
    { id: "overview", label: isEnglish ? "Overview" : "نظرة عامة", icon: LayoutDashboard },
    { id: "products", label: isEnglish ? "Products & inventory" : "المنتجات والمخزون", icon: ImagePlus },
    { id: "content", label: isEnglish ? "Content & design" : "محتوى وتصميم", icon: Settings },
    { id: "pages", label: isEnglish ? "Pages" : "الصفحات", icon: LayoutDashboard },
    { id: "coupons", label: isEnglish ? "Coupons" : "كوبونات", icon: Palette },
    { id: "reports", label: isEnglish ? "Sales & orders" : "المبيعات والطلبات", icon: BarChart3 },
  ];
  const tabGroups = [
    { title: isEnglish ? "Control center" : "مركز التحكم", items: [tabs[0], tabs[1]] },
    { title: isEnglish ? "Content" : "المحتوى", items: [tabs[2], tabs[3]] },
    { title: isEnglish ? "Marketing" : "التسويق", items: [tabs[4], tabs[5]] },
  ];
  const totalCouponUses = coupons.reduce((sum, coupon) => sum + coupon.uses, 0);
  const bestProduct = catalog.reduce<{ product: StoreProduct | null; score: number }>((best, product) => {
    const score = (product.numericPrice || 0) * Math.max(1, product.stock || 0);
    return score > best.score ? { product, score } : best;
  }, { product: null, score: 0 });
  const categoryPerformance = Object.entries(
    catalog.reduce<Record<string, number>>((result, product) => {
      const category = product.category || "غير محدد";
      result[category] = (result[category] || 0) + (product.numericPrice || 0) * Math.max(1, product.stock || 0);
      return result;
    }, {})
  ).sort(([, a], [, b]) => b - a).slice(0, 4);
  const couponPerformance = coupons.length
    ? coupons.map((coupon) => {
      const share = totalCouponUses ? coupon.uses / totalCouponUses : 0;
      const estimatedSales = Math.round((sales || 0) * share * (1 + coupon.discount / 100));
      return {
        ...coupon,
        estimatedSales,
        share,
      };
    })
    : [];
  const highestCoupon = couponPerformance.reduce<{ code: string; estimatedSales: number }>((best, coupon) => {
    if (coupon.estimatedSales > best.estimatedSales) return { code: coupon.code, estimatedSales: coupon.estimatedSales };
    return best;
  }, { code: isEnglish ? "No code" : "لا يوجد", estimatedSales: 0 });

  return (
    <section className="admin-shell min-h-[calc(100vh-110px)] px-5 py-10 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-[1320px]">
        <div className="dashboard-topbar mb-8">
          <div>
            <p className="dashboard-kicker">NO NAME CONTROL</p>
            <h1 className="dashboard-title">{isEnglish ? "Admin dashboard" : "لوحة التحكم"}</h1>
            <p className="dashboard-subtitle">{isEnglish ? "Manage content, products, and sales from one place." : "إدارة المحتوى والمنتجات والمبيعات من مكان واحد."}</p>
          </div>
          <div className="dashboard-actions">
            {(saved || saveError) && <div className={saveError ? "dashboard-toast border-l-2 border-l-[#d4775c]" : "dashboard-toast"}>{saveError || (isEnglish ? "Saved successfully" : "تم الحفظ بنجاح")}</div>}
            <button type="button" onClick={() => navigate("/")} className="dashboard-action-button">{isEnglish ? "View site" : "عرض الموقع"}</button><button type="button" onClick={logout} className="dashboard-action-button flex items-center gap-2"><LogOut size={14} />{isEnglish ? "Sign out" : "تسجيل الخروج"}</button>
          </div>
        </div>

        <div className="admin-layout"><aside className="admin-sidebar"><div className="mb-5 px-2 text-[9px] font-bold tracking-[0.2em] text-[#d8c799]">NO NAME / CONTROL</div>{tabGroups.map((group) => <div key={group.title} className="sidebar-group"><div className="sidebar-group-title">{group.title}</div>{group.items.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => setActiveTab(id)} className={`admin-tab flex shrink-0 items-center gap-3 px-4 py-3 text-[11px] ${activeTab === id ? "admin-tab-active" : ""}`}><Icon size={15} />{label}</button>)}</div>)}</aside><div className="admin-workspace min-w-0">

          {activeTab === "overview" && <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[[isEnglish ? "Total products" : "إجمالي المنتجات", catalog.length, ""], [isEnglish ? "Stock alerts" : "تنبيهات المخزون", lowStock.length, "text-[#c95f49]"], [isEnglish ? "Total orders" : "إجمالي الطلبات", orders.length, ""], [isEnglish ? "Total sales" : "إجمالي المبيعات", `${sales.toLocaleString("en-US")} ج.م`, ""]].map(([label, value, color]) => <div key={String(label)} className="dashboard-stat-card"><p className="stat-label">{label}</p><p className={`stat-value ${color}`}>{value}</p></div>)}</div>
            <div className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="admin-panel p-6">
                <div className="panel-header"><h2>{isEnglish ? "Sales overview" : "ملخص المبيعات"}</h2><span>{isEnglish ? "This month" : "هذا الشهر"}</span></div>
                <div className="sales-grid mt-5">
                  {[{ label: isEnglish ? "Gross revenue" : "إجمالي الإيرادات", value: `${sales.toLocaleString("en-US")} ج.م`, tone: "gold" }, { label: isEnglish ? "Avg. order" : "متوسط الطلب", value: `${Math.round(sales / Math.max(1, orders.length)).toLocaleString("en-US")} ج.م`, tone: "dark" }, { label: isEnglish ? "Best coupon" : "أفضل كوبون", value: highestCoupon.code, tone: "accent" }, { label: isEnglish ? "Top category" : "أفضل قسم", value: categoryPerformance[0]?.[0] || "-", tone: "soft" }].map((item) => <div key={item.label} className={`sales-metric sales-metric-${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}
                </div>
              </div>
              <div className="admin-panel p-6">
                <div className="panel-header"><h2>{isEnglish ? "Best performer" : "الأكثر ربحية"}</h2></div>
                <div className="top-product-box">
                  <div className="top-product-image" style={{ backgroundImage: `url(${bestProduct.product?.image || ""})` }} />
                  <div>
                    <p className="top-product-label">{isEnglish ? "Top product" : "المنتج الأعلى ربحاً"}</p>
                    <h3>{bestProduct.product?.name || (isEnglish ? "No product" : "لا يوجد منتج")}</h3>
                    <p>{isEnglish ? "Estimated stock value (approximate)" : "القيمة المقدرة للمخزون (تقريبية)"}: <strong>{bestProduct.product ? `${((bestProduct.product.numericPrice || 0) * Math.max(1, bestProduct.product.stock || 0)).toLocaleString("en-US")} ج.م` : "0 ج.م"}</strong></p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-8 lg:grid-cols-2"><div className="admin-panel p-6"><h2 className="mb-5 text-xl">{isEnglish ? "Stock alerts" : "تنبيهات المنتجات"}</h2>{lowStock.length ? <div className="space-y-3">{lowStock.slice(0, 8).map((product) => <div key={product.id} className="flex items-center justify-between border-b border-black/10 pb-3 text-[11px]"><span>{product.name}</span><span className="font-bold text-[#c95f49]">{isEnglish ? `${product.stock ?? 0} left` : `متبقي ${product.stock ?? 0}`}</span></div>)}</div> : <p className="text-[12px] text-black/50">{isEnglish ? "No low-stock products." : "لا توجد منتجات منخفضة المخزون."}</p>}</div><div className="admin-panel p-6"><h2 className="mb-5 text-xl">{isEnglish ? "Quick actions" : "إجراءات سريعة"}</h2><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={startNewProduct} className="quick-action flex items-center gap-3 p-4 text-right text-[11px]"><Plus size={16} />{isEnglish ? "Add product" : "إضافة منتج"}</button><button type="button" onClick={() => setActiveTab("content")} className="quick-action flex items-center gap-3 p-4 text-right text-[11px]"><Settings size={16} />{isEnglish ? "Edit site content" : "تعديل محتوى الموقع"}</button><button type="button" onClick={() => setActiveTab("coupons")} className="quick-action flex items-center gap-3 p-4 text-right text-[11px]"><Palette size={16} />{isEnglish ? "Create coupon" : "إنشاء كوبون"}</button><button type="button" onClick={() => setActiveTab("reports")} className="quick-action flex items-center gap-3 p-4 text-right text-[11px]"><BarChart3 size={16} />{isEnglish ? "View reports" : "عرض التقارير"}</button></div></div></div>
          </div>}

          {activeTab === "products" && <div className="space-y-8"><form onSubmit={submitProduct} className="bg-[#f6f3ee] p-6 shadow-sm sm:p-8"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-2xl">{editing ? (isEnglish ? "Edit product" : "تعديل المنتج") : (isEnglish ? "Add product" : "إضافة منتج")}</h2><p className="mt-2 text-[11px] text-black/50">{isEnglish ? "Add images from your device or use a direct link." : "أضيفي الصور من الجهاز أو من رابط مباشر."}</p></div><div className="flex gap-2"><button type="button" onClick={startNewProduct} className="border border-black/15 p-2" aria-label={isEnglish ? "Clear form" : "مسح النموذج"}><X size={16} /></button><ImagePlus className="text-[#d4775c]" size={23} /></div></div><div className="grid gap-4 md:grid-cols-2"><label className="block text-[11px] font-bold">{isEnglish ? "Product name (English)" : "اسم المنتج (إنجليزي)"}<input value={form.name || ""} onChange={(event) => updateField("name", event.target.value)} className={inputClass} placeholder={isEnglish ? "Optional" : "اختياري"} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Product name (Arabic)" : "اسم المنتج (عربي)"}<input required value={form.nameAr || ""} onChange={(event) => updateField("nameAr", event.target.value)} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Original price" : "السعر الأساسي قبل الخصم"}<input required type="number" min="0" value={form.originalPrice || form.numericPrice || ""} onChange={(event) => updateField("originalPrice", Number(event.target.value))} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Sale price" : "السعر الجديد بعد الخصم"}<input type="number" min="0" value={form.salePrice ?? ""} onChange={(event) => updateField("salePrice", event.target.value ? Number(event.target.value) : undefined)} className={inputClass} placeholder={isEnglish ? "Optional" : "اختياري"} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Category" : "القسم"}<select value={form.category} onChange={(event) => updateField("category", event.target.value as StoreProduct["category"])} className={inputClass}>{categories.map((category) => <option key={category} value={category}>{isEnglish ? categoryLabels[category] : category}</option>)}</select></label><label className="block text-[11px] font-bold">{isEnglish ? "Stock" : "الكمية"}<input type="number" min="0" value={form.stock ?? 0} onChange={(event) => updateField("stock", Number(event.target.value))} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Low-stock threshold" : "حد التنبيه"}<input type="number" min="0" value={form.lowStockThreshold ?? 0} onChange={(event) => updateField("lowStockThreshold", Number(event.target.value))} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Product badge" : "شارة المنتج"}<input value={form.badge ?? form.tag ?? ""} onChange={(event) => updateField("badge", event.target.value)} className={inputClass} placeholder={isEnglish ? "NEW or -40%" : "مثال: NEW أو -40%"} /></label><div className="block text-[11px] font-bold"><div className="flex items-center justify-between"><span>{isEnglish ? "Available colors" : "الألوان المتاحة"}</span><button type="button" onClick={addColor} className="text-[#d4775c]">+ {isEnglish ? "Add color" : "إضافة لون"}</button></div><div className="mt-2 space-y-2">{(form.colors || []).map((color, colorIndex) => <div key={`${color}-${colorIndex}`} className="flex items-center gap-2"><input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#222222"} onChange={(event) => updateColor(colorIndex, event.target.value)} className="h-10 w-12 cursor-pointer border-0 bg-transparent p-0" /><input value={color} onChange={(event) => updateColor(colorIndex, event.target.value)} className={`${inputClass} mt-0`} placeholder="#222222" /><button type="button" onClick={() => removeColor(colorIndex)} className="p-2 text-[#c95f49]" aria-label={isEnglish ? "Remove color" : "حذف اللون"}><Trash2 size={14} /></button></div>)}</div></div><label className="block text-[11px] font-bold">{isEnglish ? "Sizes" : "المقاسات"}<input type="text" value={sizesInput} onChange={(event) => setSizesInput(event.target.value)} className={inputClass} placeholder="S, M, L, XL, XXL" /></label>{variantRows.length > 0 && <div className="md:col-span-2"><div className="flex items-center justify-between"><span className="text-[11px] font-bold">{isEnglish ? "Per-variant stock" : "مخزون كل مقاس/لون"}</span><span className="text-[10px] text-black/50">{isEnglish ? "Adjust stock for each size/color combination" : "عدلي الكمية لكل مقاس ولون على حدة"}</span></div><div className="mt-2 overflow-x-auto bg-white p-3"><table className="w-full text-[11px]"><thead><tr className="border-b text-black/45"><th className="pb-2 text-left">{isEnglish ? "Size" : "المقاس"}</th><th className="pb-2 text-left">{isEnglish ? "Color" : "اللون"}</th><th className="pb-2 text-left">{isEnglish ? "Stock" : "الكمية"}</th></tr></thead><tbody>{variantRows.map((row, rowIndex) => <tr key={`${row.size}-${row.color}-${rowIndex}`} className="border-b border-black/5"><td className="py-2">{row.size}</td><td className="py-2"><span className="mr-2 inline-block h-4 w-4 align-middle" style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(row.color) ? row.color : "#222222" }} /><span className="font-mono text-[10px]">{row.color}</span></td><td className="py-2"><input type="number" min="0" value={row.stock ?? 0} onChange={(event) => updateVariantRow(rowIndex, Number(event.target.value))} className={`${inputClass} mt-0 w-24`} /></td></tr>)}</tbody></table></div></div>}<label className="block text-[11px] font-bold">{isEnglish ? "Arabic description" : "الوصف"}<textarea value={form.descriptionAr || ""} onChange={(event) => updateField("descriptionAr", event.target.value)} className={`${inputClass} min-h-24`} /></label><label className="block text-[11px] font-bold">{isEnglish ? "English description" : "الوصف بالإنجليزية"}<textarea value={form.description || ""} onChange={(event) => updateField("description", event.target.value)} className={`${inputClass} min-h-24`} /></label><div className="md:col-span-2 space-y-4"><label className="block text-[11px] font-bold">{isEnglish ? "Number of product images" : "عدد صور المنتج"}<select value={imagesInput.length} onChange={(event) => setImageCount(event.target.value)} className={inputClass}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label><div className="grid gap-4 md:grid-cols-2">{imagesInput.map((image, index) => <AssetField key={index} isEnglish={isEnglish} label={isEnglish ? `Product image ${index + 1}` : `صورة المنتج ${index + 1}`} value={image} accept="image/*" onChange={(value) => updateImage(index, value)} />)}</div></div><div className="md:col-span-2"><AssetField isEnglish={isEnglish} label={isEnglish ? "Product video" : "فيديو المنتج"} value={form.video || ""} accept="video/*" onChange={(value) => updateField("video", value)} /></div></div><button className="mt-6 flex w-full items-center justify-center gap-2 bg-[#1c2822] py-3 text-[11px] font-bold text-white"><Save size={15} />{editing ? (isEnglish ? "Update product" : "حفظ تعديل المنتج") : (isEnglish ? "Save product" : "حفظ المنتج")}</button></form><div className="bg-[#f6f3ee] p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl">{isEnglish ? "Catalog" : "المنتجات الحالية"}</h2><span className="text-[11px] text-black/50">{catalog.length} {isEnglish ? "products" : "منتج"}</span></div><div className="grid gap-3">{catalog.map((product) => <div key={product.id} className="flex items-center gap-4 border-b border-black/10 pb-3"><img src={product.image} alt="" className="h-16 w-14 object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold">{product.name}</p><p className="mt-1 text-[10px] text-black/50">{product.price} · {isEnglish ? `${product.stock ?? 0} in stock` : `المخزون ${product.stock ?? 0}`}</p></div><button type="button" onClick={() => editProduct(product)} className="border border-black/15 px-3 py-2 text-[10px]">{isEnglish ? "Edit" : "تعديل"}</button><button type="button" onClick={() => removeProduct(product.id)} className="p-2 text-[#c95f49]" aria-label={isEnglish ? "Delete product" : "حذف المنتج"}><Trash2 size={16} /></button></div>)}</div></div></div>}

          {activeTab === "content" && <div className="grid gap-8 lg:grid-cols-2"><form onSubmit={saveSettings} className="space-y-4 bg-[#f6f3ee] p-6"><h2 className="mb-4 text-2xl">{isEnglish ? "Site settings" : "إعدادات الموقع"}</h2><label className="block text-[11px] font-bold">{isEnglish ? "Announcement" : "الإعلان العلوي"}<textarea value={settings.announcement} onChange={(event) => setSettings({ ...settings, announcement: event.target.value })} className={`${inputClass} min-h-24`} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Hero title" : "عنوان الهيرو"}<input value={settings.heroTitle || ""} onChange={(event) => setSettings({ ...settings, heroTitle: event.target.value })} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Hero description" : "وصف الهيرو"}<textarea value={settings.heroDescription || ""} onChange={(event) => setSettings({ ...settings, heroDescription: event.target.value })} className={`${inputClass} min-h-24`} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Accent color" : "اللون الأساسي"}<input type="color" value={settings.accent} onChange={(event) => setSettings({ ...settings, accent: event.target.value })} className="mt-2 h-12 w-full cursor-pointer" /></label><label className="block text-[11px] font-bold">{isEnglish ? "E-wallet transfer number" : "رقم تحويل المحفظة الإلكترونية"}<input type="text" value={settings.walletNumber || ""} onChange={(event) => setSettings({ ...settings, walletNumber: event.target.value })} className={inputClass} placeholder="01xxxxxxxxx" /></label><label className="block text-[11px] font-bold">{isEnglish ? "InstaPay transfer number" : "رقم تحويل InstaPay"}<input type="text" value={settings.instapayNumber || ""} onChange={(event) => setSettings({ ...settings, instapayNumber: event.target.value })} className={inputClass} placeholder="InstaPay address or number" /></label><label className="block text-[11px] font-bold">{isEnglish ? "Shipping cost (EGP)" : "تكلفة الشحن (ج.م)"}<input type="number" min="0" value={settings.shippingCost ?? 80} onChange={(event) => setSettings({ ...settings, shippingCost: Number(event.target.value) })} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Free shipping above (EGP)" : "شحن مجاني للطلبات فوق (ج.م)"}<input type="number" min="0" value={settings.freeShippingThreshold ?? 2500} onChange={(event) => setSettings({ ...settings, freeShippingThreshold: Number(event.target.value) })} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Sales WhatsApp number" : "رقم واتساب المبيعات"}<input type="text" inputMode="numeric" value={settings.salesWhatsappNumber || ""} onChange={(event) => setSettings({ ...settings, salesWhatsappNumber: event.target.value.replace(/\D/g, "") })} className={inputClass} placeholder="201xxxxxxxxx" /></label><label className="block text-[11px] font-bold">{isEnglish ? "Sales WhatsApp URL" : "رابط واتساب المبيعات"}<input type="url" value={settings.salesWhatsappUrl || ""} onChange={(event) => setSettings({ ...settings, salesWhatsappUrl: event.target.value })} className={inputClass} placeholder="https://wa.me/201xxxxxxxxx" /></label><div className="space-y-3 border-t border-black/10 pt-4"><h3 className="text-[12px] font-bold">{isEnglish ? "Social account links" : "روابط حسابات التواصل"}</h3>{(["instagram", "facebook", "youtube", "whatsapp", "tiktok"] as const).map((social) => <label key={social} className="block text-[11px] font-bold">{social}<input type="url" value={settings.socialLinks?.[social] || ""} onChange={(event) => setSettings({ ...settings, socialLinks: { ...settings.socialLinks, [social]: event.target.value } })} className={inputClass} placeholder="https://" /></label>)}</div><div className="space-y-4 border-t border-black/10 pt-4"><div><h3 className="text-[12px] font-bold">{isEnglish ? "Discover your style videos" : "فيديوهات اكتشفي أسلوبك"}</h3><p className="mt-1 text-[10px] text-black/50">{isEnglish ? "Each video controls one card in the Discover section." : "كل فيديو يتحكم في بطاقة مستقلة داخل قسم اكتشفي أسلوبك."}</p></div>{[0, 1, 2, 3].map((videoIndex) => <AssetField key={videoIndex} isEnglish={isEnglish} label={`${isEnglish ? "Video" : "الفيديو"} ${videoIndex + 1}`} value={settings.discoverVideos?.[videoIndex] || ""} accept="video/*" onChange={(value) => updateDiscoverVideo(videoIndex, value)} />)}</div><button className="flex w-full items-center justify-center gap-2 bg-[#1c2822] py-3 text-[11px] font-bold text-white"><Save size={15} />{isEnglish ? "Save site settings" : "حفظ إعدادات الموقع"}</button></form><form onSubmit={saveSection} className="space-y-4 bg-[#f6f3ee] p-6"><h2 className="mb-4 text-2xl">{isEnglish ? "Section content" : "محتوى الأقسام"}</h2><select value={sectionKey} onChange={(event) => setSectionKey(event.target.value)} className={`${inputClass} mt-0`}>{sectionOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="block text-[11px] font-bold">{isEnglish ? "Section title" : "عنوان القسم"}<input value={currentSection.title} onChange={(event) => updateSectionField("title", event.target.value)} className={inputClass} /></label><label className="block text-[11px] font-bold">{isEnglish ? "Section description" : "وصف القسم"}<textarea value={currentSection.description} onChange={(event) => updateSectionField("description", event.target.value)} className={`${inputClass} min-h-28`} /></label><AssetField isEnglish={isEnglish} label={isEnglish ? "Section image" : "صورة القسم"} value={currentSection.image} accept="image/*" onChange={(value) => updateSectionField("image", value)} /><AssetField isEnglish={isEnglish} label={isEnglish ? "Section video" : "فيديو القسم"} value={currentSection.video || ""} accept="video/*" onChange={(value) => updateSectionField("video", value)} /><button className="flex w-full items-center justify-center gap-2 bg-[#1c2822] py-3 text-[11px] font-bold text-white"><Save size={15} />{isEnglish ? "Save section" : "حفظ القسم"}</button></form></div>}

          {activeTab === "pages" && <form onSubmit={savePage} className="space-y-6 bg-[#f6f3ee] p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl">{isEnglish ? "Informational pages" : "صفحات الموقع"}</h2><p className="mt-2 text-[11px] text-black/50">{isEnglish ? "Edit About, shipping, and contact content." : "عدّلي محتوى About والشحن والتواصل."}</p></div><select value={pageKey} onChange={(event) => setPageKey(event.target.value as keyof PageSettings)} className={`${inputClass} mt-0 max-w-xs`}><option value="about">{isEnglish ? "About no name" : "عن no name"}</option><option value="shipping">{isEnglish ? "Shipping & returns" : "الشحن والاستبدال"}</option><option value="contact">{isEnglish ? "Contact us" : "تواصلي معنا"}</option></select></div><div className="grid gap-4 md:grid-cols-2">{pageFields.map((field) => field === "image1" || field === "image2" ? <AssetField key={field} label={pageLabel(field)} value={currentPage[field] || ""} accept="image/*" onChange={(value) => updatePageField(field, value)} isEnglish={isEnglish} /> : <label key={field} className="block text-[11px] font-bold">{pageLabel(field)}{field.includes("body") || field.includes("intro") || field.includes("content") ? <textarea value={currentPage[field] || ""} onChange={(event) => updatePageField(field, event.target.value)} className={`${inputClass} min-h-28`} /> : <input type={field === "recipientEmail" ? "email" : "text"} value={currentPage[field] || ""} onChange={(event) => updatePageField(field, event.target.value)} className={inputClass} placeholder={field === "recipientEmail" ? "name@example.com" : undefined} />}</label>)}</div><button className="flex items-center gap-2 bg-[#1c2822] px-6 py-3 text-[11px] font-bold text-white"><Save size={15} />{isEnglish ? "Save page" : "حفظ الصفحة"}</button></form>}

          {activeTab === "coupons" && <div className="grid gap-8 xl:grid-cols-[.7fr_1.3fr]"><form onSubmit={createCoupon} className="admin-panel p-6"><h2 className="mb-5 text-2xl">{isEnglish ? "Create coupon" : "إنشاء كود خصم"}</h2><label className="block text-[11px] font-bold">{isEnglish ? "Code" : "الكود"}<input required value={coupon.code} onChange={(event) => setCoupon({ ...coupon, code: event.target.value })} className={inputClass} placeholder="WELCOME10" /></label><label className="mt-4 block text-[11px] font-bold">{isEnglish ? "Discount percentage" : "نسبة الخصم"}<input required type="number" min="1" max="100" value={coupon.discount} onChange={(event) => setCoupon({ ...coupon, discount: Number(event.target.value) })} className={inputClass} /></label><button className="mt-5 flex w-full items-center justify-center gap-2 bg-[#1c2822] py-3 text-[11px] font-bold text-white"><Plus size={15} />{isEnglish ? "Create coupon" : "إنشاء الكود"}</button></form><div className="space-y-4">{coupons.length ? coupons.map((item) => { const couponSale = Math.round((sales * (item.uses / Math.max(1, totalCouponUses || 1))) * (1 + item.discount / 120)); return <div key={item.code} className="admin-panel p-4"><div className="flex items-center justify-between gap-3"><div><div className="coupon-code">{item.code}</div><div className="coupon-meta">{item.discount}% · {item.uses} {isEnglish ? "uses" : "استخدامات"}</div></div><button type="button" onClick={() => removeCoupon(item.code)} className="text-[#c95f49]" aria-label={isEnglish ? "Delete coupon" : "حذف الكوبون"}><Trash2 size={15} /></button></div><div className="mt-4 coupon-report-strip"><span>{isEnglish ? "Estimated sales (approximate)" : "المبيعات المقدرة (تقريبية)"}</span><strong>{couponSale.toLocaleString("en-US")} ج.م</strong></div></div>; }) : <div className="admin-panel p-8 text-center text-[12px] text-black/50">{isEnglish ? "No coupons yet." : "لا توجد أكواد خصم حتى الآن."}</div>}</div></div>}

          {activeTab === "reports" && <div className="space-y-8"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="dashboard-stat-card"><p className="stat-label">{isEnglish ? "Gross sales" : "إجمالي المبيعات"}</p><p className="stat-value">{sales.toLocaleString("en-US")} ج.م</p></div><div className="dashboard-stat-card"><p className="stat-label">{isEnglish ? "Orders" : "الطلبات"}</p><p className="stat-value">{orders.length}</p></div><div className="dashboard-stat-card"><p className="stat-label">{isEnglish ? "Average order" : "متوسط الطلب"}</p><p className="stat-value">{orders.length ? `${Math.round(sales / orders.length).toLocaleString("en-US")} ج.م` : "0 ج.م"}</p></div><div className="dashboard-stat-card"><p className="stat-label">{isEnglish ? "Top category" : "أفضل قسم"}</p><p className="stat-value">{categoryPerformance[0]?.[0] || (isEnglish ? "N/A" : "غير متوفر")}</p></div></div><div className="overflow-x-auto admin-panel p-6"><div className="panel-header"><h2>{isEnglish ? "Orders" : "الطلبات"}</h2><span>{isEnglish ? "Click View to see full details" : "اضغط عرض لرؤية التفاصيل الكاملة"}</span></div>{orders.length ? <table className="w-full min-w-[900px] text-right text-[11px] mt-5"><thead><tr className="border-b border-black/10 text-black/45"><th className="pb-3">{isEnglish ? "Order" : "رقم الطلب"}</th><th className="pb-3">{isEnglish ? "Date" : "التاريخ"}</th><th className="pb-3">{isEnglish ? "Customer" : "العميل"}</th><th className="pb-3">{isEnglish ? "Total" : "الإجمالي"}</th><th className="pb-3">{isEnglish ? "Payment" : "الدفع"}</th><th className="pb-3">{isEnglish ? "Status" : "الحالة"}</th><th className="pb-3">{isEnglish ? "Actions" : "إجراءات"}</th></tr></thead><tbody>{orders.map((order: any) => <tr key={order.id} className="border-b border-black/5"><td className="py-3 font-mono text-[10px]">{order.id}</td><td>{new Date(order.date || order.createdAt).toLocaleDateString("ar-EG")}</td><td>{order.customerName || "-"}</td><td className="font-bold">{order.total?.toLocaleString("en-US")} ج.م</td><td>{order.paymentMethod === "wallet" ? "محفظة" : order.paymentMethod === "instapay" ? "InstaPay" : "كاش"}</td><td><select value={order.status || order.fulfillmentStatus || "جديد"} onChange={(e) => changeOrderStatus(order.dbId || order.id, e.target.value)} className="border border-black/20 bg-white px-2 py-1 text-[10px] rounded" onClick={e => e.stopPropagation()}><option value="جديد">جديد</option><option value="قيد التجهيز">قيد التجهيز</option><option value="مكتمل">مكتمل</option><option value="ملغي">ملغي</option></select></td><td><button type="button" onClick={() => setSelectedOrder(order)} className="flex items-center gap-1 border border-black/20 px-3 py-1 text-[10px] hover:bg-black hover:text-white transition"><Eye size={12} /> {isEnglish ? "View" : "عرض"}</button></td></tr>)}</tbody></table> : <p className="text-[12px] text-black/50 mt-4">{isEnglish ? "Orders will appear here after checkout." : "ستظهر الطلبات هنا بعد إتمام عمليات البيع."}</p>}</div></div>}

          {/* Order Details Modal */}
          {selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrder(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-white p-6" onClick={e => e.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">تفاصيل الطلب: {selectedOrder.id}</h2><button onClick={() => setSelectedOrder(null)} className="p-2"><X size={18} /></button></div><div className="space-y-3 text-[12px]"><div className="grid grid-cols-2 gap-3"><div><p className="text-black/45">العميل</p><p className="font-bold">{selectedOrder.customerName}</p></div><div><p className="text-black/45">الهاتف</p><p className="font-bold">{selectedOrder.phone}</p></div><div className="col-span-2"><p className="text-black/45">العنوان</p><p className="font-bold">{selectedOrder.address}</p></div>{selectedOrder.notes && <div className="col-span-2"><p className="text-black/45">ملاحظات</p><p>{selectedOrder.notes}</p></div>}<div><p className="text-black/45">طريقة الدفع</p><p>{selectedOrder.paymentMethod === "wallet" ? "محفظة" : selectedOrder.paymentMethod === "instapay" ? "InstaPay" : "كاش عند الاستلام"}</p></div><div><p className="text-black/45">حالة الطلب</p><p className="font-bold">{selectedOrder.status || selectedOrder.fulfillmentStatus}</p></div>{selectedOrder.transferNumber && <div><p className="text-black/45">رقم التحويل</p><p className="font-mono">{selectedOrder.transferNumber}</p></div>}{selectedOrder.hasReceipt && <div><p className="text-black/45">الإيصال</p><ReceiptLink orderId={selectedOrder.id} /></div>}</div><div className="mt-4 border-t pt-4"><h3 className="mb-3 font-bold">المنتجات المطلوبة</h3><table className="w-full text-[11px]"><thead><tr className="border-b text-black/45"><th className="pb-2 text-right">المنتج</th><th className="pb-2 text-right">المقاس</th><th className="pb-2 text-right">اللون</th><th className="pb-2 text-right">الكمية</th><th className="pb-2 text-right">الإجمالي</th></tr></thead><tbody>{(selectedOrder.orderItems || []).map((item: any, i: number) => <tr key={i} className="border-b border-black/5"><td className="py-2">{item.name || item.productName}</td><td>{item.size || "-"}</td><td>{item.color || "-"}</td><td>{item.quantity}</td><td>{(item.total || item.lineTotal || 0).toLocaleString("en-US")} ج.م</td></tr>)}</tbody></table></div><div className="mt-4 border-t pt-3 space-y-1 text-[11px]"><div className="flex justify-between"><span className="text-black/50">المجموع الجزئي</span><span>{selectedOrder.subtotal?.toLocaleString("en-US")} ج.م</span></div>{selectedOrder.discountAmount > 0 && <div className="flex justify-between text-green-700"><span>الخصم</span><span>-{selectedOrder.discountAmount?.toLocaleString("en-US")} ج.م</span></div>}<div className="flex justify-between"><span className="text-black/50">الشحن</span><span>{selectedOrder.shippingAmount > 0 ? `${selectedOrder.shippingAmount?.toLocaleString("en-US")} ج.م` : "مجاني"}</span></div><div className="flex justify-between text-[13px] font-bold border-t pt-2"><span>الإجمالي</span><span>{selectedOrder.total?.toLocaleString("en-US")} ج.م</span></div></div><div className="mt-5"><p className="mb-2 text-[11px] font-bold">تغيير حالة الطلب</p><div className="flex gap-2 flex-wrap">{["جديد","قيد التجهيز","مكتمل","ملغي"].map(s => <button key={s} onClick={() => { changeOrderStatus(selectedOrder.dbId || selectedOrder.id, s); setSelectedOrder(null); }} className={`border px-4 py-2 text-[11px] transition ${s === "ملغي" ? "border-red-300 text-red-700 hover:bg-red-700 hover:text-white" : "border-black/20 hover:bg-black hover:text-white"}`}>{s}</button>)}</div></div></div></div></div>}
        </div></div>
      </div>
    </section>
  );
}
