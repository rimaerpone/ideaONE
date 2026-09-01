// قرارداد مشترک سرویس‌ها — مرجع: docs/architecture/07-conventions.md §2
// تمام توابع service ماژول‌ها این نتیجه را برمی‌گردانند؛ route فقط ترجمه HTTP است.
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }
