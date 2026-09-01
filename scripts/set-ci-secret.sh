#!/usr/bin/env bash
# scripts/set-ci-secret.sh — CMD-012: ثبت راز DATABASE_URL در Actions (فعال‌سازی job رگرسیون زنده)
# مقدار از .env محلی خوانده می‌شود؛ هرگز چاپ نمی‌شود. رمزنگاری SealedBox با کلید عمومی مخزن.
set -euo pipefail
cd /home/z/my-project

REPO="rimaerpone/ideaONE"
TOKEN=$(git config --get remote.origin.url | sed -E 's#https://([^@]+)@github\.com.*#\1#')
AUTH=(-H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json")
API="https://api.github.com/repos/$REPO"

VALUE=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$VALUE" ] || [[ "$VALUE" != postgres* ]]; then
  echo "ABORT: DATABASE_URL در .env یافت نشد / قالب postgres نیست"
  exit 1
fi
echo "OK: مقدار از .env خوانده شد (طول=${#VALUE})"

echo "==[1] کلید عمومی مخزن =="
KEYJSON=$(curl -s "${AUTH[@]}" "$API/actions/secrets/public-key")
KEY_ID=$(echo "$KEYJSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['key_id'])")
KEY=$(echo "$KEYJSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['key'])")
echo "key_id=$KEY_ID"

echo "==[2] رمزنگاری و ثبت راز =="
ENC=$(python3 -c "
from nacl import encoding, public
pk = public.PublicKey('$KEY'.strip(), encoding.Base64Encoder())
sealed = public.SealedBox(pk).encrypt(b'''$VALUE''')
print(encoding.Base64Encoder().encode(sealed).decode())
")
RES=$(curl -s -w "\n%{http_code}" -X PUT "${AUTH[@]}" "$API/actions/secrets/DATABASE_URL" \
  -d "{\"encrypted_value\":\"$ENC\",\"key_id\":\"$KEY_ID\"}")
CODE=$(echo "$RES" | tail -1)
echo "PUT status: $CODE"
if [ "$CODE" != "204" ] && [ "$CODE" != "201" ]; then echo "$RES" | head -n -1 | head -c 300; exit 1; fi

echo "==[3] راستی‌آزمایی (نام‌ها) =="
curl -s "${AUTH[@]}" "$API/actions/secrets" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('secrets:', [s['name'] for s in d.get('secrets',[])])"
echo "DONE ✓"
