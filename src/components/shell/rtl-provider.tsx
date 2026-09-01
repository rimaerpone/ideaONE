'use client'

/**
 * RTL سیستمیک پلتفرم (docs/persian/persian-stack.md)
 *
 * DirectionProvider را به همه کامپوننت‌های Radix می‌رساند (تب/منو/انتخابگر/دیالوگ).
 * بدون این، Radix حتی با dir="rtl" روی <html> پیش‌فرض LTR می‌گیرد —
 * ریشه باگ «ترتیب تب‌ها چپ‌به‌راست» بود (DirectionContext پیش‌فرض 'ltr' است).
 *
 * این فایل باید 'use client' باشد چون @radix-ui/react-direction دایرکتیو
 * سمت-کلاینت ندارد و در Server Component باعث خطای context-in-server-component می‌شود.
 */
import { DirectionProvider } from '@radix-ui/react-direction'

export function RtlProvider({ children }: { children: React.ReactNode }) {
  return <DirectionProvider dir="rtl">{children}</DirectionProvider>
}
