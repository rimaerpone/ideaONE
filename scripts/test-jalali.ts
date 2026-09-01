import { toJalali, formatJalali } from '../src/core/shared/jalali'
const dates = [new Date('2026-08-27'), new Date('2026-08-27T10:00:00'), new Date('2026-01-01'), new Date('2026-03-21'), new Date('2025-09-22')]
for (const d of dates) {
  const j = toJalali(d)
  console.log(d.toISOString().slice(0, 10), '->', j.jy, '/', j.jm, '/', j.jd, '| fmt:', formatJalali(d))
}
