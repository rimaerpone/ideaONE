/**
 * seed طرحواره‌های کدگذاری — منبع حقیقت: «دستورالعمل کدگذاری محصولات» شرکت
 * (مستقر در upload/دستورالعمل کدگذاری محصولات 3.docx — ۱۶ جزء / ۲۰ کاراکتر).
 * + سه طرحواره عمومی (تجهیزات ثابت / قطعات یدکی / مواد اولیه) = اثبات فراگیر بودن موتور:
 * افزودن هر خانواده قلم جدید فقط داده است، نه کد.
 *
 * idempotent: اجرای چندباره بی‌اثر است (حذف و بازسازی طرحواره‌ها با همین کلیدها).
 * اجرا روی DB زنده: bunx tsx scripts/seed-code-schemes.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

type SegDef = {
  key: string
  label: string
  length: number
  kind: 'ENUM' | 'COUNTER'
  mapsTo?: string
  enumValues?: [string, string][]
}

type SchemeDef = {
  code: string
  name: string
  description: string
  itemFamily: string
  separator: string
  motherSegments: number | null
  segments: SegDef[]
}

// ---------- ۱) طرحواره کاشی — ترجمه کامل سند شرکت ----------
const TILE: SchemeDef = {
  code: 'tile',
  name: 'کدینگ محصولات کاشی (۲۰ کاراکتری)',
  description: 'دستورالعمل کدگذاری محصولات شرکت — ۱۶ جزء از چپ: لعاب/ضخامت/سایز/سالن/طرح/رنگ/کنتراست/طیف/شید/درجه/کلاس سایز/قالب/جذب آب/پرداخت/بسته‌بندی/برند. کد مادر = ۹ جزء ابتدایی (۱۲ کاراکتر)؛ شناسنامه پالت = تا جزء ۱۴ (کلاس سایز).',
  itemFamily: 'PRODUCT',
  separator: '',
  motherSegments: 9,
  segments: [
    { key: 'glaze', label: 'نوع لعاب', length: 1, kind: 'ENUM', mapsTo: 'surface', enumValues: [
      ['T', 'براق (ترانس)'], ['M', 'مات'], ['P', 'پولیش'], ['B', 'پروتکشن'], ['R', 'رستیک'],
    ] },
    { key: 'thickness', label: 'ضخامت', length: 1, kind: 'ENUM', enumValues: [
      ['A', '۹.۵ میلی‌متر'], ['B', '۱۲ میلی‌متر'], ['C', '۱۴ میلی‌متر'], ['D', '۱۶ میلی‌متر'],
    ] },
    { key: 'size', label: 'سایز', length: 2, kind: 'ENUM', mapsTo: 'size', enumValues: [
      ['60', '۶۰×۶۰'], ['75', '۷۵×۷۵'], ['62', '۱۲۰×۶۰'], ['80', '۸۰×۸۰'], ['11', '۱۰۰×۱۰۰'],
      ['40', '۴۰×۴۰'], ['30', '۳۰×۳۰'], ['39', '۳۰×۹۰'],
    ] },
    { key: 'hall', label: 'واحد تولید', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'سالن ۱'], ['2', 'سالن ۲'], ['3', 'سالن ۳'], ['4', 'سالن ۴'],
    ] },
    { key: 'design', label: 'کد طرح', length: 3, kind: 'COUNTER' }, // شمارنده — واحد کنترل کیفیت اعلام می‌کند
    { key: 'color', label: 'رنگ', length: 1, kind: 'ENUM', mapsTo: 'color', enumValues: [
      ['A', 'سفید (White)'], ['B', 'کرم (Ivory)'], ['C', 'قهوه‌ای (Brown)'], ['D', 'طوسی (Gray)'],
      ['E', 'بژ (Beige)'], ['F', 'نقره‌ای (Silver)'], ['G', 'آبی'], ['H', 'مشکی'],
      ['K', 'دودی'], ['S', 'استخوانی'], ['0', 'رنگ خنثی'],
    ] },
    { key: 'contrast', label: 'کنتراست', length: 1, kind: 'ENUM', enumValues: [
      ['0', 'بدون کنتراست'], ['1', 'روشن'], ['2', 'تیره'],
    ] },
    { key: 'spectrum', label: 'طیف', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'کم‌رنگ‌تر از استاندارد'], ['2', 'کم‌رنگ‌تر از استاندارد'], ['3', 'کم‌رنگ‌تر از استاندارد'],
      ['4', 'کم‌رنگ‌تر از استاندارد'], ['5', 'استاندارد'], ['6', 'پررنگ‌تر از استاندارد'],
      ['7', 'پررنگ‌تر از استاندارد'], ['8', 'پررنگ‌تر از استاندارد'], ['9', 'پررنگ‌تر از استاندارد'],
    ] },
    { key: 'shade', label: 'شید', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'چاپ کم‌رنگ‌تر از استاندارد'], ['2', 'چاپ کم‌رنگ‌تر از استاندارد'], ['3', 'چاپ کم‌رنگ‌تر از استاندارد'],
      ['4', 'چاپ کم‌رنگ‌تر از استاندارد'], ['5', 'چاپ استاندارد'], ['6', 'چاپ پررنگ‌تر از استاندارد'],
      ['7', 'چاپ پررنگ‌تر از استاندارد'], ['8', 'چاپ پررنگ‌تر از استاندارد'], ['9', 'چاپ پررنگ‌تر از استاندارد'],
    ] },
    { key: 'grade', label: 'درجه', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'درجه ۱'], ['2', 'درجه ۲'], ['3', 'درجه ۳'], ['4', 'درجه ۴'], ['5', 'درجه ۵'],
      ['6', 'خارج از درجه‌بندی'],
    ] },
    { key: 'sizeClass', label: 'کلاس سایز', length: 1, kind: 'ENUM', enumValues: [
      ['S', '−۰.۵ (کوچک‌تر)'], ['M', 'استاندارد'], ['L', '+۰.۵ (بزرگ‌تر)'],
    ] },
    { key: 'mold', label: 'نوع قالب', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'قالب تخت'], ['2', 'قالب استراکچر'],
    ] },
    { key: 'absorption', label: 'گروه جذب آب', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'Bla'], ['2', 'Blb'], ['3', 'Blla'], ['4', 'Bllb'], ['5', 'Blll'],
    ] },
    { key: 'finish', label: 'نوع پرداخت نهایی', length: 1, kind: 'ENUM', enumValues: [
      ['R', 'رکتی‌شده'], ['N', 'رکتی‌نشده'],
    ] },
    { key: 'packaging', label: 'تیپ بسته‌بندی', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'بسته‌بندی فروش داخلی'], ['2', 'بسته‌بندی فروش صادراتی'],
    ] },
    { key: 'brand', label: 'برند', length: 2, kind: 'ENUM', enumValues: [
      ['IS', 'Isfahan Tile'], ['YA', 'Yasmina'],
    ] },
  ],
}

// ---------- ۲) تجهیزات ثابت — الگوی کوتاه با جداکننده ----------
const EQUIPMENT: SchemeDef = {
  code: 'equipment',
  name: 'کدینگ تجهیزات ثابت',
  description: 'الگوی عمومی برای همه تجهیزات و ماشین‌آلات (کوره/پرس/خط لعاب/…) — خانواده-سالن-شماره سری. کد مادر = خانواده+سالن (گروه دارایی).',
  itemFamily: 'EQUIPMENT',
  separator: '-',
  motherSegments: 2,
  segments: [
    { key: 'family', label: 'خانواده تجهیزات', length: 3, kind: 'ENUM', enumValues: [
      ['KLN', 'کوره پخت'], ['PRS', 'پرس'], ['GLZ', 'خط لعاب'], ['POL', 'خط پولیش'],
      ['PAK', 'خط بسته‌بندی'], ['DRY', 'خشک‌کن'], ['CNV', 'نوار نقاله'],
    ] },
    { key: 'hall', label: 'سالن', length: 1, kind: 'ENUM', enumValues: [
      ['1', 'سالن ۱'], ['2', 'سالن ۲'], ['3', 'سالن ۳'], ['4', 'سالن ۴'],
    ] },
    { key: 'serial', label: 'شماره سری', length: 3, kind: 'COUNTER' },
  ],
}

// ---------- ۳) قطعات یدکی ----------
const SPARE_PART: SchemeDef = {
  code: 'spare-part',
  name: 'کدینگ قطعات یدکی',
  description: 'الگوی عمومی قطعات یدکی ماشین‌آلات — دسته-مشخصه فنی-شماره. کد مادر = دسته+مشخصه (قطعه یدکی قابل تعویض).',
  itemFamily: 'SPARE_PART',
  separator: '-',
  motherSegments: 2,
  segments: [
    { key: 'category', label: 'دسته قطعه', length: 3, kind: 'ENUM', enumValues: [
      ['BRG', 'بلبرینگ'], ['BLT', 'تسمه و زنجیر'], ['MTR', 'الکتروموتور'], ['VLV', 'شیر و اتصالات'],
      ['SEN', 'سنسور و ابزار دقیق'], ['RSR', 'مقاومت و هیتر'], ['SEAL', 'اورینگ و واشر'],
    ] },
    { key: 'spec', label: 'مشخصه فنی', length: 2, kind: 'ENUM', enumValues: [
      ['05', 'سایز ۰۵'], ['07', 'سایز ۰۷'], ['10', 'سایز ۱۰'], ['12', 'سایز ۱۲'],
      ['15', 'سایز ۱۵'], ['20', 'سایز ۲۰'],
    ] },
    { key: 'serial', label: 'شماره ردیف', length: 3, kind: 'COUNTER' },
  ],
}

// ---------- ۴) مواد اولیه ----------
const RAW_MATERIAL: SchemeDef = {
  code: 'raw-material',
  name: 'کدینگ مواد اولیه',
  description: 'الگوی عمومی مواد اولیه (فلسپار/کائولن/…) — خانواده-درجه-بچ. کد مادر = خانواده+درجه (نوع خرید).',
  itemFamily: 'RAW_MATERIAL',
  separator: '-',
  motherSegments: 2,
  segments: [
    { key: 'family', label: 'خانواده ماده', length: 2, kind: 'ENUM', enumValues: [
      ['FS', 'فلسپار'], ['KY', 'کائولن'], ['GL', 'گل سفید'], ['QZ', 'کوارتز'],
      ['PX', 'پودر لعاب'], ['CH', 'مواد شیمیایی'],
    ] },
    { key: 'grade', label: 'درجه', length: 1, kind: 'ENUM', enumValues: [
      ['A', 'درجه A'], ['B', 'درجه B'], ['C', 'درجه C'],
    ] },
    { key: 'batch', label: 'شماره بچ', length: 3, kind: 'COUNTER' },
  ],
}

const SCHEMES: SchemeDef[] = [TILE, EQUIPMENT, SPARE_PART, RAW_MATERIAL]

async function main() {
  // idempotent: حذف طرحواره‌های سراسری با همین کلیدها و بازسازی (فرزندان cascade می‌شوند)
  for (const s of SCHEMES) {
    await db.codeScheme.deleteMany({ where: { code: s.code, companyId: null } })
    const scheme = await db.codeScheme.create({
      data: {
        code: s.code, name: s.name, description: s.description, itemFamily: s.itemFamily,
        separator: s.separator, motherSegments: s.motherSegments, companyId: null, isActive: true,
      },
    })
    for (const [i, seg] of s.segments.entries()) {
      await db.codeSegment.create({
        data: {
          schemeId: scheme.id, position: i + 1, key: seg.key, label: seg.label,
          length: seg.length, kind: seg.kind, required: true, mapsTo: seg.mapsTo ?? null,
          enumValues: {
            create: (seg.enumValues ?? []).map(([code, label], j) => ({ code, label, sortOrder: j + 1 })),
          },
        },
      })
    }
    const totalLen = s.segments.reduce((n, x) => n + x.length, 0) + s.separator.length * (s.segments.length - 1)
    console.log(`✓ ${s.code} («${s.name}») — ${s.segments.length} جزء، ${totalLen} کاراکتر`)
  }
  const count = await db.codeScheme.count()
  console.log(`\nجمع طرحواره‌ها: ${count}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
