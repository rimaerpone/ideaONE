#!/usr/bin/env bash
# scripts/publicize-and-protect.sh — CMD-012: عمومی‌سازی مخزن + branch protection (دروازهٔ کیفیت روی main)
# توکن از git config خوانده می‌شود و هرگز چاپ نمی‌شود.
set -euo pipefail
cd /home/z/my-project

REPO="rimaerpone/ideaONE"
TOKEN=$(git config --get remote.origin.url | sed -E 's#https://([^@]+)@github\.com.*#\1#')
if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 20 ]; then
  echo "ABORT: توکن از remote.origin.url قابل استخراج نبود (طول=${#TOKEN})"
  exit 1
fi
AUTH=(-H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
API="https://api.github.com/repos/$REPO"
J() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

echo "==[1] وضعیت فعلی مخزن =="
VIS=$(curl -s "${AUTH[@]}" "$API" | J "d.get('private','ERR:'+str(d.get('message')))")
echo "private=$VIS (اگر پیام خطا بود: توکن/دسترسی)"
if [[ "$VIS" == "ERR"* ]]; then
  curl -s "${AUTH[@]}" "$API" | J "d.get('message')" ; exit 1
fi

if [ "$VIS" = "False" ]; then
  echo "==[2] مخزن از قبل عمومی است — رد می‌شود =="
else
  echo "==[2] عمومی‌سازی (PATCH private=false) =="
  RES=$(curl -s -X PATCH "${AUTH[@]}" "$API" -d '{"private":false}')
  echo "$RES" | J "f'private={d.get(\"private\")} · visibility={d.get(\"visibility\")} · msg={d.get(\"message\",\"\")}'"
  if [ "$(echo "$RES" | J "d.get('private')")" != "False" ]; then
    echo "ABORT: عمومی‌سازی ناموفق"; exit 1
  fi
fi

echo "==[3] فعال‌سازی branch protection روی main =="
# enforce_admins=false → توکن مالک (ادمین) همچنان push مستقیم دارد؛ بقیه باید از PR+CI سبز بگذرند
BODY=$(cat <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["کیفیت (check + tsc + lint + unit)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
)
RES=$(curl -s -w "\n%{http_code}" -X PUT "${AUTH[@]}" "$API/branches/main/protection" -d "$BODY")
CODE=$(echo "$RES" | tail -1)
BODYJ=$(echo "$RES" | head -n -1)
echo "HTTP $CODE"
if [ "$CODE" != "200" ]; then
  echo "$BODYJ" | J "d.get('message','')" ; echo "$BODYJ" | head -c 400; echo; exit 1
fi
echo "$BODYJ" | J "f'enforcement=فعال · strict={d[\"required_status_checks\"][\"strict\"]} · enforce_admins={d[\"enforce_admins\"][\"enabled\"]} · contextها={d[\"required_status_checks\"][\"contexts\"]}'"

echo "==[4] راستی‌آزمایی نهایی =="
curl -s "${AUTH[@]}" "$API" | J "f'repo: private={d[\"private\"]} · visibility={d[\"visibility\"]} · default={d[\"default_branch\"]}'"
curl -s "${AUTH[@]}" "$API/branches/main/protection" | J "f'protection: enforced contexts={d[\"required_status_checks\"][\"contexts\"]}'"
echo "DONE ✓"
