import { useEffect, useState } from "react";
import { BarChart3, ImagePlus, LayoutDashboard, LogOut, Palette, Plus, Save, Settings, Trash2, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore, type PageSettings, type SectionSettings, type SiteSettings, type StoreProduct } from "@/components/store/StoreLayout";

const categories = ["Sets", "Blouses / shirts", "Skirts / pants", "Denims", "Dresses"];
const categoryLabels: Record<string, string> = { Sets: "Sets", "Blouses / shirts": "Blouses / shirts", "Skirts / pants": "Skirts / pants", Denims: "Denims", Dresses: "Dresses" };

const emptyProduct: StoreProduct = {
  id: "",
  name: "",
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

const readFile = (file: File, callback: (value: string) => void) => {
  const reader = new FileReader();
  reader.onload = () => callback(String(reader.result));
  reader.readAsDataURL(file);
};

function AssetField({ label, value, accept, onChange, isEnglish }: { label: string; value: string; accept: string; onChange: (value: string) => void; isEnglish: boolean }) {
  return (
    <label className="block text-[11px] font-bold">
      {label}
      <div className="mt-2 flex gap-2">
        <input 
          value={value.startsWith("data:") ? "ملف محلي مرفوع" : value} 
          onChange={(event) => onChange(event.target.value)} 
          className={`${inputClass} mt-0`} 
          placeholder={isEnglish ? "Or paste a direct file URL" : "أو الصقي رابط الملف"} 
        />
        <label className="flex shrink-0 cursor-pointer items-center justify-center border border-[#1c2822]/15 px-3 text-[10px] font-normal">
          <Upload size={14} />
          <input 
            type="file" 
            accept={accept} 
            className="hidden" 
            onChange={(event) => { 
              const file = event.target.files?.[0]; 
              if (file) readFile(file, onChange); 
            }} 
          />
        </label>
      </div>
    </label>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { catalog, siteSettings, sections, pageSettings, coupons, orders, addProduct, updateProduct, deleteProduct, updateSiteSettings, updateSection, updatePageSettings, addCoupon, deleteCoupon } = useStore();
  
  const isEnglish = true;
  const [activeTab, setActiveTab] = useState("overview");
  const [form, setForm] = useState<StoreProduct>(emptyProduct);
  const [sizesInput, setSizesInput] = useState((emptyProduct.sizes || []).join(", "));
  const [imagesInput, setImagesInput] = useState<string[]>(emptyProduct.images || [emptyProduct.image]);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(siteSettings);
  const [sectionKey, setSectionKey] = useState("arrivals");
  const [pageKey, setPageKey] = useState<keyof PageSettings>("about");
  const [pageDraft, setPageDraft] = useState<PageSettings>(pageSettings);
  const [coupon, setCoupon] = useState({ code: "", discount: 10 });
  const [saved, setSaved] = useState(false);

  // التوافق مع مرونة نوع orders سواء كان الرقم أو القائمة
  const orderCount = typeof orders === "number" ? orders : Array.isArray(orders) ? (orders as any[]).length : 0;
  const orderList = Array.isArray(orders) ? (orders as any[]) : [];

  useEffect(() => setSettings(siteSettings), [siteSettings]);
  useEffect(() => setPageDraft(pageSettings), [pageSettings]);

  const lowStock = catalog.filter((product) => (product.stock ?? 0) <= (product.lowStockThreshold ?? 3));
  const sales = orderList.reduce((total, order) => total + (order.total || 0), 0);
  const currentSection: SectionSettings = sections[sectionKey] || { title: "", description: "", image: "" };
  
  const notify = () => { setSaved(true); window.setTimeout(() => setSaved(false), 2200); };
  
  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    navigate("/admin/login", { replace: true });
  };

  const updateField = <K extends keyof StoreProduct>(field: K, value: StoreProduct[K]) => setForm((current) => ({ ...current, [field]: value }));
  const updateColor = (index: number, value: string) => setForm((current) => ({ ...current, colors: (current.colors || []).map((color, colorIndex) => colorIndex === index ? value : color) }));
  
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
  
  const updateDiscoverVideo = (index: number, value: string) => setSettings((current) => { 
    const discoverVideos = [...(current.discoverVideos || [])]; 
    while (discoverVideos.length < 4) discoverVideos.push(""); 
    discoverVideos[index] = value; 
    return { ...current, discoverVideos }; 
  });

  const startNewProduct = () => { setForm(emptyProduct); setSizesInput((emptyProduct.sizes || []).join(", ")); setImagesInput(emptyProduct.images || [emptyProduct.image]); setEditing(false); setActiveTab("products"); window.scrollTo(0, 0); };
  
  const editProduct = (product: StoreProduct) => { 
    const images = product.images?.length ? [...product.images] : [product.image]; 
    setForm({ ...product, image: images[0] || product.image, images, colors: product.colors?.length ? product.colors : ["#222222"], sizes: product.sizes || [] }); 
    setSizesInput((product.sizes || []).join(", ")); 
    setImagesInput(images); 
    setEditing(true); 
    setActiveTab("products"); 
    window.scrollTo(0, 0); 
  };

  const removeProduct = (id: string) => { 
    if (window.confirm(isEnglish ? "Delete this product?" : "هل تريدين حذف هذا المنتج؟")) { 
      deleteProduct(id); 
      if (form.id === id) { setForm(emptyProduct); setEditing(false); } 
      notify(); 
    } 
  };

  const submitProduct = (event: React.FormEvent) => {
    event.preventDefault();
    const originalPrice = Number(form.originalPrice || form.numericPrice);
    const enteredSalePrice = Number(form.salePrice || 0);
    const hasDiscount = enteredSalePrice > 0 && enteredSalePrice < originalPrice;
    const currentPrice = hasDiscount ? enteredSalePrice : originalPrice;
    
    const product: StoreProduct = {
      ...form,
      id: form.id || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `product-${Date.now()}`,
      price: `${currentPrice.toLocaleString("en-US")} ج.م`,
      numericPrice: currentPrice,
      originalPrice,
      salePrice: hasDiscount ? enteredSalePrice : undefined,
      badge: form.badge?.trim() || undefined,
      stock: Number(form.stock || 0),
      lowStockThreshold: Number(form.lowStockThreshold || 3),
      colors: form.colors?.length ? form.colors : ["#222222"],
      sizes: sizesInput.split(",").map((size) => size.trim()).filter(Boolean),
      image: imagesInput[0] || form.image,
      images: imagesInput.filter(Boolean),
    };
    
    if (editing) updateProduct(product); else addProduct(product);
    setForm(emptyProduct);
    setSizesInput((emptyProduct.sizes || []).join(", "));
    setImagesInput(emptyProduct.images || [emptyProduct.image]);
    setEditing(false);
    notify();
  };

  const saveSettings = (event: React.FormEvent) => { event.preventDefault(); updateSiteSettings(settings); notify(); };
  const saveSection = (event: React.FormEvent) => { event.preventDefault(); updateSection(sectionKey, currentSection); notify(); };
  
  const currentPage = pageDraft[pageKey] as Record<string, string>;
  const updatePageField = (field: string, value: string) => setPageDraft((current) => ({ ...current, [pageKey]: { ...(current[pageKey] as Record<string, string>), [field]: value } } as PageSettings));
  const savePage = (event: React.FormEvent) => { event.preventDefault(); updatePageSettings(pageDraft); notify(); };
  const updateSectionField = (field: keyof SectionSettings, value: string) => updateSection(sectionKey, { ...currentSection, [field]: value });
  
  const createCoupon = (event: React.FormEvent) => { 
    event.preventDefault(); 
    const code = coupon.code.trim().toUpperCase(); 
    if (!code) return; 
    addCoupon({ code, discount: Number(coupon.discount), uses: 0, active: true }); 
    setCoupon({ code: "", discount: 10 }); 
    notify(); 
  };

  const removeCoupon = (code: string) => { 
    if (window.confirm(isEnglish ? "Delete this coupon?" : "هل تريدين حذف هذا الكوبون؟")) { 
      deleteCoupon(code); 
      notify(); 
    } 
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
            {saved && <div className="dashboard-toast">{isEnglish ? "Saved successfully" : "تم الحفظ بنجاح"}</div>}
            <button type="button" onClick={() => navigate("/")} className="dashboard-action-button">{isEnglish ? "View site" : "عرض الموقع"}</button>
            <button type="button" onClick={logout} className="dashboard-action-button flex items-center gap-2"><LogOut size={14} />{isEnglish ? "Sign out" : "تسجيل الخروج"}</button>
          </div>
        </div>

        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="mb-5 px-2 text-[9px] font-bold tracking-[0.2em] text-[#d8c799]">NO NAME / CONTROL</div>
            {tabGroups.map((group) => (
              <div key={group.title} className="sidebar-group">
                <div className="sidebar-group-title">{group.title}</div>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button type="button" key={id} onClick={() => setActiveTab(id)} className={`admin-tab flex shrink-0 items-center gap-3 px-4 py-3 text-[11px] ${activeTab === id ? "admin-tab-active" : ""}`}>
                    <Icon size={15} />{label}
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <div className="admin-workspace min-w-0">
            {activeTab === "overview" && (
              <div className="space-y-8">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[[isEnglish ? "Total products" : "إجمالي المنتجات", catalog.length, ""], [isEnglish ? "Stock alerts" : "تنبيهات المخزون", lowStock.length, "text-[#c95f49]"], [isEnglish ? "Total orders" : "إجمالي الطلبات", orderCount, ""], [isEnglish ? "Total sales" : "إجمالي المبيعات", `${sales.toLocaleString("en-US")} ج.م`, ""]].map(([label, value, color]) => (
                    <div key={String(label)} className="dashboard-stat-card">
                      <p className="stat-label">{label}</p>
                      <p className={`stat-value ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "pages" && (
              <form onSubmit={savePage} className="space-y-6 bg-[#f6f3ee] p-6 sm:p-8">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="text-2xl">{isEnglish ? "Informational pages" : "صفحات الموقع"}</h2>
                    <p className="mt-2 text-[11px] text-black/50">{isEnglish ? "Edit About, shipping, and contact content." : "عدّلي محتوى About والشحن والتواصل."}</p>
                  </div>
                  <select value={pageKey} onChange={(event) => setPageKey(event.target.value as keyof PageSettings)} className={`${inputClass} mt-0 max-w-xs`}>
                    <option value="about">{isEnglish ? "About no name" : "عن no name"}</option>
                    <option value="shipping">{isEnglish ? "Shipping & returns" : "الشحن والاستبدال"}</option>
                    <option value="contact">{isEnglish ? "Contact us" : "تواصلي معنا"}</option>
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {pageFields.map((field) => (
                    field === "image1" || field === "image2" ? (
                      <AssetField key={field} label={pageLabel(field)} value={currentPage[field] || ""} accept="image/*" onChange={(value) => updatePageField(field, value)} isEnglish={isEnglish} />
                    ) : (
                      <label key={field} className="block text-[11px] font-bold">
                        {pageLabel(field)}
                        {field.includes("body") || field.includes("intro") || field.includes("content") ? (
                          <textarea value={currentPage[field] || ""} onChange={(event) => updatePageField(field, event.target.value)} className={`${inputClass} min-h-28`} />
                        ) : (
                          <input type={field === "recipientEmail" ? "email" : "text"} value={currentPage[field] || ""} onChange={(event) => updatePageField(field, event.target.value)} className={inputClass} />
                        )}
                      </label>
                    )
                  ))}
                </div>
                <button className="flex w-full items-center justify-center gap-2 bg-[#1c2822] py-3 text-[11px] font-bold text-white">
                  <Save size={15} />{isEnglish ? "Save page" : "حفظ الصفحة"}
                </button>
              </form>
            )}

            {activeTab === "reports" && (
              <div className="space-y-8">
                <div className="bg-[#f6f3ee] p-6 sm:p-8">
                  <h2 className="mb-4 text-2xl">{isEnglish ? "Sales & orders report" : "تقارير المبيعات والطلبات"}</h2>
                  <div className="grid gap-4 sm:grid-cols-3 mb-6">
                    <div className="dashboard-stat-card">
                      <p className="stat-label">{isEnglish ? "Total sales" : "إجمالي المبيعات"}</p>
                      <p className="stat-value">{sales.toLocaleString("en-US")} ج.م</p>
                    </div>
                    <div className="dashboard-stat-card">
                      <p className="stat-label">{isEnglish ? "Total orders" : "إجمالي الطلبات"}</p>
                      <p className="stat-value">{orderCount}</p>
                    </div>
                    <div className="dashboard-stat-card">
                      <p className="stat-label">{isEnglish ? "Average order value" : "متوسط قيمة الطلب"}</p>
                      <p className="stat-value">{Math.round(sales / Math.max(1, orderCount)).toLocaleString("en-US")} ج.م</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}