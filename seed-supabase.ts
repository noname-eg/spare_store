import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ خطأ: لم يتم العثور على متغيرات البيئة الخاصة بـ Supabase');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
    try {
        const filePath = path.join(process.cwd(), 'store_backup.json');
        if (!fs.existsSync(filePath)) {
            console.error('❌ ملف store_backup.json غير موجود.');
            return;
        }

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const backupData = JSON.parse(rawData);

        // 1. رفع وتحديث الأقسام وجلب الـ IDs الخاصة بها
        console.log('🔄 جاري رفع الأقسام وقراءة المعرفات (IDs)...');
        let categoriesMap: Record<string, string> = {};

        if (backupData.categories && backupData.categories.length > 0) {
            const { data: catData, error: catError } = await supabase
                .from('categories')
                .upsert(backupData.categories, { onConflict: 'slug' })
                .select('id, slug');

            if (catError) {
                console.error('❌ خطأ الأقسام:', catError.message);
            } else if (catData) {
                catData.forEach((cat) => {
                    categoriesMap[cat.slug] = cat.id;
                });
                console.log('✅ تم رفع وتأكيد الأقسام بنجاح!');
            }
        }

        // 2. إدخال المنتجات ببيانات مطابقة تماماً لمخطط Supabase
        console.log('🔄 جاري إدخال المنتجات ببيانات دقيقة...');
        if (backupData.products && backupData.products.length > 0) {
            const cleanProducts = backupData.products.map((prod: any, index: number) => {
                const generatedSlug = prod.slug || (prod.name_en
                    ? prod.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                    : `product-${index}`);

                const price = prod.price || 0;
                const originalPrice = prod.original_price || price;
                const categoryId = categoriesMap[prod.category_slug] || null;

                return {
                    slug: generatedSlug,
                    name: prod.name_en,
                    name_ar: prod.name_ar,
                    description: prod.description_en,
                    description_ar: prod.description_ar,
                    category_id: categoryId,
                    sale_price: price,
                    original_price: originalPrice,
                    images: prod.images || [],
                    image: prod.images?.[0] || null,
                    is_active: true
                };
            });

            const { data: prodData, error: prodError } = await supabase
                .from('products')
                .upsert(cleanProducts, { onConflict: 'slug' })
                .select();

            if (prodError) {
                console.error('❌ خطأ المنتجات:', prodError.message);
            } else {
                console.log('🎉 تم رفع المنتجات وربطها بالأقسام والأسعار بنجاح!', prodData.length);
            }
        }

    } catch (error) {
        console.error('❌ حدث خطأ غير متوقع:', error);
    }
}

seedDatabase();