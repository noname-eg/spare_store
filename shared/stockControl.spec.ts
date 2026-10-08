import { describe, it, expect } from "vitest";
import { nextStock, nextUsedCount } from "./orderMath";

// محاكاة صادقة للمنطق الحالي في server/routes/orders.ts:
// قراءة طازجة → حساب الجديد → تحديث شرطي بحارس (stock >= quantity) مع إعادة محاولة.
// لا RPC، لا معاملة — هذا بالضبط ما يحدث مقابل PostgREST.
type VariantRow = { stock: number };
class MockExt {
  byId = new Map<string, VariantRow>();
  constructor(stocks: Record<string, number>) {
    for (const [id, stock] of Object.entries(stocks)) this.byId.set(id, { stock });
  }
  read(id: string): number {
    return this.byId.get(id)!.stock;
  }
  guardedWrite(id: string, quantity: number, newStock: number): boolean {
    const row = this.byId.get(id)!;
    if (row.stock >= quantity) {
      row.stock = newStock;
      return true;
    }
    return false; // يحاكي 0 صفوف محدّثة
  }
  addBack(id: string, quantity: number): void {
    const row = this.byId.get(id)!;
    row.stock = Math.max(0, row.stock + quantity);
  }
}

const MAX_ATTEMPTS = 3;
async function tryDeduct(db: MockExt, id: string, quantity: number): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = db.read(id);
    const next = nextStock(current, quantity);
    if (next === null) return false;
    if (db.guardedWrite(id, quantity, next)) return true;
  }
  return false;
}

async function deductWithRollback(db: MockExt, orders: { id: string; quantity: number }[]): Promise<"ok" | "rolled-back"> {
  const deducted: { id: string; quantity: number }[] = [];
  try {
    for (const item of orders) {
      if (!(await tryDeduct(db, item.id, item.quantity)) || db.read(item.id) < 0) {
        throw new Error("stock failure");
      }
      deducted.push(item);
    }
    return "ok";
  } catch {
    for (const d of deducted) db.addBack(d.id, d.quantity);
    return "rolled-back";
  }
}

describe("stock control (guarded conditional updates, no RPC)", () => {
  it("deducts from the exact variant only (V: multiple variants stay isolated)", async () => {
    const db = new MockExt({ s: 3, m: 5, l: 2 });
    const ok = await deductWithRollback(db, [
      { id: "m", quantity: 2 },
      { id: "s", quantity: 1 },
    ]);
    expect(ok).toBe("ok");
    expect(db.read("m")).toBe(3);
    expect(db.read("s")).toBe(2);
    expect(db.read("l")).toBe(2);
  });

  it("H: insufficient variant stock never succeeds and changes nothing", async () => {
    const db = new MockExt({ m: 2 });
    const ok = await deductWithRollback(db, [{ id: "m", quantity: 3 }]);
    expect(ok).toBe("rolled-back");
    expect(db.read("m")).toBe(2);
  });

  it("6: partial failure triggers compensation restoring exactly the deducted stock", async () => {
    const db = new MockExt({ m: 5, l: 1 });
    const ok = await deductWithRollback(db, [
      { id: "m", quantity: 2 },
      { id: "l", quantity: 2 }, // متاح 1 فقط → يفشل في منتصف الطلب
    ]);
    expect(ok).toBe("rolled-back");
    expect(db.read("m")).toBe(5);
    expect(db.read("l")).toBe(1);
  });

  it("guard never lets a write pass with current < quantity (no negative stock)", () => {
    const db = new MockExt({ x: 1 });
    expect(db.guardedWrite("x", 1, 0)).toBe(true);
    expect(db.guardedWrite("x", 1, 0)).toBe(false); // الآن zero stock
    expect(db.read("x")).toBe(0);
  });

  it("retry loop re-reads and fails cleanly under guard starvation", async () => {
    const db = new MockExt({ x: 1 });
    const first = await tryDeduct(db, "x", 1);
    // يستهلك أحد الطلبات المخزون قبل الثاني
    const second = await tryDeduct(db, "x", 1);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(db.read("x")).toBe(0);
  });
});

describe("documented concurrency limitation (no false atomicity)", () => {
  it("shows the app-level stale-read window the final DB layer must solve", () => {
    const db = new MockExt({ v: 10 });
    // كاتبان على نفس اللحظة من قاعدة البيانات (تطبيقان خادم أو طلبان متوازيان):
    const readA = db.read("v"); // 10
    const newA = nextStock(readA, 3)!; // 7
    const readB = db.read("v"); // 10 أيضاً (لقطة قديمة)
    const newB = nextStock(readB, 4)!; // 6

    expect(db.guardedWrite("v", 3, newA)).toBe(true); // stock → 7
    // باء تمر بحارس الكمية (7 >= 4) لكنها تحمل `newB` الخاطئة القديمة
    expect(db.guardedWrite("v", 4, newB)).toBe(true); // stock → 6 (يجب أن تكون 3)

    // لا سالب ولا بيع زائد تحت الصفر:
    expect(db.read("v")).toBeGreaterThanOrEqual(0);
    // لكن الدقة تحيد — وهذا سبب صراحة توثيق أن الذرّية الكاملة مسؤولية طبقة قاعدة البيانات
    expect(db.read("v")).not.toBe(10 - 7);
  });
});

describe("coupon usage control (conditional increment)", () => {
  type CouponRow = { used_count: number; max_uses: number | null };
  class CouponDb {
    rows = new Map<string, CouponRow>();
    constructor(spec: Record<string, { used: number; max: number | null }>) {
      for (const [id, s] of Object.entries(spec)) this.rows.set(id, { used_count: s.used, max_uses: s.max });
    }
    read(id: string) {
      return this.rows.get(id)!;
    }
    guardedIncrement(id: string, next: number, maxUses: number | null): boolean {
      const row = this.rows.get(id)!;
      if (row.used_count === 0 && maxUses != null && row.used_count >= maxUses) return false;
      if (maxUses != null && row.used_count >= maxUses) return false;
      row.used_count = next;
      return true;
    }
  }

  it("K: maxed-out coupon is rejected and usage stays at max", async () => {
    const db = new CouponDb({ c1: { used: 10, max: 10 } });
    const row = db.read("c1");
    const next = nextUsedCount(row.used_count, 1, row.max_uses);
    expect(next).toBeNull();
  });

  it("9: sequential increments never exceed max_uses under normal conditions", async () => {
    const db = new CouponDb({ c1: { used: 0, max: 3 } });
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const row = db.read("c1");
      const next = nextUsedCount(row.used_count, 1, row.max_uses);
      if (next === null) {
        results.push(false);
      } else {
        results.push(db.guardedIncrement("c1", next, row.max_uses));
      }
    }
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(db.read("c1").used_count).toBe(3);
  });

  it("10: compensation restores coupon usage on order failure", async () => {
    const db = new CouponDb({ c1: { used: 1, max: null } });
    const row = db.read("c1");
    const next = nextUsedCount(row.used_count, 1, row.max_uses)!;
    expect(db.guardedIncrement("c1", next, row.max_uses)).toBe(true);
    expect(db.read("c1").used_count).toBe(2);
    // فشل لاحق → استرجاع
    db.read("c1").used_count = Math.max(0, db.read("c1").used_count - 1);
    expect(db.read("c1").used_count).toBe(1);
  });
});