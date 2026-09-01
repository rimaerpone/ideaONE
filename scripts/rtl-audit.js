(() => {
  const out = {};
  const aside = document.querySelector('aside');
  if (aside) { const r = aside.getBoundingClientRect(); out.sidebar = { left: Math.round(r.left), rightGap: Math.round(window.innerWidth - r.right), w: Math.round(r.width) }; }
  const navBtn = document.querySelector('nav button');
  if (navBtn) { out.firstNavItemX = Math.round(navBtn.getBoundingClientRect().x); }
  const th = document.querySelector('th');
  if (th) { out.th = { text: th.textContent.slice(0, 20), textAlign: getComputedStyle(th).textAlign, dir: getComputedStyle(th).direction }; }
  const prog = document.querySelector('[data-slot=progress-indicator], [role=progressbar] > div');
  if (prog) { const r = prog.getBoundingClientRect(); const p = prog.parentElement.getBoundingClientRect(); out.progress = { indicatorLeft: Math.round(r.left - p.left), parentW: Math.round(p.width) }; }
  const svg = document.querySelector('.recharts-wrapper svg');
  if (svg) {
    out.chart = {
      yTickX: [...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text')].slice(0, 3).map(t => Math.round(t.getBoundingClientRect().x)),
      xTickX: [...document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick text')].slice(0, 5).map(t => Math.round(t.getBoundingClientRect().x)),
      legendItemX: [...document.querySelectorAll('.recharts-legend-wrapper .recharts-legend-item')].map(li => Math.round(li.getBoundingClientRect().x)),
    };
  }
  const searchIcon = document.querySelector('div.relative svg.lucide-search');
  if (searchIcon) { const r = searchIcon.getBoundingClientRect(); const wrap = searchIcon.closest('div.relative').getBoundingClientRect(); out.searchIcon = { x: Math.round(r.x - wrap.x), wrapW: Math.round(wrap.width) }; }
  return JSON.stringify(out);
})()
