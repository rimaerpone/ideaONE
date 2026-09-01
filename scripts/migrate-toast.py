#!/usr/bin/env python3
"""P1-T34 — مهاجرت مکانیکی فراخوانی toast به توابع کمکی یکدست (toastOk/toastErr/toastInfo)

الگوها:
  خط‌تک مخرب با شرح:   toast({ title: X, description: Y, variant: 'destructive' }) → toastErr({ title: X, description: Y })
  خط‌تک مخرب بدون شرح: toast({ title: 'X', variant: 'destructive' })               → toastErr({ description: 'X' })
  خط‌تک معمولی:        toast({ title: X, description: Y })                          → toastOk({ title: X, description: Y })
  خط‌تک فقط عنوان:     toast({ title: X })                                          → toastOk({ title: X })
  چندخطی (بدون variant مخرب در بدنه):                                              toast({ → toastOk({

سپس اصلاح import: `import { toast } from '@/hooks/use-toast'` → فقط helperهای استفاده‌شده.
"""
import re
from pathlib import Path

ROOT = Path('/home/z/my-project/src')
FILES = [
    'modules/platform/components/user-page.tsx',
    'modules/platform/components/my-account.tsx',
    'modules/platform/components/settings-view.tsx',
    'modules/platform/components/modules-view.tsx',
    'modules/warehouse/components/warehouse-page.tsx',
    'hooks/use-realtime.ts',
    'components/shell/header.tsx',
    'modules/office-automation/components/letter-page.tsx',
]

RE_DESTRUCTIVE_DESC = re.compile(r"toast\(\{ title: (.+?), description: (.+?), variant: 'destructive' \}\)")
RE_DESTRUCTIVE_ONLY = re.compile(r"toast\(\{ title: ('[^']+'|\"[^\"]+\"), variant: 'destructive' \}\)")
RE_OK_DESC = re.compile(r"toast\(\{ title: (.+?), description: (.+?) \}\)")
RE_OK_ONLY = re.compile(r"toast\(\{ title: (.+?) \}\)")


def migrate(path: Path) -> bool:
    src = path.read_text()
    out = src

    out = RE_DESTRUCTIVE_DESC.sub(r'toastErr({ title: \1, description: \2 })', out)
    out = RE_DESTRUCTIVE_ONLY.sub(r'toastErr({ description: \1 })', out)

    # چندخطی: فقط toast({ در ابتدای خط → toastOk({ (بدنه بدون variant مخرب بررسی شد)
    out = re.sub(r'(?m)^(\s*)toast\(\{$', r'\1toastOk({', out)

    # خط‌تک معمولی — بعد از چندخطی‌ها تا تداخل نشود
    out = RE_OK_DESC.sub(r'toastOk({ title: \1, description: \2 })', out)
    out = RE_OK_ONLY.sub(r'toastOk({ title: \1 })', out)

    # موارد خاص اطلاع‌رسانی (realtime notification + ماژول مقصد اعلان خاموش)
    out = out.replace('toastOk({ title: n.title, description: n.body ?? undefined })',
                      'toastInfo({ title: n.title, description: n.body ?? undefined })')
    out = re.sub(r'toastOk\(\{\n(\s*)title: \'ماژول مقصد اعلان فعال نیست\'',
                 r'toastInfo({\n\1title: \'ماژول مقصد اعلان فعال نیست\'', out)

    if out == src:
        return False

    # اصلاح import بر اساس helperهای استفاده‌شده
    helpers = [h for h in ('toastOk', 'toastErr', 'toastInfo') if re.search(rf'\b{h}\(', out)]
    imp_old_variants = [
        "import { toast } from '@/hooks/use-toast'",
        'import { toast } from "@/hooks/use-toast"',
    ]
    new_imp = f"import {{ {', '.join(helpers)} }} from '@/hooks/use-toast'"
    for imp in imp_old_variants:
        if imp in out:
            out = out.replace(imp, new_imp)
            break
    else:
        # فایل‌هایی که useToast هم دارند — افزودن helper به import موجود
        m = re.search(r"import \{ (useToast), toast \} from '@/hooks/use-toast'", out)
        if m and helpers:
            out = out.replace(m.group(0), f"import {{ useToast, {', '.join(helpers)} }} from '@/hooks/use-toast'")
        else:
            print(f'  !! import toast در {path.name} پیدا نشد')

    path.write_text(out)
    return True


for rel in FILES:
    p = ROOT / rel
    if not p.exists():
        print(f'-- skip (نبود): {rel}')
        continue
    changed = migrate(p)
    print(f"{'✓' if changed else '·'} {rel}")
