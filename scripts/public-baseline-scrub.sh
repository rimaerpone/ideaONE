#!/usr/bin/env bash
# scripts/public-baseline-scrub.sh — CMD-012: پاک‌سازی محرمانه‌ها + بستهٔ پشتیبان تاریخ + خط پایهٔ orphan
# اجرا فقط یک‌بار (idempotent-guard دارد). فایل‌های محلی هرگز حذف نمی‌شوند — فقط از ایندکس گیت خارج می‌شوند.
set -euo pipefail
cd /home/z/my-project

echo "==[0] گارد تکرارپذیری =="
if git show-ref --verify --quiet refs/heads/archive/pre-public-history; then
  echo "ABORT: archive/pre-public-history از قبل وجود دارد — اسکریپت قبلاً اجرا شده"
  exit 1
fi
DIRTY=$(git status --short | wc -l)
if [ "$DIRTY" -ne 0 ]; then
  echo "ABORT: درخت کثیف است ($DIRTY فایل) — اول کامیت یا stash"
  git status --short | head -5
  exit 1
fi
echo "OK: درخت تمیز، HEAD=$(git rev-parse --short HEAD)"

echo "==[1] ref محلی برای تاریخ کامل (pre-scrub) =="
git branch archive/pre-public-history
git rev-parse --short archive/pre-public-history

echo "==[2] untrack محرمانه‌ها (فایل محلی می‌ماند) =="
git rm -r --cached -q download archive research worklog.md "upload/ideaone idea.txt" "upload/دستورالعمل کدگذاری محصولات 3.docx"
echo "untracked: $(git status --short | wc -l) مسیر"

echo "==[3] به‌روزرسانی .gitignore =="
cat >> .gitignore <<'EOF'

# ۱۴۰۵/۰۶/۱۱ — خط پایهٔ عمومی (CMD-012): اسناد محرمانهٔ کسب‌وکار هرگز در مخزن عمومی
# فایل‌ها محلی می‌مانند؛ بازیافت تاریخ کامل: ref محلی archive/pre-public-history + bundle در db/snapshots
upload/*
!upload/module-list.md
/download/
/archive/
/research/
/worklog.md
EOF

echo "==[4] کامیت پاک‌سازی روی تاریخ فعلی =="
git add .gitignore scripts/public-baseline-scrub.sh
git commit -q -m "chore(security): جداسازی اسناد محرمانهٔ کسب‌وکار از گیت پیش از خط پایهٔ عمومی (CMD-012)

- untrack: upload/{idea,docx کدگذاری} · download/ · archive/ · research/ · worklog.md
- لیست‌سفید: upload/module-list.md (وابستگی validate-modules + seed)
- تاریخ کامل: archive/pre-public-history + bundle (db/snapshots)"
git rev-parse --short HEAD

echo "==[5] بستهٔ پشتیبان تاریخ کامل =="
BUNDLE="db/snapshots/ideaONE-history-pre-public-$(date +%Y%m%d-%H%M).bundle"
mkdir -p db/snapshots
git bundle create "$BUNDLE" --all
git bundle verify "$BUNDLE" | tail -2
echo "BUNDLE_PATH=$BUNDLE"

echo "==[6] خط پایهٔ orphan (یک کامیت تمیز) =="
git checkout -q --orphan public-baseline
git add -A
git commit -q -m "feat: خط پایهٔ عمومی ideaONE (Public Baseline) — سورس + مستندات + CI

پاک‌سازی‌شده از محرمانه‌ها طبق CMD-012. تاریخ کامل توسعهٔ ۱۲۶ کامیت
به‌صورت محلی در archive/pre-public-history و bundle نگهداری می‌شود.
پیش از این: P0.5 کامل (T1 تراکنش اتمیک انبار/نامه · T2 رجیستری ۳۳+CMD-011 ·
T3 scrypt/rate-limit/CSRF/CI) — جزئیات در docs/ و ADR/CMD."
git branch -M main
echo "new main: $(git rev-parse --short HEAD) — files: $(git ls-files | wc -l)"

echo "==[7] راستی‌آزمایی محرمانگی درخت جدید =="
LEAKS=$(git ls-files | grep -cE "^download/|^archive/|^research/|^worklog\.md$|^upload/idea|^upload/دستور" || true)
echo "leak-check: $LEAKS فایل محرمانه (باید ۰ باشد)"
if [ "$LEAKS" -ne 0 ]; then
  echo "ABORT: نشت در خط پایه!"
  git ls-files | grep -E "^download/|^archive/|^research/|^worklog\.md$" | head -5
  exit 1
fi
git ls-files upload/
echo "OK: خط پایه تمیز است"
