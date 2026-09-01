'use client'

/**
 * پنل رکورد نیم‌صفحه — FCL نسل ۲ (P2.5-U9 — پژوهش ۰۲ §۳-ت۱ و §۴-B #۸..#۱۰)
 *
 * الگوی Fiori Flexible Column Layout: کلیک ردیف در دسکتاپ = «قاب رکورد کامل»
 * در ~۵۰٪ عرض کنار فهرست زنده (نه خلاصه فقط-خواندنی U4 و نه تب جدید).
 *   - «یک کد، دو قاب»: همان کامپوننت صفحه رکورد (RECORD_VIEWS) هم در تب رکورد
 *     رندر می‌شود و هم داخل این پنل — بدون کپی/شاخه رفتاری.
 *   - سه سطح عرض (#۹): باریک ۳۲۰–۵۶۰ (U4) / نیم ~۵۰٪ (U9) / تمام‌صفحه = تب.
 *     انتخاب per-view ماندگار در io.ui.v1 (pv:<view> {open, width, mode}).
 *   - جهت طبیعی RTL (#۱۰): در flex-row راست‌به‌چپ فهرست راست، پنل چپ می‌نشیند.
 *   - فرم در پنل نیست (#۱۱ فاز ۲): رکورد فقط با recordId واقعی باز می‌شود.
 *
 * نحوی استفاده (نما): state پنل نزد نما می‌ماند (usePreviewPanel) تا DataGrid
 * همان را ببیند؛ این کامپوننت فقط رندر می‌کند.
 */
import { type ReactNode } from 'react'
import { PreviewPanel, type PanelMode } from '@/components/common/preview-panel'
import { EmbeddedRecordProvider } from '@/components/common/record-page-shell'
import { RECORD_VIEWS } from '@/components/shell/record-views'
import { type WorkspaceTab } from '@/store/workspace'
import { viewIcon, viewLabel } from '@/core/shared/view-meta'

/** خروجی usePreviewPanel — به‌عنوان prop تا نما و پنل یک state واحد ببینند */
export type PreviewPanelState = {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  width: number
  setWidth: (w: number) => void
  mode: PanelMode
  setMode: (m: PanelMode) => void
}

export function FclRecordPane({
  viewKey,
  recordId,
  title,
  badges,
  onClose,
  onOpenFull,
  emptyHint,
  children,
  panel,
}: {
  /** نما مالک — رکورد از RECORD_VIEWS[viewKey] رندر می‌شود */
  viewKey: string
  /** رکورد انتخاب‌شده (null = پنل باز بدون رکورد — راهنمای شروع) */
  recordId: string | null
  title: ReactNode
  badges?: ReactNode
  onClose: () => void
  /** تمام‌صفحه — تب رکورد (رفتار موجود) */
  onOpenFull: () => void
  emptyHint?: string
  /** محتوای حالت باریک — خلاصه فقط-خواندنی U4 */
  children?: ReactNode
  /** state مشترک پنل (از usePreviewPanel نما) */
  panel: PreviewPanelState
}) {
  return (
    <PreviewPanel
      title={title}
      badges={badges}
      onClose={onClose}
      onOpenFull={onOpenFull}
      width={panel.width}
      onWidthChange={panel.setWidth}
      mode={panel.mode}
      onModeChange={panel.setMode}
      emptyHint={recordId ? undefined : (emptyHint ?? 'روی یک ردیف از فهرست کلیک کنید یا با ↑↓ و Space پیمایش کنید.')}
      recordContent={recordId ? <FclRecordHost viewKey={viewKey} recordId={recordId} /> : null}
    >
      {children}
    </PreviewPanel>
  )
}

/**
 * میزبان رکورد داخل پنل — همان کامپوننت صفحه رکورد با تب ساختگی:
 *  - id ساختگی fcl:* در workspace ثبت نمی‌شود (setTabTitle نامه بی‌اثر می‌شود)
 *  - key={recordId}: تغییر ردیف = ریمانت تازه (state داخلی مثل تب داخلی ریست)
 *  - EmbeddedRecordProvider: بردکرامب/«بستن تب» صفحه رکورد در قاب مخفی می‌شوند
 */
function FclRecordHost({ viewKey, recordId }: { viewKey: string; recordId: string }) {
  const Page = RECORD_VIEWS[viewKey]

  if (!Page) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm font-medium">رکورد «{viewLabel(viewKey)}» در پنل باز نمی‌شود</p>
        <p className="mt-1.5 text-xs text-muted-foreground">این نما صفحه رکورد مستقل ندارد؛ از حالت باریک استفاده کنید.</p>
      </div>
    )
  }

  const tab: WorkspaceTab = {
    id: `fcl:${viewKey}:${recordId}`,
    kind: 'record',
    viewKey,
    recordId,
    title: viewLabel(viewKey),
    icon: viewIcon(viewKey),
  }

  return (
    <EmbeddedRecordProvider value={true}>
      <Page key={recordId} tab={tab} />
    </EmbeddedRecordProvider>
  )
}
