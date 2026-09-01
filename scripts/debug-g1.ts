#!/usr/bin/env tsx
/** دیباگ G1 با ثبت جزئیات هر گام */
import { ab, ev, wait, shot, login, navigate, switchCompanyUI } from './e2e-golden-helpers'

async function main() {
  console.log('close:', ab('close', 15000))
  const t0 = Date.now()

  // ورود admin با لاگ کامل
  ab('open http://localhost:81/ --wait networkidle', 90000)
  wait(2000)
  console.log('t+' + (Date.now() - t0) + 'ms already:', JSON.stringify(ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`)))
  for (let attempt = 0; attempt < 3; attempt++) {
    const filled = ev(`(function(){
      const u = document.getElementById('username')
      const p = document.getElementById('password')
      if (!u || !p) return 'inputs-not-found'
      const proto = window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(u, 'admin')
      u.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(p, 'admin123')
      p.dispatchEvent(new Event('input', { bubbles: true }))
      return u.value === 'admin' && p.value === 'admin123'
    })()`)
    console.log('t+' + (Date.now() - t0) + 'ms attempt', attempt, 'filled:', JSON.stringify(filled))
    if (filled !== true) { wait(1800); continue }
    const clicked = ev(`(function(){ const btn = Array.from(document.querySelectorAll('button')).find(b => b.type === 'submit' || (b.textContent || '').trim() === 'ورود'); if (btn) { btn.click(); return true } return false })()`)
    console.log('t+' + (Date.now() - t0) + 'ms clicked:', JSON.stringify(clicked))
    for (let i = 0; i < 6; i++) {
      wait(1500)
      const nav = ev(`!!document.querySelector('nav[aria-label="ناوبری اصلی"]')`)
      console.log('t+' + (Date.now() - t0) + 'ms nav-check', i, ':', JSON.stringify(nav))
      if (nav === true) { console.log('SUCCESS'); return }
    }
    const formGone = ev(`!document.body.innerText.includes('ورود به سامانه')`)
    console.log('t+' + (Date.now() - t0) + 'ms formGone:', JSON.stringify(formGone))
    if (formGone === true) { console.log('FORM GONE — stopping'); return }
    wait(1500)
  }
  console.log('FAILED after all attempts')
  shot('debug-g1-login-failed')
}

main()
