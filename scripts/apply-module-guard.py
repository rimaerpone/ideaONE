#!/usr/bin/env python3
# P1-T28 — اعمال گارد requireModule در همه مسیرهای API ماژول‌های عملیاتی
# الگو: import { requireCtx } → requireModule؛ فراخوانی requireCtx() → requireModule('<code>')
import re, sys

ROUTES = {
    'src/app/api/letters/route.ts': 'office-automation',
    'src/app/api/letters/[id]/route.ts': 'office-automation',
    'src/app/api/letters/[id]/actions/route.ts': 'office-automation',
    'src/app/api/letters/[id]/attachments/route.ts': 'office-automation',
    'src/app/api/attachments/[id]/route.ts': 'office-automation',
    'src/app/api/whdocs/route.ts': 'warehouse',
    'src/app/api/whdocs/decide/route.ts': 'warehouse',
    'src/app/api/whdocs/[id]/route.ts': 'warehouse',
    'src/app/api/requests/route.ts': 'warehouse',
    'src/app/api/requests/[id]/route.ts': 'warehouse',
    'src/app/api/stock/route.ts': 'warehouse',
    'src/app/api/warehouses/route.ts': 'warehouse',
    'src/app/api/products/route.ts': 'products',
    'src/app/api/partners/route.ts': 'partners',
}

BASE = '/home/z/my-project/'
changed, skipped = [], []
for path, code in ROUTES.items():
    full = BASE + path
    try:
        src = open(full, encoding='utf-8').read()
    except FileNotFoundError:
        skipped.append((path, 'NOT FOUND'))
        continue
    orig = src
    # ۱) import — فقط requireCtx را درون آکولاد جایگزین می‌کنیم (jsonError و بقیه دست‌نخورده)
    src = src.replace('import { requireCtx } from', 'import { requireModule } from')
    src = re.sub(r'import \{ requireCtx, ', 'import { requireModule, ', src)
    src = re.sub(r', requireCtx \}', ', requireModule }', src)
    src = re.sub(r'import \{ (.*?), requireCtx, (.*?) \}', r'import { \1, requireModule, \2 }', src)
    # ۲) فراخوانی
    src = src.replace('await requireCtx()', f"await requireModule('{code}')")
    if src != orig:
        open(full, 'w', encoding='utf-8').write(src)
        # راستی‌آزمایی: هیچ requireCtx باقی نمانده باشد
        if 'requireCtx' in src:
            skipped.append((path, 'RESIDUAL requireCtx'))
        else:
            changed.append((path, code))
    else:
        skipped.append((path, 'NO MATCH'))

print(f'{len(changed)} مسیر گارد شد:')
for p, c in changed:
    print(f'  [{c}] {p}')
if skipped:
    print(f'{len(skipped)} مسیر رد/مشکل:')
    for p, why in skipped:
        print(f'  ({why}) {p}')
    sys.exit(1)
