import { useEffect, useState } from "react";
import { Check, Heart, MessageCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCategoryName, getProductName, getProductPrice, getSalesWhatsAppUrl, ProductCard, useStore } from "@/components/store/StoreLayout";
import { absoluteUrl, applySeo, buildBreadcrumbJsonLd, buildProductJsonLd, productSeo } from "@/lib/seo";

const sizes = ["S", "M", "L", "XL", "XXL"];

function VariantSummary({ product }: { product: any }) {
  const variants: any[] = Array.isArray(product.variants) ? product.variants.filter((v) => v && (v.size || v.color)) : [];
  if (variants.length === 0) return null;
  const colors = Array.from(new Set(variants.map((v) => v.color).filter(Boolean))) as string[];
  const sizeList = Array.from(new Set(variants.map((v) => v.size).filter(Boolean))) as string[];
  const colorLabel = colors.length <= 3 ? colors.join(" / ") : `${colors.slice(0, 2).join(" / ")} +${colors.length - 2}`;
  const sizeLabel = sizeList.length <= 3 ? sizeList.join(" / ") : `${sizeList.slice(0, 2).join(" / ")} +${sizeList.length - 2}`;
  const parts = [colorLabel, sizeLabel].filter(Boolean).join(" · ");
  if (!parts) return null;
  return <span className="mt-1 inline-flex rounded-full bg-white/75 px-2 py-0.5 text-[8px] text-black/55">{parts}</span>;
}

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalog, addToCart, liked, toggleLike, language, siteSettings, pageSettings } = useStore();
  const isEnglish = language === "en";
  const product = catalog.find((item) => item.id === id) || catalog[0];
  const productName = getProductName(product, language);
  const productDescription = (isEnglish ? product.description : product.descriptionAr) || "";
  const galleryImages = product.images?.length ? product.images.slice(0, 5) : [product.image, product.image, product.image];
  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const availableColors = hasVariants ? Array.from(new Set(variants.map((v) => v.color))) : (product.colors?.length ? product.colors : ["#eeeae0", "#202320"]);
  const availableSizes = hasVariants ? Array.from(new Set(variants.map((v) => v.size))) : (product.sizes === undefined ? ["S", "M", "L", "XL", "XXL"] : product.sizes);
  const [selectedThumbnail, setSelectedThumbnail] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [addError, setAddError] = useState("");
  const [added, setAdded] = useState(false);
  const [policyTab, setPolicyTab] = useState<"shipping" | "returns">("shipping");
  const index = catalog.indexOf(product);
  useEffect(() => {
    setSelectedThumbnail(0);
    setAddError("");
    setAdded(false);
    if (hasVariants) {
      setSelectedSize("");
      setSelectedColor("");
    } else {
      setSelectedSize("L");
      setSelectedColor(availableColors[0] || "#eeeae0");
    }
  }, [product.id]);

  // Only describe the product that the URL actually points at; `catalog[0]` is just a render fallback.
  const matchesRoute = catalog.some((item) => item.id === id);
  useEffect(() => {
    if (!matchesRoute) {
      applySeo(document, {
        path: `/product/${id}`,
        title: `Product not found | No Name`,
        description: "This piece is no longer available. Browse the current No Name collection instead.",
        robots: "noindex, follow",
        language,
        type: "website",
      });
      return;
    }
    const seo = productSeo(product, language);
    applySeo(document, {
      path: `/product/${product.id}`,
      title: seo.title,
      description: seo.description,
      robots: seo.robots,
      language,
      image: absoluteUrl(galleryImages[0] || product.image),
      type: "product",
      jsonLd: [
        buildProductJsonLd(product, { language }),
        buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          { name: productName, path: `/product/${product.id}` },
        ]),
      ],
    });
  }, [matchesRoute, id, product, productName, language, galleryImages]);

  const add = () => {
    setAddError("");
    if (!hasVariants) {
      for (let count = 0; count < quantity; count += 1) addToCart(product);
      setAdded(true);
      return;
    }
    if (!selectedSize) {
      setAddError(isEnglish ? "Please select a size." : "الرجاء اختيار المقاس");
      return;
    }
    if (!selectedColor) {
      setAddError(isEnglish ? "Please select a color." : "الرجاء اختيار اللون");
      return;
    }
    const variant = variants.find((v) => v.size === selectedSize && v.color === selectedColor);
    if (!variant || !variant.id) {
      setAddError(isEnglish ? "This variant is unavailable." : "هذا المتغير غير متوفر");
      return;
    }
    if (Number(variant.stock ?? 0) < quantity) {
      setAddError(isEnglish ? "This variant does not have enough stock." : "لا توجد كمية كافية من هذا المتغير");
      return;
    }
    for (let count = 0; count < quantity; count += 1) addToCart(product, { variantId: variant.id, size: variant.size, color: variant.color });
    setAdded(true);
  };

  return (
    <>
      <section className="mx-auto max-w-[1120px] px-5 pb-16 pt-8 lg:px-8 lg:pb-24 lg:pt-12">
        <div className="mb-8 text-[10px] text-black/45">
          <Link to="/" className="transition hover:text-black">{isEnglish ? "Home" : "الرئيسية"}</Link>
          <span className="mx-2 text-black/25">/</span>
          <Link to="/shop" className="transition hover:text-black">{isEnglish ? "Shop" : "المتجر"}</Link>
          <span className="mx-2 text-black/25">/</span>
          <span>{productName}</span>
        </div>

        <div className="grid items-start gap-9 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="aspect-[.94] overflow-hidden rounded-[5px] bg-[#e5e3dc]">
              {product.video && selectedThumbnail === 0 ? <video src={product.video} poster={galleryImages[0]} autoPlay muted loop playsInline className="h-full w-full object-cover" aria-label={productName} /> : <img src={galleryImages[selectedThumbnail]} alt={productName} className={`h-full w-full object-cover ${selectedThumbnail === 1 ? "object-left" : selectedThumbnail === 2 ? "object-right" : "object-center"}`} />}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {galleryImages.map((image, thumbnail) => (
                <button type="button" key={`${image}-${thumbnail}`} onClick={() => setSelectedThumbnail(thumbnail)} className={`aspect-square overflow-hidden rounded-[3px] border bg-[#e5e3dc] ${thumbnail === selectedThumbnail ? "border-black" : "border-transparent"}`} aria-label={isEnglish ? `Product image ${thumbnail + 1}` : `صورة المنتج ${thumbnail + 1}`}>
                  <img src={image} alt="" className={`h-full w-full object-cover ${thumbnail === 1 ? "object-left" : thumbnail === 2 ? "object-right" : ""}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="lg:pt-3">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="mb-3 text-[10px] font-medium text-black/45">{getCategoryName(product.category, language)}</p>
                <h1 className="text-[25px] font-semibold leading-[1.5] tracking-[-0.03em] sm:text-[30px]">{productName}</h1>
                <p className="mt-2 text-[16px] font-medium">{getProductPrice(product, language)}</p>
              </div>
              <button onClick={() => toggleLike(index)} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10" aria-label={isEnglish ? "Add to wishlist" : "إضافة للمفضلة"}>
                <Heart size={17} fill={liked.includes(index) ? "currentColor" : "none"} className={liked.includes(index) ? "text-[#d4775c]" : "text-black/65"} />
              </button>
            </div>

            <div className="mt-5 rounded-[3px] bg-[#eff8ee] px-4 py-3 text-[10px] leading-6 text-[#3f7545]">
              <p><Check className="ml-1 inline-block" size={13} /> {isEnglish ? `Free shipping on orders over EGP ${(siteSettings.freeShippingThreshold ?? 2500).toLocaleString("en-US")}` : `شحن مجاني للطلبات فوق ${(siteSettings.freeShippingThreshold ?? 2500).toLocaleString("en-US")} جنيه`}</p>
            </div>

            <div className="mt-6 border-b border-black/10 pb-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold">{isEnglish ? "Color" : "اللون"}: <span className="font-normal text-black/60">{hasVariants && !selectedColor ? (isEnglish ? "Select a color" : "اختاري اللون") : selectedColor}</span></span>
              </div>
              <div className="flex gap-2">
                {availableColors.map((color) => (
                  <button key={color} onClick={() => { setAddError(""); setSelectedColor(color); }} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] ${selectedColor === color ? "border-black" : "border-black/10"}`}>
                    <span className="h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: color }} />{color}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-black/10 py-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-semibold">{isEnglish ? "Size" : "المقاس"}</span>
                <span className="text-[10px] text-[#c95f49]">{isEnglish ? "Choose your size" : "اختاري المقاس المناسب"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableSizes.map((size) => (
                  <button key={size} onClick={() => { setAddError(""); setSelectedSize(size); }} className={`min-w-[48px] rounded-[3px] border px-3 py-2.5 text-[10px] transition ${selectedSize === size ? "border-black bg-black text-white" : "border-black/15 hover:border-black"}`}>{size}</button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <div className="flex h-12 items-center rounded-[4px] border border-black/15">
                <button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex h-full w-10 items-center justify-center" aria-label={isEnglish ? "Decrease quantity" : "تقليل الكمية"}><Minus size={14} /></button>
                <span className="w-8 text-center text-[12px]">{quantity}</span>
                <button onClick={() => setQuantity((value) => value + 1)} className="flex h-full w-10 items-center justify-center" aria-label={isEnglish ? "Increase quantity" : "زيادة الكمية"}><Plus size={14} /></button>
              </div>
              <button onClick={add} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[4px] bg-[#171717] text-[12px] font-semibold text-white transition hover:bg-[#d4775c]">
                <ShoppingBag size={16} />{added ? (isEnglish ? "Added to bag" : "تمت الإضافة إلى السلة") : (isEnglish ? "Add to bag" : "أضيفي إلى السلة")}
              </button>
            </div>
            {addError && <p className="mt-2 text-[10px] text-[#c95f49]">{addError}</p>}
            <Link to="/cart" className="mt-3 flex h-12 items-center justify-center rounded-[4px] border border-black/60 text-[12px] font-medium transition hover:bg-black hover:text-white">{isEnglish ? "Buy now" : "اشتري الآن"}</Link>

            <div className="mt-7 border-t border-black/10 pt-6">
              <h2 className="mb-4 text-[13px] font-semibold">{isEnglish ? "Description" : "الوصف"}</h2>
              <p className="text-[11px] leading-7 text-black/65">{productDescription}</p>
              {(() => {
                const shippingPage = (pageSettings as any)?.shipping;
                const contentAr = shippingPage?.contentAr;
                const contentEn = shippingPage?.contentEn;
                const text = isEnglish ? contentEn : contentAr;
                if (!text) return null;
                return <p className="mt-3 text-[11px] leading-7 text-black/65">{text}</p>;
              })()}
            </div>

            <div className="mt-8 border-t border-black/10 pt-5">
              <div className="flex gap-5 border-b border-black/10 text-[11px] font-semibold">
                <button
                  onClick={() => setPolicyTab("shipping")}
                  className={`border-b-2 pb-3 transition ${policyTab === "shipping" ? "border-black text-black" : "border-transparent text-black/45"}`}
                >
                  {isEnglish ? "Shipping" : "الشحن"}
                </button>
                <button
                  onClick={() => setPolicyTab("returns")}
                  className={`border-b-2 pb-3 transition ${policyTab === "returns" ? "border-black text-black" : "border-transparent text-black/45"}`}
                >
                  {isEnglish ? "Returns" : "المرتجعات"}
                </button>
              </div>
              <div className="pt-5 text-[10px] leading-7 text-black/70">
                {(() => {
                  const shippingPage = (pageSettings as any)?.shipping;
                  const text = isEnglish ? shippingPage?.contentEn : shippingPage?.contentAr;
                  if (!text) return null;
                  return <p className="whitespace-pre-line">{text}</p>;
                })()}
              </div>
            </div>

            <div className="mt-10">
              <p className="mb-4 text-[10px] font-semibold text-black/65">{isEnglish ? "Complete the look" : "أكملي الإطلالة"}</p>
              <div className="space-y-2">
                {catalog.filter((item) => item.id !== product.id).slice(0, 3).map((item, suggestionIndex) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-[#e8e6dc] p-2.5">
                    <Link to={`/product/${item.id}`} className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-[#d7d5cc]">
                      <img src={item.image} alt={getProductName(item, language)} className="h-full w-full object-cover" />
                    </Link>
                    <Link to={`/product/${item.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold">{getProductName(item, language)}</p>
                      <p className="mt-1 text-[10px]">{getProductPrice(item, language)}</p>
                      <VariantSummary product={item} />
                    </Link>
                    {suggestionIndex === 1 ? (
                      <button onClick={() => { const hasVariants = Array.isArray(item.variants) && item.variants.length > 0; if (hasVariants) { navigate(`/product/${item.id}`); } else { addToCart(item); } }} className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-[#222] px-3 text-[9px] font-semibold text-white"><Plus size={12} /> {isEnglish ? "Add" : "يضاف"}</button>
                    ) : (
                      <Link to={`/product/${item.id}`} className="flex h-9 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d7d7d3] text-[9px] text-black/55">{isEnglish ? "View" : "تنفيذ"}</Link>
                    )}
                  </div>
                ))}
              </div>
              <a
                href={`${getSalesWhatsAppUrl(siteSettings)}?text=${encodeURIComponent(isEnglish ? `Hi, I'd like to ask about ${productName}.` : `مرحباً، عايز أسأل عن ${productName}.`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] text-[11px] font-semibold text-white"
              >
                <MessageCircle size={15} /> {isEnglish ? "Chat with us on WhatsApp" : "تواصلي معنا عبر واتساب"}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-black/10 bg-[#f7f7f4] px-5 py-16 lg:px-8 lg:py-20">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-9 flex items-end justify-between">
            <div><p className="mb-2 text-[10px] text-black/45">{isEnglish ? "More from this collection" : "اختيارات من نفس المجموعة"}</p><h2 className="text-[25px] font-semibold tracking-[-0.03em]">{isEnglish ? "You may also like" : "ممكن يعجبك كمان"}</h2></div>
            <Link to="/shop" className="text-[11px] underline underline-offset-4">{isEnglish ? "View all" : "شاهدي الكل"}</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {catalog.filter((item) => item.id !== product.id).slice(0, 4).map((item) => <ProductCard key={item.id} product={item} index={catalog.indexOf(item)} />)}
          </div>
        </div>
      </section>
    </>
  );
}
