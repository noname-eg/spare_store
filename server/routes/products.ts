import { Router } from 'express';
import { getProducts, getProductBySlug, getCategories } from '../db';
import { sendError } from '../error';

const router = Router();

// 1. جلب كافة المنتجات النشطة (مع المتغيرات وتنسيق StoreProduct)
router.get('/', async (_req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err: any) {
    sendError(res, err, "Products list error");
  }
});

// 2. جلب الأقسام النشطة
router.get('/categories', async (_req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err: any) {
    sendError(res, err, "Categories error");
  }
});

// 3. جلب منتج واحد مباشرة من قاعدة البيانات
router.get('/:id', async (req, res) => {
  try {
    const product = await getProductBySlug(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const variants = product.product_variants || [];
    const sizes = Array.from(new Set(variants.map((v: any) => v.size))).filter(Boolean) as string[];
    const colors = Array.from(new Set(variants.map((v: any) => v.color))).filter(Boolean) as string[];
    const totalStock = variants.reduce((acc: number, v: any) => acc + (v.stock || 0), 0);

    const orig = Number(product.original_price || 0);
    const sale = product.sale_price ? Number(product.sale_price) : undefined;
    const finalPrice = sale || orig;

    res.json({
      id: product.id,
      slug: product.slug,
      name: product.name || product.name_ar || "",
      nameAr: product.name_ar,
      price: `${finalPrice.toLocaleString("en-US")} ج.م`,
      numericPrice: finalPrice,
      originalPrice: orig,
      salePrice: sale,
      badge: product.badge || undefined,
      category: product.categories?.name || product.category_id || "Dresses",
      descriptionAr: product.description_ar,
      description: product.description,
      image: product.image || (product.images && product.images[0]) || "",
      images: product.images || [],
      video: product.video || undefined,
      stock: totalStock,
      colors: colors.length ? colors : ["#222222"],
      sizes: sizes.length ? sizes : ["S", "M", "L"],
      variants: variants,
      isActive: product.is_active,
    });
  } catch (err: any) {
    sendError(res, err, "Product detail error");
  }
});

export default router;