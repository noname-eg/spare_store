/**
 * Shared types between Client and Server for NO NAME E-Commerce
 */

export interface DemoResponse {
  message: string;
}

export interface ProductVariant {
  id?: string;
  productId?: string;
  size: string;
  color: string;
  sku?: string;
  stock: number;
  reservedStock?: number;
}

export interface StoreProduct {
  id: string;
  slug?: string;
  name: string;
  nameAr?: string;
  price: string;
  numericPrice: number;
  originalPrice: number;
  salePrice?: number;
  badge?: string;
  category: string;
  categoryId?: string;
  description?: string;
  descriptionAr?: string;
  image: string;
  images: string[];
  video?: string;
  tag?: string;
  stock?: number;
  lowStockThreshold?: number;
  colors?: string[];
  sizes?: string[];
  variants?: ProductVariant[];
  isActive?: boolean;
}

export interface Coupon {
  id?: string;
  code: string;
  discount: number;
  discountPercent?: number;
  maxUses?: number;
  uses?: number;
  active?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface OrderItem {
  id?: string;
  productId?: string;
  variantId?: string;
  productName: string;
  size?: string;
  color?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id?: string;
  publicReference?: string;
  customerName: string;
  phone: string;
  address: string;
  notes?: string;
  paymentMethod: "cod" | "wallet" | "instapay";
  paymentStatus?: "pending" | "submitted" | "verified" | "rejected";
  fulfillmentStatus?: "new" | "processing" | "completed" | "cancelled";
  subtotal: number;
  discountAmount?: number;
  shippingAmount?: number;
  total: number;
  couponCode?: string;
  transferNumberSnapshot?: string;
  receiptStorageKey?: string;
  createdAt?: string;
  items?: OrderItem[];
}

export interface ShippingZone {
  id?: string;
  nameAr: string;
  nameEn: string;
  cost: number;
  provinces: string[];
}

export interface SiteSettings {
  announcement?: string;
  accent?: string;
  heroTitle?: string;
  heroDescription?: string;
  walletNumber?: string;
  instapayNumber?: string;
  salesWhatsappNumber?: string;
  salesWhatsappUrl?: string;
  discoverVideos?: string[];
  socialLinks?: { instagram?: string; facebook?: string; youtube?: string; whatsapp?: string; tiktok?: string };
  shippingCost?: number;
  freeShippingThreshold?: number;
  shippingZones?: ShippingZone[];
  announcementAr?: string;
  announcementEn?: string;
  heroBadgeAr?: string;
  heroBadgeEn?: string;
  heroTitleAr?: string;
  heroTitleEn?: string;
  heroSubtitleAr?: string;
  heroSubtitleEn?: string;
  heroCtaAr?: string;
  heroCtaEn?: string;
  heroImage1?: string;
  heroImage2?: string;
  brandBeliefAr?: string;
  brandBeliefEn?: string;
}