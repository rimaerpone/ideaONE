'use client'

import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { useApp } from '@/store/app'
import { useToast, toastInfo } from '@/hooks/use-toast'
import { readSessionToken } from '@/core/shared/api-client'

/**
 * اتصال بلادرنگ به سرویس socket.io (پورت 3003 از طریق گیت‌وی Caddy).
 *
 * جریان امن ثبت‌نام:
 *  ۱) اتصال سوکت برقرار می‌شود
 *  ۲) بلیت امضاشده از /api/realtime/ticket (مبتنی بر نشست httpOnly) گرفته می‌شود
 *  ۳) با بلیت، در اتاق «user:<id>» ثبت‌نام می‌کنیم — سرور سوکت بلیت را با HMAC
 *     خودش راستی‌آزمایی می‌کند؛ یعنی هیچ کاربری نمی‌تواند اعلان دیگری را شنود کند.
 *
 * تاب‌آوری: اگر سوکت قطع شود، اتصال خودکار دوباره برقرار می‌شود و در فاصله قطعی،
 * polling هدر (هر ۳۰ ثانیه) اعلان‌ها را به‌روز نگه می‌دارد — دست‌کم یک‌بار تحویل.
 */
export function useRealtime() {
  const me = useApp((s) => s.me)
  const bumpRt = useApp((s) => s.bumpRt)
  const setRtConnected = useApp((s) => s.setRtConnected)
  useToast()

  const userId = me?.user?.id

  useEffect(() => {
    if (!userId) {
      setRtConnected(false)
      return
    }

    // ⚠️ آدرس و مسیر ثابت است — گیت‌وی با XTransformPort به پورت 3003 فوروارد می‌کند.
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 8000,
      forceNew: true,
    })

    const register = async () => {
      try {
        // هدر توکن نشست برای بافت تعبیه‌شده — همان پشتیبان api-client
        const token = readSessionToken()
        const res = await fetch('/api/realtime/ticket', {
          cache: 'no-store',
          headers: token ? { 'x-session-token': token } : undefined,
        })
        if (!res.ok) return
        const { ticket } = (await res.json()) as { ticket?: string }
        if (ticket) socket.emit('register', { userId, ticket })
      } catch {
        /* در اتصال بعدی دوباره تلاش می‌شود */
      }
    }

    socket.on('connect', () => {
      void register()
    })

    socket.on('registered', () => {
      setRtConnected(true)
    })

    socket.on('register-error', () => {
      setRtConnected(false)
      // بلیت نامعتبر/منقضی — تلاش مجدد با بلیت تازه
      setTimeout(() => {
        if (socket.connected) void register()
      }, 3000)
    })

    socket.on('notification', (n: { title?: string; body?: string | null; targetView?: string | null }) => {
      // بروزرسانی فوری زنگ اعلان‌ها در هدر + ابطال هدفمند کش سرور (P1-T2)
      bumpRt(n?.targetView)
      // بازخورد بصری به کاربر
      if (n?.title) {
        toastInfo({ title: n.title, description: n.body ?? undefined })
      }
    })

    socket.on('disconnect', () => {
      setRtConnected(false)
    })

    return () => {
      setRtConnected(false)
      socket.disconnect()
    }
    // فقط هویت کاربر ملاک اتصال است — تغییر شرکت اتصال را بازتنظیم نمی‌کند
  }, [userId])
}
