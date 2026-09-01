(() => {
  const out = {};
  const ths = [...document.querySelectorAll('th')].map(th => ({ t: th.textContent.trim().slice(0, 12), align: getComputedStyle(th).textAlign }));
  out.ths = ths;
  const tds = [...document.querySelectorAll('tbody tr:first-child td')].slice(0, 4).map(td => ({ t: td.textContent.trim().slice(0, 12), align: getComputedStyle(td).textAlign }));
  out.firstRowTds = tds;
  const pagerBtns = [...document.querySelectorAll('button[aria-label]')].filter(b => b.getAttribute('aria-label').includes('صفحه')).map(b => ({ label: b.getAttribute('aria-label'), x: Math.round(b.getBoundingClientRect().x) }));
  out.pager = pagerBtns;
  const tabs = [...document.querySelectorAll('[role=tab]')].map(t => ({ t: t.textContent.trim().slice(0, 14), x: Math.round(t.getBoundingClientRect().x) }));
  out.tabs = tabs;
  const svg = document.querySelector('.recharts-wrapper svg');
  if (svg) {
    out.chart = {
      yTickX: [...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text')].slice(0, 2).map(t => Math.round(t.getBoundingClientRect().x)),
      xTickX: [...document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick text')].slice(0, 5).map(t => Math.round(t.getBoundingClientRect().x)),
      legendItemX: [...document.querySelectorAll('.recharts-legend-wrapper .recharts-legend-item')].map(li => Math.round(li.getBoundingClientRect().x)),
    };
  }
  return JSON.stringify(out);
})()
