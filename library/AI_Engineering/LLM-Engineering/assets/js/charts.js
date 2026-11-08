/* Tiny dependency-free SVG chart renderer.
 * Usage:
 *   <figure class="chart"><div class="chart-root"></div>
 *     <script type="application/json" class="chart-spec">{...}</script>
 *     <figcaption>…</figcaption></figure>
 * Spec: { height, x:{label,log,min,max,fmt,ticks}, y:{...},
 *         series:[{name,color:"s1",points:[[x,y,"label"],…],line:true,dash:false,labels:true}],
 *         notes:[{x,y,text,anchor}], hlines:[{y,text}], vlines:[{x,text}] }
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 720, M = { l: 64, r: 24, t: 16, b: 48 };

  function mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(v, f) {
    if (f === 'year') return String(Math.round(v));
    if (f === 'pct') return Math.round(v * 100) + '%';
    if (typeof f === 'string' && f.startsWith('suffix:')) return fmtNum(v) + f.slice(7);
    return fmtNum(v);
  }
  function fmtNum(v) {
    const a = Math.abs(v);
    if (a >= 1e15) return v.toExponential(1).replace('e+', 'e');
    if (a >= 1e12) return +(v / 1e12).toPrecision(3) + 'T';
    if (a >= 1e9) return +(v / 1e9).toPrecision(3) + 'B';
    if (a >= 1e6) return +(v / 1e6).toPrecision(3) + 'M';
    if (a >= 1e4) return +(v / 1e3).toPrecision(3) + 'k';
    if (a >= 1000) return String(Math.round(v));
    if (a > 0 && a < 0.01) return v.toExponential(0);
    return String(+v.toPrecision(3));
  }
  function scale(ax, lo, hi) {
    const log = !!ax.log;
    const f = log ? Math.log10 : (x => x);
    const a = f(ax.min), b = f(ax.max);
    return x => lo + (f(x) - a) / (b - a) * (hi - lo);
  }
  function ticks(ax) {
    if (ax.ticks) return ax.ticks;
    if (ax.log) {
      const out = []; for (let p = Math.ceil(Math.log10(ax.min) - 1e-9); p <= Math.floor(Math.log10(ax.max) + 1e-9); p++) out.push(Math.pow(10, p));
      return out;
    }
    const span = ax.max - ax.min, step0 = Math.pow(10, Math.floor(Math.log10(span / 5)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * step0).find(s => span / s <= 7);
    const out = []; for (let v = Math.ceil(ax.min / step) * step; v <= ax.max + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function render(fig) {
    const specEl = fig.querySelector('script.chart-spec'); if (!specEl) return;
    let spec; try { spec = JSON.parse(specEl.textContent); } catch (e) { console.error('bad chart spec', e); return; }
    const host = fig.querySelector('.chart-root') || fig.insertBefore(document.createElement('div'), specEl);
    host.className = 'chart-root'; host.innerHTML = '';
    const H = spec.height || 360;
    const x = scale(spec.x, M.l, W - M.r), y = scale(spec.y, H - M.b, M.t);

    if (spec.series.length > 1) {
      const lg = document.createElement('div'); lg.className = 'chart-legend';
      spec.series.forEach(s => { const d = document.createElement('span'); d.innerHTML = '<i style="background:var(--' + (s.color || 's1') + ')"></i>' + s.name; lg.appendChild(d); });
      host.appendChild(lg);
    }
    const svg = mk('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': spec.title || 'chart' }, host);
    const gAx = mk('g', { class: 'axis' }, svg);
    ticks(spec.y).forEach(v => {
      const yy = y(v); mk('line', { x1: M.l, x2: W - M.r, y1: yy, y2: yy, class: 'gridline' }, gAx);
      const t = mk('text', { x: M.l - 8, y: yy + 4, 'text-anchor': 'end' }, gAx); t.textContent = fmt(v, spec.y.fmt);
    });
    ticks(spec.x).forEach(v => {
      const xx = x(v); mk('line', { x1: xx, x2: xx, y1: H - M.b, y2: H - M.b + 5 }, gAx);
      const t = mk('text', { x: xx, y: H - M.b + 18, 'text-anchor': 'middle' }, gAx); t.textContent = fmt(v, spec.x.fmt);
    });
    mk('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }, gAx);
    mk('line', { x1: M.l, x2: M.l, y1: M.t, y2: H - M.b }, gAx);
    if (spec.x.label) { const t = mk('text', { x: (M.l + W - M.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-title' }, svg); t.textContent = spec.x.label; }
    if (spec.y.label) { const t = mk('text', { x: 14, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 14 ' + (M.t + H - M.b) / 2 + ')' }, svg); t.textContent = spec.y.label; }

    (spec.hlines || []).forEach(h => {
      const yy = y(h.y); mk('line', { x1: M.l, x2: W - M.r, y1: yy, y2: yy, stroke: 'var(--muted)', 'stroke-dasharray': '5 4' }, svg);
      if (h.text) { const t = mk('text', { x: W - M.r - 4, y: yy - 5, 'text-anchor': 'end', class: 'pt-label' }, svg); t.textContent = h.text; }
    });
    (spec.vlines || []).forEach(v => {
      const xx = x(v.x); mk('line', { x1: xx, x2: xx, y1: M.t, y2: H - M.b, stroke: 'var(--muted)', 'stroke-dasharray': '5 4' }, svg);
      if (v.text) { const t = mk('text', { x: xx + 5, y: M.t + 12, class: 'pt-label' }, svg); t.textContent = v.text; }
    });

    const tip = document.createElement('div'); tip.className = 'chart-tip'; host.appendChild(tip);
    spec.series.forEach(s => {
      const col = 'var(--' + (s.color || 's1') + ')';
      const pts = s.points.map(p => [x(p[0]), y(p[1]), p]);
      if (s.line !== false && pts.length > 1) {
        mk('path', { d: 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L'), class: 'series-line', stroke: col, 'stroke-dasharray': s.dash ? '6 5' : 'none' }, svg);
      }
      if (s.markers !== false) pts.forEach(([px, py, p]) => {
        const c = mk('circle', { cx: px, cy: py, r: s.r || 4.5, fill: col, class: 'pt' }, svg);
        const hit = mk('circle', { cx: px, cy: py, r: 12, fill: 'transparent' }, svg);
        const label = (p[2] ? p[2] + ': ' : '') + fmt(p[1], spec.y.fmt) + (spec.y.unit ? ' ' + spec.y.unit : '') + ' @ ' + fmt(p[0], spec.x.fmt);
        hit.addEventListener('mouseenter', () => {
          const r = svg.getBoundingClientRect(), k = r.width / W;
          tip.textContent = (s.name ? s.name + ' — ' : '') + label; tip.style.left = (px * k) + 'px'; tip.style.top = (py * k + (svg.offsetTop || 0)) + 'px'; tip.style.opacity = 1;
          c.setAttribute('r', (s.r || 4.5) + 2);
        });
        hit.addEventListener('mouseleave', () => { tip.style.opacity = 0; c.setAttribute('r', s.r || 4.5); });
        if (s.labels && p[2]) {
          const off = p[3] || {}; const t = mk('text', { x: px + (off.dx != null ? off.dx : 7), y: py + (off.dy != null ? off.dy : -7), class: 'pt-label', 'text-anchor': off.a || 'start' }, svg); t.textContent = p[2];
        }
      });
    });
    (spec.notes || []).forEach(n => {
      const t = mk('text', { x: x(n.x), y: y(n.y), class: 'pt-label', 'text-anchor': n.anchor || 'start', style: n.bold ? 'font-weight:700' : '' }, svg); t.textContent = n.text;
    });

    // accessible table view
    const det = document.createElement('details'); det.className = 'chart-table';
    let html = '<summary>Show data table</summary><div class="table-wrap"><table><thead><tr><th>Series</th><th>Label</th><th class="num">' + (spec.x.label || 'x') + '</th><th class="num">' + (spec.y.label || 'y') + '</th></tr></thead><tbody>';
    spec.series.forEach(s => s.points.forEach(p => { html += '<tr><td>' + (s.name || '') + '</td><td>' + (p[2] || '') + '</td><td class="num">' + fmt(p[0], spec.x.fmt) + '</td><td class="num">' + fmt(p[1], spec.y.fmt) + '</td></tr>'; }));
    det.innerHTML = html + '</tbody></table></div>';
    host.appendChild(det);
  }

  window.BookCharts = { renderAll() { document.querySelectorAll('figure.chart').forEach(render); }, render };
})();
