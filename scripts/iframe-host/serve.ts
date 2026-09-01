// @ts-nocheck — اسکریپت ابزار تست (بدون وابستگی تایپ)
// میزبان ایستای صفحه wrapper برای تست iframe سایت‌متقاطع — پورت 3005
// (node:http عمداً — CH-09 اجازه import مستقیم bun بدون تعریف پکیج را نمی‌دهد)
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const HTML = readFileSync('/home/z/my-project/scripts/iframe-host/wrapper.html', 'utf-8')

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML)
    return
  }
  res.writeHead(404)
  res.end('Not Found')
}).listen(3005, () => console.log('iframe host on http://localhost:3005/'))
