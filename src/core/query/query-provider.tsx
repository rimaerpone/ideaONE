'use client'

import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from './query-client'

/** تأمین‌کننده کش سرور — فقط پوسته برنامه (بعد از ورود) نیاز دارد */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
