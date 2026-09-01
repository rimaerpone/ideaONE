'use client'

/**
 * رجیستری صفحات رکورد (P2.5-U9) — نگاشت viewKey → کامپوننت صفحه رکورد/فرم.
 *
 * از view-registry جدا شد تا «پنل رکورد نیم‌صفحه» (FCL) بتواند همان کامپوننت‌ها را
 * بدون چرخه import رندر کند — «یک کد، دو قاب»: تب رکورد و پنل کنار فهرست.
 * وابستگی: فقط صفحات رکورد ماژول‌ها + store (بدون نماها/پوسته).
 */
import type { ComponentType } from 'react'
import type { WorkspaceTab } from '@/store/workspace'
import { LetterPage } from '@/modules/office-automation/components/letter-page'
import { ProductPage } from '@/modules/products/components/product-page'
import { WhDocPage } from '@/modules/warehouse/components/whdoc-page'
import { RequestPage } from '@/modules/warehouse/components/request-page'
import { UserPage } from '@/modules/platform/components/user-page'
import { WarehousePage } from '@/modules/warehouse/components/warehouse-page'

export type RecordPageProps = { tab: WorkspaceTab }

/** صفحه رکورد/فرم (تب رکورد — recordId یا 'new') */
export const RECORD_VIEWS: Record<string, ComponentType<RecordPageProps>> = {
  letters: LetterPage,
  whdocs: WhDocPage,
  requests: RequestPage,
  products: ProductPage,
  users: UserPage,
  warehouses: WarehousePage,
}
