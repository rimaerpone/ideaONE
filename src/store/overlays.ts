import { create } from 'zustand'

/**
 * وضعیت پنجره‌های سراسری پوسته (P1-T25/T27):
 *  - palette: پالت فرمان Ctrl+K
 *  - help: راهنمای میان‌برهای کیبورد («?»)
 * فروشگاه جدا از workspace تا باز/بسته شدن پنل‌ها رندر تب‌ها را تکان ندهد.
 */
type OverlaysState = {
  paletteOpen: boolean
  helpOpen: boolean
  setPalette: (open: boolean) => void
  togglePalette: () => void
  setHelp: (open: boolean) => void
  toggleHelp: () => void
}

export const useOverlays = create<OverlaysState>((set, get) => ({
  paletteOpen: false,
  helpOpen: false,
  setPalette: (open) => set({ paletteOpen: open }),
  togglePalette: () => set({ paletteOpen: !get().paletteOpen }),
  setHelp: (open) => set({ helpOpen: open }),
  toggleHelp: () => set({ helpOpen: !get().helpOpen }),
}))
