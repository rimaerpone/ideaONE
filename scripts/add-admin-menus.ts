/**
 * P1.5-T13 — افزودن منوهای «کاربران» و «انبارها» به رجیستری زنده (ModuleMenu).
 * همگام با scripts/seed.ts (منبع حقیقت)؛ idempotent — اجرای چندباره بی‌اثر است.
 * خروجی: دروازه CH-18 (پیوند دوسویه منو ↔ رجیستری نما) روی دیتابیس زنده پاس می‌شود.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type MenuDef = { viewKey: string; label: string; icon: string }

const ADDITIONS: { moduleCode: string; menus: MenuDef[] }[] = [
  {
    moduleCode: 'settings',
    menus: [
      { viewKey: 'users', label: 'کاربران', icon: 'Users' },
    ],
  },
  {
    moduleCode: 'warehouse',
    menus: [
      { viewKey: 'warehouses', label: 'انبارها', icon: 'Archive' },
    ],
  },
]

async function main() {
  for (const { moduleCode, menus } of ADDITIONS) {
    const mod = await db.platformModule.findUnique({ where: { code: moduleCode }, include: { menus: true } })
    if (!mod) {
      console.log(`⚠ ماژول «${moduleCode}» یافت نشد — رد شد`)
      continue
    }
    for (const m of menus) {
      const exists = mod.menus.some((x) => x.viewKey === m.viewKey)
      if (exists) {
        console.log(`= ${moduleCode}/${m.viewKey} از قبل موجود`)
        continue
      }
      // sortOrder پشت سر آخرین منوی موجود
      const maxSort = mod.menus.reduce((s, x) => Math.max(s, x.sortOrder), 0)
      await db.moduleMenu.create({
        data: { moduleId: mod.id, viewKey: m.viewKey, label: m.label, icon: m.icon, sortOrder: maxSort + 1 },
      })
      console.log(`+ ${moduleCode}/${m.viewKey} («${m.label}») افزوده شد`)
    }
  }
  // گزارش نهایی
  const count = await db.moduleMenu.count()
  console.log(`\nجمع منوهای رجیستری: ${count}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
