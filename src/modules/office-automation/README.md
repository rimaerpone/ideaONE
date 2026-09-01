# ماژول اتوماسیون اداری (office-automation)

پلاگین همکاری سازمانی — ثبت نامه (وارده/صادره/داخلی)، گردشکار ارجاع/پاسخ/تأیید/بایگانی، کارتابل، پیوست فایل و دستیار AI با HITL.

- سرویس: `service.ts` (listLetters، getLetter، createLetter، actOnLetter، suggestLetterAi، applyLetterAi، پیوست‌ها)
- نماها: `components/` (cartable-view کارتابل، letters-view دفتر مکاتبات، letter-detail-dialog جزئیات و اقدام)
- API: `/api/letters`، `/api/letters/[id]`، `/api/letters/[id]/actions`، `/api/letters/[id]/attachments`، `/api/attachments/[id]`، `/api/ai/letter-assist`، `/api/ai/apply`
- وابستگی هسته: AI Gateway (`core/ai/gateway`) + Storage (`core/storage/storage`) + Feature Flags
- سناریو: `docs/scenarios/SC-001-letter-workflow.md`
- قواعد: نامه «سری» از AI مسدود است · ارجاع فقط به اعضای شرکت نامه · بایگانی پایان جریان است · پیوست حداکثر ۱۰MB با allowlist نوع

> مشخصات کامل (فرم‌ها فیلد‌به‌فیلد، نماها، API، مجوزها): `docs/modules/office-automation/SPEC.md`
