import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { useStore, type StoreOrder } from "@/components/store/StoreLayout";

export default function OrderSummary() {
  const { id } = useParams();
  const location = useLocation();
  const { orders, language } = useStore();
  const isEnglish = language === "en";
  const whatsappBlocked = Boolean((location.state as { whatsappBlocked?: boolean } | null)?.whatsappBlocked);
  const [remoteOrder, setRemoteOrder] = useState<StoreOrder | null>(null);
  const contextOrder = orders.find((item) => item.id === id);
  const order = contextOrder || remoteOrder;

  useEffect(() => {
    if (contextOrder) return;
    fetch(`/api/orders/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRemoteOrder(data as StoreOrder);
      })
      .catch(() => undefined);
  }, [id, contextOrder]);

  if (!order) {
    return <section className="mx-auto max-w-[760px] px-5 py-20 text-center lg:px-8"><h1 className="font-serif text-4xl">{isEnglish ? "Order not found" : "الطلب غير موجود"}</h1><Link to="/shop" className="mt-8 inline-flex items-center gap-5 border-b border-[#1c2822] pb-3 text-[11px] font-bold">{isEnglish ? "Continue shopping" : "متابعة التسوق"}<ArrowLeft size={16} /></Link></section>;
  }

  const payment = order.paymentMethod === "wallet" ? (isEnglish ? "E-wallet" : "محفظة إلكترونية") : order.paymentMethod === "instapay" ? "InstaPay" : (isEnglish ? "Cash on delivery" : "دفع عند الاستلام");

  return <section className="mx-auto max-w-[900px] px-5 py-12 lg:px-8 lg:py-20"><div className="mb-10 border-b border-[#1c2822]/15 pb-8"><p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-[#d4775c]">ORDER CONFIRMED</p><h1 className="font-serif text-5xl tracking-[-0.05em]">{isEnglish ? "Order summary" : "ملخص الطلب"}</h1><p className="mt-4 max-w-[560px] text-[13px] leading-6 text-black/65">{isEnglish ? "Thank you for your order. We’ll contact you shortly to confirm the details." : "شكرًا لطلبك. سنتواصل معك قريبًا لتأكيد التفاصيل."}</p><p className="mt-3 text-[12px] text-black/55">{order.id} · {new Date(order.date).toLocaleString(isEnglish ? "en-US" : "ar-EG")}</p>{whatsappBlocked && <p className="mt-4 rounded bg-[#fff7eb] px-4 py-3 text-[10px] leading-5 text-[#94612e]">{isEnglish ? "Your order is confirmed. The WhatsApp confirmation could not be opened by the browser — we will contact you shortly." : "تم تأكيد طلبك. تعذّر فتح رسالة WhatsApp من المتصفح — سنتواصل معك قريبًا."}</p>}</div><div className="grid gap-8 lg:grid-cols-[1fr_300px]"><div className="space-y-8"><div className="border-b border-black/10 pb-6"><h2 className="mb-4 text-xl">{isEnglish ? "Delivery details" : "بيانات التوصيل"}</h2><dl className="grid gap-3 text-[12px]"><div className="flex justify-between gap-5"><dt className="text-black/50">{isEnglish ? "Name" : "الاسم"}</dt><dd className="text-right font-medium">{order.customerName || "-"}</dd></div><div className="flex justify-between gap-5"><dt className="text-black/50">{isEnglish ? "Phone" : "الهاتف"}</dt><dd className="text-right font-medium">{order.phone || "-"}</dd></div><div className="flex justify-between gap-5"><dt className="text-black/50">{isEnglish ? "Address" : "العنوان"}</dt><dd className="max-w-[70%] text-right font-medium">{order.address || "-"}</dd></div>{order.notes && <div className="flex justify-between gap-5"><dt className="text-black/50">{isEnglish ? "Notes" : "ملاحظات"}</dt><dd className="max-w-[70%] text-right font-medium">{order.notes}</dd></div>}</dl></div><div><h2 className="mb-4 text-xl">{isEnglish ? "Items" : "المنتجات"}</h2><div className="space-y-3">{(order.orderItems || []).map((item) => <div key={`${item.name}-${item.size}-${item.quantity}`} className="flex justify-between gap-5 border-b border-black/10 pb-3 text-[12px]"><span>{item.name}{item.size && item.color ? <span className="block text-[10px] text-black/45">{item.size} · {item.color}</span> : null} × {item.quantity}</span><span className="shrink-0">{item.total.toLocaleString("en-US")} {isEnglish ? "EGP" : "ج.م"}</span></div>)}</div></div></div><aside className="h-fit bg-[#f6f3ee] p-6"><h2 className="mb-5 text-xl">{isEnglish ? "Payment" : "الدفع"}</h2><p className="text-[12px] font-medium">{payment}</p>{order.transferNumber && <p className="mt-3 text-[11px] text-black/55">{isEnglish ? "Transfer number" : "رقم التحويل"}: {order.transferNumber}</p>}{order.receipt && <p className="mt-3 flex items-center gap-2 text-[11px] text-[#3f7545]"><Check size={14} />{isEnglish ? "Transfer receipt attached" : "تم إرفاق إيصال التحويل"}</p>}<div className="mt-6 flex justify-between border-t border-black/10 pt-5 text-sm font-bold"><span>{isEnglish ? "Total" : "الإجمالي"}</span><span>{order.total.toLocaleString("en-US")} {isEnglish ? "EGP" : "ج.م"}</span></div></aside></div><Link to="/shop" className="mt-10 inline-flex items-center gap-5 border-b border-[#1c2822] pb-3 text-[11px] font-bold">{isEnglish ? "Continue shopping" : "متابعة التسوق"}<ArrowLeft size={16} /></Link></section>;
}
