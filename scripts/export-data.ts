import fs from 'fs';
import path from 'path';

function exportData() {
    try {
        const backupData = {
            exportedAt: new Date().toISOString(),
            categories: [
                { name_ar: "أزياء نسائية", name_en: "Women Modest Wear", slug: "women-modest-wear" },
                { name_ar: "تشكيلة الصيف", name_en: "Summer Collection", slug: "summer-collection" },
                { name_ar: "وصل حديثاً", name_en: "New Arrivals", slug: "new-arrivals" }
            ],
            products: [
                {
                    name_ar: "طقم صيفي أنيق 2026",
                    name_en: "New Summer 2026 Set",
                    price: 2500,
                    original_price: 3000,
                    description_ar: "تصميم عصري مريح للاستخدام اليومي من خامات عالية الجودة",
                    description_en: "Modest styles designed for everyday comfort",
                    category_slug: "women-modest-wear",
                    is_new: true,
                    in_stock: true,
                    images: ["/images/hero-banner.jpg"]
                }
            ],
            siteSettings: {
                storeName: "No Name",
                subTitle: "Modest Wear",
                currency: "EGP",
                freeShippingThreshold: 2500
            }
        };

        const outputPath = path.join(process.cwd(), 'store_backup.json');
        fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), 'utf-8');
        console.log('✅ تم إنشاء store_backup.json بنجاح!');

    } catch (error) {
        console.error('❌ حدث خطأ أثناء التصدير:', error);
    }
}

exportData();