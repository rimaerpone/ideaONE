# ماژول انبار و لجستیک (warehouse)

پلاگین عملیات انبار — موجودی به تفکیک تون/کالیبر/درجه، اسناد رسید/حواله/انتقال/شمارش با قطعی‌سازی تراکنشی و کنترل موجودی منفی، و گردشکار درخواست کالا.

- سرویس‌ها: `service.ts` (اسناد و موجودی) + منطق اعمال سند: `warehouse.ts` (applyDocToStock) + `requests.ts` (درخواست کالا: listRequests، createRequest، decideRequest)
- نماها: `components/` (stock-view موجودی، whdocs-view اسناد، requests-view درخواست‌ها)
- API: `/api/whdocs`، `/api/whdocs/decide`، `/api/stock`، `/api/warehouses`، `/api/requests`
- سناریوها: `docs/scenarios/SC-002-warehouse-posting.md` و `docs/scenarios/SC-003-goods-request.md`
- قواعد: قطعی‌سازی فقط مدیر/کارشناس · سند قطعی قابل ابطال نیست (پایلوت) · موجودی منفی ممنوع · درخواست تأمین‌شده حواله صادر می‌کند

> مشخصات کامل (فرم‌ها فیلد‌به‌فیلد، نماها، API، مجوزها): `docs/modules/warehouse/SPEC.md`
