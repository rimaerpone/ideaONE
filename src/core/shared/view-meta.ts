/**
 * متادیتای نماها برای پوسته چندسندی (P1.5-T3) — مشترک بین فروشگاه workspace و رجیستری نما.
 * آیکون‌ها فقط از لیست سفید CH-19 (ICONS سایدبار) — دروازه کیفیت پوشش را راستی‌آزمایی می‌کند.
 */

export type ViewMeta = { label: string; icon: string }

export const VIEW_META: Record<string, ViewMeta> = {
  dashboard: { label: 'داشبورد', icon: 'LayoutDashboard' },
  cartable: { label: 'کارتابل', icon: 'Inbox' },
  letters: { label: 'نامه‌ها', icon: 'Mail' },
  products: { label: 'محصولات', icon: 'Package' },
  partners: { label: 'شرکا', icon: 'Users' },
  stock: { label: 'موجودی انبار', icon: 'Boxes' },
  whdocs: { label: 'اسناد انبار', icon: 'ClipboardCheck' },
  requests: { label: 'درخواست کالا', icon: 'ClipboardList' },
  modules: { label: 'کاتالوگ پلاگین‌ها', icon: 'Puzzle' },
  settings: { label: 'تنظیمات بستر', icon: 'Settings' },
  users: { label: 'کاربران', icon: 'Users' },
  warehouses: { label: 'انبارها', icon: 'Archive' },
  'my-account': { label: 'حساب من', icon: 'UserRound' },
}

export function viewLabel(viewKey: string): string {
  return VIEW_META[viewKey]?.label ?? viewKey
}

export function viewIcon(viewKey: string): string {
  return VIEW_META[viewKey]?.icon ?? 'LayoutDashboard'
}
