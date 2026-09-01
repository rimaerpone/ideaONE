import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { RtlProvider } from '@/components/shell/rtl-provider'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const vazirmatn = localFont({
  src: [
    { path: './fonts/Vazirmatn-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Vazirmatn-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Vazirmatn-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-vazirmatn',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'پلتفرم عملیاتی سازمانی | هلدینگ کاشی و سرامیک',
  description:
    'پایلوت ۹۰ روزه پلتفرم عملیاتی سازمانی پلاگین‌محور — کارتابل، اتوماسیون اداری، انبار و مستر دیتای هلدینگ کاشی و سرامیک',
  keywords: ['پلتفرم سازمانی', 'اتوماسیون اداری', 'انبار', 'کارتابل', 'کاشی و سرامیک'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazirmatn.variable} font-sans antialiased bg-background text-foreground`}>
        {/* RTL سیستمیک: بدون این، کامپوننت‌های Radix (تب/منو/انتخابگر) پیش‌فرض LTR می‌شوند
            حتی وقتی html دارای dir=rtl است — ریشه باگ «ترتیب تب‌ها چپ‌به‌راست» بود */}
        <RtlProvider>
          {children}
          <Toaster />
        </RtlProvider>
      </body>
    </html>
  )
}
