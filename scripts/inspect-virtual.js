(() => {
  const table = document.querySelector('table')
  const inner = table.parentElement          // div داخلی شادکن
  const outer = inner.parentElement          // div اسکرول ما (max-h)
  const tbody = table.querySelector('tbody')
  return JSON.stringify({
    outerClass: outer.className.slice(0, 120),
    scrollable: outer.scrollHeight > outer.clientHeight,
    scrollH: outer.scrollHeight,
    clientH: outer.clientHeight,
    dataTr: tbody ? tbody.querySelectorAll('tr:not([aria-hidden])').length : -1,
    spacerTr: tbody ? tbody.querySelectorAll('tr[aria-hidden]').length : -1,
    firstSpacerH: tbody && tbody.querySelector('tr[aria-hidden]') ? tbody.querySelector('tr[aria-hidden]').style.height : 'none',
  })
})()
