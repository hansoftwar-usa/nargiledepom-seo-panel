import { esc } from './ui.js';
import { icons } from './icons.js';

const PALETTE = ['#f4b64a', '#4fd1c5', '#6ba8ff', '#b98bff', '#5dd39e', '#f87171'];
let uid = 0;

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 4;
  if (value <= 4) return 4;
  if (value <= 10) return 10;
  const step = value <= 50 ? 5 : value <= 100 ? 10 : 50;
  return Math.ceil(value / step) * step;
}

export function chartEmpty(message = 'Grafik için henüz yeterli veri yok.') {
  return `<div class="chart-empty">${icons.chart}<span>${esc(message)}</span></div>`;
}

/**
 * Çizgi / alan grafiği.
 * @param {object} opts
 * @param {string[]} opts.labels
 * @param {{name?:string,color?:string,values:number[]}[]} opts.series
 * @param {boolean} opts.invert  true ise küçük değer üstte (sıralama grafiği)
 */
export function lineChart({ labels = [], series = [], invert = false, height = 230, fill = false, yFormat = (v) => v } = {}) {
  const all = series.flatMap((s) => (s.values || []).map(Number)).filter((v) => Number.isFinite(v));
  if (!labels.length || !all.length) return chartEmpty();

  const W = 720;
  const H = Math.max(180, height);
  const pad = { l: 40, r: 14, t: 16, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  let min;
  let max;
  if (invert) {
    min = 1;
    max = Math.max(5, Math.ceil((Math.max(...all) + 1) / 5) * 5);
  } else {
    min = 0;
    max = niceCeil(Math.max(...all) * 1.05);
  }

  const x = (i) => (labels.length === 1 ? pad.l + iw / 2 : pad.l + (i / (labels.length - 1)) * iw);
  const y = (v) => {
    const ratio = (Number(v) - min) / (max - min || 1);
    return invert ? pad.t + ratio * ih : pad.t + ih - ratio * ih;
  };

  const id = `chart${++uid}`;
  let defs = '';
  let grid = '';
  let axis = '';
  let areas = '';
  let lines = '';
  let dots = '';

  for (let i = 0; i <= 4; i += 1) {
    const gy = pad.t + (ih / 4) * i;
    const value = invert ? min + ((max - min) / 4) * i : max - ((max - min) / 4) * i;
    grid += `<line class="grid-line" x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${W - pad.r}" y2="${gy.toFixed(1)}"/>`;
    axis += `<text class="axis-label" x="${pad.l - 8}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end">${esc(yFormat(Math.round(value)))}</text>`;
  }

  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % labelStep !== 0 && i !== labels.length - 1) return;
    const anchor = i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle';
    axis += `<text class="axis-label" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${esc(label)}</text>`;
  });

  series.forEach((s, si) => {
    const color = s.color || PALETTE[si % PALETTE.length];
    const values = s.values || [];
    const pts = values.map((v, i) => [x(i), y(v)]);
    if (!pts.length) return;

    if (fill && series.length === 1 && pts.length > 1) {
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>`;
      const bottom = pad.t + ih;
      const areaPath = `M ${pts[0][0].toFixed(1)} ${bottom.toFixed(1)} L ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} L ${pts[pts.length - 1][0].toFixed(1)} ${bottom.toFixed(1)} Z`;
      areas += `<path class="series-area" d="${areaPath}" fill="url(#${id})" stroke="none"/>`;
    }

    const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    lines += `<path class="series-line" d="${path}" stroke="${color}"/>`;

    const every = Math.max(1, Math.ceil(pts.length / 14));
    pts.forEach((p, i) => {
      if (i % every !== 0 && i !== pts.length - 1) return;
      dots += `<circle class="series-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.1" fill="#141824" stroke="${color}"><title>${esc(labels[i] || '')}: ${esc(yFormat(values[i]))}</title></circle>`;
    });
  });

  return `<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik">
      <defs>${defs}</defs>
      <g>${grid}</g>
      ${areas}
      ${lines}
      <g>${axis}</g>
      ${dots}
    </svg>
  </div>`;
}

export function sparkline(values, { invert = true, color = '#f4b64a', height = 38 } = {}) {
  const nums = (values || []).map(Number).filter((v) => Number.isFinite(v));
  if (!nums.length) return '';

  const W = 280;
  const H = Math.max(28, height);
  const pad = 4;
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = (i) => (nums.length === 1 ? W / 2 : pad + (i / (nums.length - 1)) * (W - pad * 2));
  const y = (v) => {
    const ratio = (v - min) / (max - min);
    return invert ? pad + ratio * (H - pad * 2) : pad + (H - pad * 2) - ratio * (H - pad * 2);
  };
  const pts = nums.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const gid = `spark${++uid}`;
  const area = pts.length > 1
    ? `<path d="M ${pts[0][0].toFixed(1)} ${H} L ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} L ${pts[pts.length - 1][0].toFixed(1)} ${H} Z" fill="url(#${gid})" stroke="none"/>`
    : '';
  const last = pts[pts.length - 1];

  return `<div class="kw-spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Sıralama eğilimi">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${area}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8" fill="${color}" vector-effect="non-scaling-stroke"/>
  </svg></div>`;
}

export function horizontalBars(items = []) {
  if (!items.length) return chartEmpty();
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return `<div class="month-bars">${items.map((item) => {
    const pct = Math.max(2, Math.round(((Number(item.value) || 0) / max) * 100));
    return `<div class="bar-row">
      <span class="bar-row__label" title="${esc(item.label)}">${esc(item.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%${item.color ? `;background:${item.color}` : ''}"></div></div>
      <span class="bar-row__value">${esc(item.value)}</span>
    </div>`;
  }).join('')}</div>`;
}
