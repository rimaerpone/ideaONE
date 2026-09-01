#!/bin/bash
# ممیزی موبایل ۳90px (P1-T32) v5 — ناوبری قطعی: تزریق تب در sessionStorage + reload
set -u
OUT=/home/z/my-project/download/qa-p1-t32
mkdir -p "$OUT"

# viewKey:icon:slug — همه نماها از رجیستری view-meta
VIEWS=(
  "dashboard:LayoutDashboard:dashboard"
  "modules:Puzzle:modules"
  "settings:Settings:settings"
  "users:Users:users"
  "products:Package:products"
  "partners:Users:partners"
  "cartable:Inbox:cartable"
  "letters:Mail:letters"
  "stock:Boxes:stock"
  "whdocs:ClipboardCheck:whdocs"
  "requests:ClipboardList:requests"
  "warehouses:Archive:warehouses"
  "my-account:UserRound:account"
)

LABELS='{"dashboard":"داشبورد","modules":"کاتالوگ پلاگین‌ها","settings":"تنظیمات","users":"کاربران","products":"محصولات","partners":"شرکا","cartable":"کارتابل","letters":"نامه‌ها","stock":"موجودی انبار","whdocs":"اسناد انبار","requests":"درخواست کالا","warehouses":"انبارها","my-account":"حساب من"}'

echo "نما | وضعیت"
for ENTRY in "${VIEWS[@]}"; do
  VK="${ENTRY%%:*}"
  REST="${ENTRY#*:}"
  ICON="${REST%%:*}"
  SLUG="${REST##*:}"
  # تزریق تک‌تب و رفرش
  agent-browser eval "(window.__nav = '$VK') && (function(){ const label = $LABELS['$VK']; window.sessionStorage.setItem('io.workspace.v1', JSON.stringify({ tabs: [{ id: 'list:$VK', kind: 'list', viewKey: '$VK', title: label, icon: '$ICON' }], activeTabId: 'list:$VK' })); return 'set:$VK' })()" >/dev/null 2>&1
  agent-browser open http://localhost:81/ >/dev/null 2>&1
  sleep 4
  RES=$(agent-browser eval "(() => {
    const doc = document.documentElement
    const overflowX = doc.scrollWidth > window.innerWidth + 1
    const main = document.querySelector('main')
    const h1 = main ? main.querySelector('h1,h2') : null
    const tableInMain = main ? main.querySelector('table') : null
    const activeTab = document.querySelector('[role=tab][aria-selected=true]')
    return JSON.stringify({ overflowX, scrollW: doc.scrollWidth, active: activeTab ? activeTab.textContent.trim().slice(0,16) : '-', heading: h1 ? h1.textContent.trim().slice(0,28) : '-', tableRows: tableInMain ? tableInMain.querySelectorAll('tbody tr').length : 0 })
  })()" 2>/dev/null)
  echo "$VK | $RES"
  agent-browser screenshot "$OUT/$SLUG.png" >/dev/null 2>&1
done
echo "تمام"