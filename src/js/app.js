import { DIAMETERS, SHAPES, cutLength, rowTotals, summary, kgPerMetre, shapesFor, shortLegs } from './bbs.js';
import { optimise } from './optimizer.js';
import { LANGS, t, setLang, getLang } from './i18n.js';
import { importSchedule, exportWorkbook, templateWorkbook, weightsWorkbook, patternName } from './excel.js';
import { FAMILIES, family, kgPerMetre as sectionKgPerMetre, designation, outline } from './sections.js';
import { pickFile, saveFile, emailFile, openLink, appVersion } from './platform.js';

const SUPPORT_EMAIL = 'info@mashharawi.com';
const REPO = 'https://github.com/UKDean/RebarPlan';
const SITE = 'https://mashharawi.com/tools/rebarplan/';
const AUTOSAVE = 'rebarplan.autosave';
const LANG_KEY = 'rebarplan.lang';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const STOCKS = [6000, 9000, 12000, 18000];
const blankProject = () => ({ version: 1, name: '', settings: { standard: 'BS', stocks: [12000], kerf: 0, minReuse: 1000, price: 0 }, rows: [] });
const num = (v) => (Number(v) > 0 ? Number(v) : '');

function normaliseRow(r) {
  return {
    mark: String(r.mark ?? ''), member: String(r.member ?? ''),
    dia: DIAMETERS.includes(Number(r.dia)) ? Number(r.dia) : 12,
    shape: SHAPES[r.shape] ? r.shape : '00',
    A: num(r.A), B: num(r.B), C: num(r.C), length: num(r.length), qty: num(r.qty),
  };
}

function normalise(p) {
  const out = blankProject();
  out.name = String(p.name || '');
  const s = p.settings || {};
  for (const k of ['kerf', 'minReuse', 'price']) if (Number(s[k]) >= 0) out.settings[k] = Number(s[k]);
  if (s.standard === 'ACI') out.settings.standard = 'ACI';
  const stocks = (Array.isArray(s.stocks) ? s.stocks : [s.stock]).map(Number).filter((x) => STOCKS.includes(x));
  if (stocks.length) out.settings.stocks = [...new Set(stocks)].sort((a, b) => b - a);
  out.rows = (p.rows || []).map(normaliseRow);
  return out;
}

function load() {
  try {
    const p = JSON.parse(store.get(AUTOSAVE));
    return p && Array.isArray(p.rows) ? normalise(p) : null;
  } catch { return null; }
}

// First run: a small worked example so the screens are not empty.
function sample() {
  const p = blankProject();
  p.rows = [
    { mark: 'C1-01', member: 'C1', dia: 16, shape: '00', A: 3200, qty: 240 },
    { mark: 'C1-02', member: 'C1', dia: 10, shape: '51', A: 450, B: 250, C: 130, qty: 860 },
    { mark: 'B2-04', member: 'B2', dia: 20, shape: '11', A: 5200, B: 600, qty: 96 },
    { mark: 'B2-07', member: 'B2', dia: 16, shape: '00', A: 2650, qty: 310 },
    { mark: 'S3-01', member: 'S3', dia: 12, shape: '00', A: 4700, qty: 520 },
    { mark: 'S3-02', member: 'S3', dia: 12, shape: '00', A: 2550, qty: 260 },
    { mark: 'F1-02', member: 'F1', dia: 20, shape: '21', A: 600, B: 2400, C: 600, qty: 64 },
  ].map(normaliseRow);
  return p;
}

let project = load() || sample();
let plans = {};          // dia -> optimiser result
let planKey = '';        // schedule fingerprint the plans were built from
let view = 'schedule';
let dirty = false;
let version = '1.1.0';

const persist = () => store.set(AUTOSAVE, JSON.stringify(project));
const fingerprint = () => JSON.stringify([project.rows.map((r) => [r.dia, cutLength(r), r.qty]), project.settings]);
const plansFresh = () => planKey === fingerprint() && Object.keys(plans).length > 0;
const mainStock = () => Math.max(...project.settings.stocks);
const price = () => Number(project.settings.price) || 0;

function touch() {
  dirty = true;
  persist();
  setStatus();
}

function setStatus() {
  const s = $('.title small');
  if (!s) return;
  s.classList.toggle('dirty', dirty);
  s.lastChild.textContent = t(dirty ? 'unsaved' : 'saved');
}

// ---------- rendering helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const $ = (sel) => document.querySelector(sel);

const ICONS = {
  schedule: '<path d="M4 5h16M4 10h16M4 15h16M4 20h10"/>',
  cutting: '<path d="M3 8h18M3 16h18"/><path d="M9 5v6M15 13v6"/>',
  workshop: '<path d="M4 20l7-7M14 4l6 6-4 4-6-6z"/><path d="M9 15l-5 5"/>',
  weights: '<path d="M5 20h14l-2.5-10h-9z"/><circle cx="12" cy="6.5" r="2.5"/>',
  report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M3 7h7l2 2h9v10H3z"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8M8 21v-7h8v7"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  excel: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 11l5 6M14 11l-5 6"/>',
  pdf: '<path d="M5 3h10l4 4v14H5z"/><path d="M8 14h8M8 17h5"/>',
  mail: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>',
  calc: '<path d="M4 12h4l3-7 4 14 3-7h2"/>',
  copy: '<path d="M8 8h11v11H8z"/><path d="M5 16V5h11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SHAPE_ICONS = {
  '00': '<path d="M4 11h30"/>',
  '11': '<path d="M5 3v14h28"/>',
  '21': '<path d="M5 3v14h28V3"/>',
  '51': '<rect x="7" y="3" width="24" height="15" rx="1.5"/><path d="M7 7l5-4"/>',
  'XX': '<path d="M4 11h30" stroke-dasharray="3 3"/>',
};
const shapeIcon = (code) => `<svg class="shape-ico" viewBox="0 0 38 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPE_ICONS[code]}</svg>`;

const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h5.5M12 7h8M4 12h9M15.5 12h4.5M4 17h3M9.5 17h10.5"/></svg>';

// ---------- shell ----------

const NAV = { schedule: 'navSchedule', cutting: 'navCutting', workshop: 'navWorkshop', weights: 'navWeights', report: 'navReport', settings: 'navSettings', about: 'navAbout' };

function renderShell() {
  const L = getLang();
  document.documentElement.lang = L === 'zh' ? 'zh-CN' : L;
  document.documentElement.dir = LANGS[L].dir;
  document.body.innerHTML = `
  <aside class="side">
    <div class="brand"><span class="mark">${LOGO}</span><b>RebarPlan</b></div>
    <div class="tag">${t('appTagline')}</div>
    ${Object.entries(NAV).map(([v, k]) => `<button class="nav${v === view ? ' on' : ''}" data-view="${v}">${icon(v)}<span>${t(k)}</span></button>`).join('')}
    <div class="foot">
      <select id="lang" aria-label="${t('settingsLang')}">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === L ? ' selected' : ''}>${v.name}</option>`).join('')}</select>
      <span>${t('version')} <span class="num">${esc(version)}</span></span>
    </div>
  </aside>
  <main>
    <header class="top">
      <div class="title">
        <input id="pname" value="${esc(project.name)}" placeholder="${t('untitled')}" aria-label="${t('projectName')}">
        <small class="${dirty ? 'dirty' : ''}"><span class="dot"></span>${t(dirty ? 'unsaved' : 'saved')}</small>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="new">${icon('plus')}${t('newProject')}</button>
        <button class="btn ghost" data-act="open">${icon('open')}${t('open')}</button>
        <button class="btn" data-act="save">${icon('save')}${t('save')}</button>
        <button class="btn" data-act="import">${icon('import')}${t('importExcel')}</button>
        <div class="menu" id="exportMenu">
          <button class="btn" data-act="menu" aria-haspopup="true" aria-expanded="false">${icon('export')}${t('exportMenu')}${icon('chevron')}</button>
          <div class="pop" role="menu">
            <button role="menuitem" data-act="xlsx">${icon('excel')}${t('exportExcel')}</button>
            <button role="menuitem" data-act="pdf">${icon('pdf')}${t('exportPdf')}</button>
            <button role="menuitem" data-act="email">${icon('mail')}${t('email')}</button>
            <button role="menuitem" data-act="template">${icon('excel')}${t('template')}</button>
          </div>
        </div>
        <button class="btn primary" data-act="calc">${icon('calc')}${t('calculate')}</button>
      </div>
    </header>
    <section class="view" id="view"></section>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  renderView();
}

function renderView() {
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  const el = $('#view');
  el.innerHTML = { schedule: scheduleView, cutting: cuttingView, workshop: workshopView, weights: weightsView, report: reportView, settings: settingsView, about: aboutView }[view]();
  el.scrollTop = 0;
}

// ---------- schedule ----------

function kpis() {
  const kg = summary(project.rows).reduce((a, x) => a + x.kg, 0);
  const fresh = plansFresh();
  const all = Object.entries(plans);
  const bars = fresh ? all.reduce((a, [, p]) => a + p.bars, 0) : null;
  const bought = all.reduce((a, [, p]) => a + p.boughtMm, 0);
  const steel = all.reduce((a, [, p]) => a + p.steelMm, 0);
  const waste = fresh && bought ? (100 * (bought - steel)) / bought : null;
  const savedKg = fresh ? all.reduce((a, [d, p]) => a + ((p.naiveBars * mainStock() - p.boughtMm) / 1000) * kgPerMetre(Number(d)), 0) : null;
  const boughtKg = fresh ? all.reduce((a, [d, p]) => a + (p.boughtMm / 1000) * kgPerMetre(Number(d)), 0) : kg;
  const sar = (k) => (price() ? `<small>≈ ${fmt((k / 1000) * price())} ${t('sar')}</small>` : '');
  const stocks = project.settings.stocks.map((x) => fmt(x / 1000)).join(' / ');
  return `<div class="kpis">
    <div class="kpi"><span>${t('kpiWeight')}</span><div>${fmt(kg / 1000, 2)}<small>${t('tonnes')}</small></div>${price() ? `<em>${t('kpiCost')} ${sar(boughtKg)}</em>` : ''}</div>
    <div class="kpi"><span>${t('kpiBars')} · ${stocks} ${t('m')}</span><div>${bars === null ? '—' : fmt(bars)}</div></div>
    <div class="kpi hl"><span>${t('kpiWaste')}</span><div>${waste === null ? '—' : fmt(waste, 1) + '%'}</div></div>
    <div class="kpi"><span>${t('kpiSaved')}</span><div>${savedKg === null ? '—' : fmt(savedKg / 1000, 2)}<small>${savedKg === null ? '' : t('tonnes')}</small></div>${savedKg !== null && price() ? `<em>${t('kpiSavedSar')} ${sar(savedKg)}</em>` : ''}</div>
  </div>`;
}

function rowHtml(r, i) {
  const shape = SHAPES[r.shape];
  const tot = rowTotals(r);
  const short = new Map(shortLegs(r).map((x) => [x.dim, x.min]));
  const dims = shape.calc
    ? shape.dims.map((k) => `<label>${k}<input class="cell num${short.has(k) ? ' warn' : ''}" data-i="${i}" data-k="${k}" value="${esc(r[k])}" inputmode="numeric" aria-label="${k}"${short.has(k) ? ` title="${t('shortLeg', { min: short.get(k) })}"` : ''}></label>`).join('')
    : `<label>L<input class="cell num" data-i="${i}" data-k="length" value="${esc(r.length)}" inputmode="numeric" aria-label="L"></label>`;
  return `<tr>
    <td><input class="cell" data-i="${i}" data-k="mark" value="${esc(r.mark)}" aria-label="${t('colMark')}"></td>
    <td><input class="cell" data-i="${i}" data-k="member" value="${esc(r.member)}" aria-label="${t('colMember')}"></td>
    <td><select class="cell dia" data-i="${i}" data-k="dia" aria-label="${t('colDia')}">${DIAMETERS.map((d) => `<option value="${d}"${d === r.dia ? ' selected' : ''}>Ø${d}</option>`).join('')}</select></td>
    <td><div class="shape">${shapeIcon(r.shape)}<select class="cell" data-i="${i}" data-k="shape" aria-label="${t('colShape')}">${[...new Set([...shapesFor(project.settings.standard), r.shape])].map((c) => `<option value="${c}"${c === r.shape ? ' selected' : ''}>${/^\d/.test(c) ? c + ' · ' : ''}${t('shape' + c)}</option>`).join('')}</select></div></td>
    <td><div class="dims">${dims}</div></td>
    <td class="out${Number.isFinite(tot.cut) ? '' : ' bad'}" data-out="cut">${fmt(tot.cut)}</td>
    <td><input class="cell num" data-i="${i}" data-k="qty" value="${esc(r.qty)}" inputmode="numeric" aria-label="${t('colQty')}"></td>
    <td class="out" data-out="kg">${fmt(tot.kg, 1)}</td>
    <td><div class="rowtools"><button class="icon" data-act="dup" data-i="${i}" title="${t('duplicate')}" aria-label="${t('duplicate')}">${icon('copy')}</button><button class="icon del" data-act="del" data-i="${i}" title="${t('remove')}" aria-label="${t('remove')}">${icon('trash')}</button></div></td>
  </tr>`;
}

function summaryHtml() {
  const s = summary(project.rows);
  if (!s.length) return '';
  const fresh = plansFresh();
  const kg = s.reduce((a, x) => a + x.kg, 0);
  return `<div class="card"><h3>${t('byDia')}</h3><table class="sum">
    <thead><tr><th>${t('diameter')}</th><th>${t('colQty')}</th><th>${t('m')}</th><th>${t('kg')}</th><th>${t('bars')}</th></tr></thead>
    <tbody>${s.map((x) => `<tr><td class="dia">Ø${x.dia}</td><td>${fmt(x.pieces)}</td><td>${fmt(x.metres, 1)}</td><td>${fmt(x.kg)}</td><td>${fresh && plans[x.dia] ? fmt(plans[x.dia].bars) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Σ</td><td></td><td></td><td>${fmt(kg)}</td><td>${fresh ? fmt(Object.values(plans).reduce((a, p) => a + p.bars, 0)) : ''}</td></tr></tfoot>
  </table></div>`;
}

function scheduleView() {
  const rows = project.rows;
  return `${kpis()}
  <div class="cols">
    <div class="card sched"><h3>${t('navSchedule')} <span>${rows.length} ${t('marks')}</span></h3>
      ${rows.length ? `<table>
        <thead><tr><th>${t('colMark')}</th><th>${t('colMember')}</th><th>${t('colDia')}</th><th>${t('colShape')}</th><th>${t('colDims')}</th><th>${t('colCut')}</th><th>${t('colQty')}</th><th>${t('colWeight')}</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody></table>` : `<div class="empty">${t('emptySchedule')}</div>`}
      <button class="btn addrow" data-act="add">${icon('plus')}${t('addRow')}</button>
    </div>
    <div id="sumcol">${summaryHtml()}</div>
  </div>`;
}

// ---------- cutting plan ----------

function planCard(dia, plan) {
  const multi = project.settings.stocks.length > 1;
  const colour = new Map();
  [...new Set(plan.patterns.flatMap((p) => p.cuts))].sort((a, b) => b - a).forEach((len, i) => colour.set(len, `var(--seg${(i % 4) + 1})`));
  return `<div class="card"><h3><span style="color:var(--text);font-size:14px;font-weight:600">${t('planFor')} – <span class="dia">Ø${dia}</span></span><span>${fmt(plan.bars)} ${t('bars')} · ${fmt(plan.wastePct, 1)}%</span></h3>
    <div class="planhead">
      <span>${t('minimum')}<b>${fmt(plan.lowerBound)}</b></span>
      <span>${t('naive')}<b>${fmt(plan.naiveBars)}</b></span>
      <span>${t('reusable')}<b>${fmt(plan.reusableOffcuts)}</b></span>
    </div>
    ${plan.patterns.map((p, i) => `<div class="pat">
      <div class="row"><span>${t('pattern')} ${patternName(i)} × <b>${p.times}</b>${multi ? ` · ${t('stockBar', { m: fmt(p.stock / 1000) })}` : ''}</span><span>${t('offcut')} <b class="num">${fmt(p.offcut)} mm</b></span></div>
      <div class="bar" style="width:${(100 * p.stock) / mainStock()}%" role="img" aria-label="${p.cuts.join(' + ')} mm">${p.cuts.map((c) => `<div style="flex:${c};background:${colour.get(c)}">${fmt(c / 1000, 2)}</div>`).join('')}${p.offcut > 0 ? `<div class="w" style="flex:${p.offcut}">${p.offcut >= p.stock * 0.06 ? fmt(p.offcut / 1000, 2) : ''}</div>` : ''}</div>
    </div>`).join('')}
    ${plan.tooLong.length ? `<div class="notice warn" style="margin:14px 0 0">${t('tooLong')} ${plan.tooLong.map((x) => `<span class="num">${x.qty} × ${fmt(x.length)} mm</span>`).join(' · ')}</div>` : ''}
  </div>`;
}

function cuttingView() {
  if (!Object.keys(plans).length) return `${kpis()}<div class="notice">${t('noPlan')}</div>`;
  return `${kpis()}${planKey !== fingerprint() ? `<div class="notice warn">${t('stale')}</div>` : ''}
    ${Object.entries(plans).map(([d, p]) => planCard(d, p)).join('')}`;
}

function calculate() {
  const byDia = {};
  for (const r of project.rows) {
    const L = cutLength(r);
    const q = Math.floor(Number(r.qty) || 0);
    if (!Number.isFinite(L) || !q) continue;
    (byDia[r.dia] ||= []).push({ length: L, qty: q });
  }
  const { stocks, kerf, minReuse } = project.settings;
  plans = {};
  for (const d of Object.keys(byDia).map(Number).sort((a, b) => a - b)) plans[d] = optimise(byDia[d], { stocks, kerf, minReuse });
  planKey = fingerprint();
}

// ---------- report (printable) ----------

function reportView() {
  if (planKey !== fingerprint()) calculate();
  const L = getLang();
  const date = new Date().toLocaleDateString(L === 'zh' ? 'zh-CN' : L === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
  return `<div class="card" style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
      <div><div class="muted" style="font-size:12px">${t('reportTitle')}</div><div style="font-size:22px;font-weight:600">${esc(project.name || t('untitled'))}</div></div>
      <div class="muted" style="font-size:12px;text-align:end">${t('reportDate')}: <span class="num">${esc(date)}</span><br>RebarPlan · mashharawi.com</div>
    </div>
    ${kpis()}
    <div class="card"><h3>${t('navSchedule')}<span>${project.rows.length} ${t('marks')}</span></h3><table class="sum">
      <thead><tr><th>${t('colMark')}</th><th>${t('colMember')}</th><th>${t('colDia')}</th><th>${t('colShape')}</th><th>A</th><th>B</th><th>C</th><th>${t('colCut')}</th><th>${t('colQty')}</th><th>${t('colWeight')}</th></tr></thead>
      <tbody>${project.rows.map((r) => { const x = rowTotals(r); return `<tr><td>${esc(r.mark)}</td><td>${esc(r.member)}</td><td class="dia">Ø${r.dia}</td><td>${r.shape === 'XX' ? '—' : r.shape}</td><td>${esc(r.A)}</td><td>${esc(r.B)}</td><td>${esc(r.C)}</td><td>${fmt(x.cut)}</td><td>${fmt(x.count)}</td><td>${fmt(x.kg, 1)}</td></tr>`; }).join('')}</tbody>
    </table></div>
    ${summaryHtml()}
    ${Object.entries(plans).map(([d, p]) => planCard(d, p)).join('')}
    <p class="muted" style="font-size:11px">${t('settingsNote')} ${t('aboutDisclaimer')}</p>`;
}

// ---------- settings & about ----------

function settingsView() {
  const s = project.settings;
  return `<div class="card"><h3>${t('navSettings')}</h3><div class="form">
    <label class="field">${t('settingsStd')}<select data-set="standard"><option value="BS"${s.standard === 'BS' ? ' selected' : ''}>${t('stdBS')}</option><option value="ACI"${s.standard === 'ACI' ? ' selected' : ''}>${t('stdACI')}</option></select></label>
    <div class="field">${t('settingsStocks')}<div class="checks">${STOCKS.map((v) => `<label><input type="checkbox" data-stock="${v}"${s.stocks.includes(v) ? ' checked' : ''}> <span class="num">${fmt(v / 1000)} m</span></label>`).join('')}</div></div>
    <label class="field">${t('settingsPrice')}<input data-set="price" class="num" inputmode="decimal" value="${esc(s.price || '')}" placeholder="0"></label>
    <label class="field">${t('settingsKerf')}<input data-set="kerf" class="num" inputmode="numeric" value="${esc(s.kerf)}"></label>
    <label class="field">${t('settingsReuse')}<input data-set="minReuse" class="num" inputmode="numeric" value="${esc(s.minReuse)}"></label>
    <label class="field">${t('settingsLang')}<select data-set="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === getLang() ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>
  </div><p class="muted" style="margin:16px 0 0;font-size:12px">${t(s.standard === 'ACI' ? 'noteACI' : 'settingsNote')}</p></div>`;
}

// ---------- workshop sheet & labels (printable) ----------

function workshopView() {
  if (planKey !== fingerprint()) calculate();
  const marksByLen = new Map();
  for (const r of project.rows) {
    const key = `${r.dia}|${cutLength(r)}`;
    marksByLen.set(key, [...(marksByLen.get(key) || []), r.mark].filter(Boolean));
  }
  const m = (mm) => fmt(mm / 1000, 2);
  let n = 0;
  const sheets = Object.entries(plans).map(([d, plan]) => `<div class="card"><h3><span style="color:var(--text);font-size:14px">Ø${d}</span><span>${fmt(plan.bars)} ${t('bars')}</span></h3>
    <table class="sum ws"><thead><tr><th>#</th><th>${t('bars_n')}</th><th>${t('workshopFrom')}</th><th>${t('workshopCut')}</th><th>${t('offcut')}</th></tr></thead><tbody>
    ${plan.patterns.map((p) => {
      const groups = [...p.cuts.reduce((g, c) => g.set(c, (g.get(c) || 0) + 1), new Map())];
      const from = n + 1; n += p.times;
      return `<tr><td><span class="num">${from}–${n}</span></td><td><span class="num">${p.times}</span></td><td><span class="num">${m(p.stock)} m</span></td>
        <td>${groups.map(([len, k]) => `<span class="num"><b>${m(len)} m</b> × ${k}</span> <span class="muted">(${esc((marksByLen.get(`${d}|${len}`) || []).join(', '))})</span>`).join('<br>')}</td>
        <td>${p.offcut ? `<span class="num">${m(p.offcut)} m</span> · ${p.offcut >= project.settings.minReuse ? `<b class="keep">${t('workshopKeep')}</b>` : t('workshopScrap')}` : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`).join('');
  const labels = project.rows.filter((r) => Number.isFinite(cutLength(r)) && Number(r.qty) > 0).map((r) => `<div class="label">
      <div class="lt"><b>${esc(r.mark || '—')}</b><span class="dia">Ø${r.dia}</span></div>
      <div class="lm">${esc(r.member)}</div>
      <div class="lr"><span>${r.shape === 'XX' ? '' : esc(r.shape)} ${shapeIcon(r.shape)}</span><b class="num">${fmt(cutLength(r))} mm</b></div>
      <div class="lr"><span>${t('colQty')}</span><b class="num">${fmt(Number(r.qty))}</b></div>
      <div class="lf">${esc(project.name || t('untitled'))}</div>
    </div>`).join('');
  return `<div class="card no-print" style="display:flex;justify-content:space-between;align-items:center"><span class="muted">${t('workshopTitle')}</span><button class="btn primary" data-act="printWs">${icon('pdf')}${t('printWorkshop')}</button></div>
    <div class="print-only" style="margin-bottom:10px"><b style="font-size:18px">${t('workshopTitle')}</b><div>${t('project')}: ${esc(project.name || t('untitled'))}</div></div>
    ${sheets || `<div class="notice">${t('noPlan')}</div>`}
    <div class="card"><h3>${t('labels')}<span class="no-print">${t('labelsHint')}</span></h3><div class="labels">${labels}</div></div>`;
}

// ---------- weight calculator ----------

// Kept apart from the project: a weight list is a quick enquiry, not part of
// the bar schedule, so it survives New/Open and is not saved in .rebarplan files.
const WEIGHTS = 'rebarplan.weights';
const wDefaultSize = (f) => (f.sizes ? Math.floor(f.sizes.length / 3) : 0);
function wDefaults() {
  const manual = {};
  for (const f of FAMILIES) if (f.manual) manual[f.key] = Object.fromEntries(f.manual);
  return { fam: 'rebar', size: DIAMETERS.indexOf(16), manual, quick: false, length: 12, qty: 100, list: [] };
}
function wLoad() {
  const d = wDefaults();
  try {
    const w = JSON.parse(store.get(WEIGHTS));
    if (!w || !Array.isArray(w.list)) return d;
    return { ...d, ...w, manual: { ...d.manual, ...w.manual }, fam: family(w.fam).key };
  } catch { return d; }
}
let weights = wLoad();
const wSave = () => store.set(WEIGHTS, JSON.stringify(weights));
const famName = (k) => { const n = t('fam_' + k); return n === 'fam_' + k ? k.toUpperCase() : n; };
const fmtLen = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—');

function wCurrent() {
  const f = family(weights.fam);
  const dims = f.manual ? weights.manual[f.key] : f.sizes[Math.min(weights.size, f.sizes.length - 1)];
  return { f, dims, kgm: sectionKgPerMetre(f.shape, dims, weights.quick), size: designation(f, dims) };
}

function wKpis(c) {
  const ok = Number.isFinite(c.kgm);
  const piece = c.kgm * weights.length;
  return `<div class="kpis">
    <div class="kpi hl"><span>${t('wKgM')}</span><div>${ok ? fmt(c.kgm, 3) : '—'}<small>${t('kgm')}</small></div></div>
    <div class="kpi"><span>${t('wPiece')} · <span class="num">${fmtLen(weights.length)}</span> ${t('m')}</span><div>${ok ? fmt(piece, 2) : '—'}<small>${t('kg')}</small></div></div>
    <div class="kpi"><span>${t('wPerT')}</span><div>${ok && piece > 0 ? fmt(1000 / piece, 1) : '—'}</div></div>
    <div class="kpi"><span>${t('wTotal')} · <span class="num">${fmt(weights.qty)}</span> ${t('pieces')}</span><div>${ok ? fmt((piece * weights.qty) / 1000, 3) : '—'}<small>${t('tonnes')}</small></div></div>
  </div>`;
}

function wFigure(c) {
  const o = outline(c.f.shape, c.dims);
  const s = 150 / Math.max(o.w, o.h, 1);
  const dims = c.f.manual ? '' : Object.entries(c.dims).filter(([k]) => k !== 'designation' && k !== 'verified').map(([k, v]) => `${k} ${v}`).join(' · ');
  return `<svg class="xsec" viewBox="-100 -100 200 200" aria-hidden="true"><path d="${o.d}" transform="scale(${s.toFixed(4)})" fill-rule="evenodd" vector-effect="non-scaling-stroke"/></svg>
    <figcaption><b class="num">${esc(c.size)}</b><span>${t('hint_' + c.f.key)}</span>${dims ? `<span class="num">${esc(dims)}</span>` : ''}</figcaption>`;
}

function wWarn(c) {
  if (!Number.isFinite(c.kgm)) return `<div class="notice warn">${t('wInvalid')}</div>`;
  if (c.dims.verified === false) return `<div class="notice">${t('wUnverified')}</div>`;
  return '';
}

function wListHtml() {
  const L = weights.list;
  const kg = L.reduce((a, l) => a + l.kg, 0);
  return `<h3>${t('wList')}<span>${L.length} ${t('wItems')}</span></h3>
    ${L.length ? `<table class="sum wl"><thead><tr><th>${t('wSection')}</th><th>${t('wSize')}</th><th>${t('wLength')}</th><th>${t('wQty')}</th><th>${t('colWeight')}</th><th></th></tr></thead>
      <tbody>${L.map((l, i) => `<tr><td>${esc(famName(l.fam))}</td><td>${esc(l.size)}</td><td>${fmtLen(l.length)}</td><td>${fmt(l.qty)}</td><td>${fmt(l.kg, 1)}</td><td><button class="icon del" data-act="wdel" data-i="${i}" title="${t('remove')}" aria-label="${t('remove')}">${icon('trash')}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Σ</td><td></td><td></td><td></td><td>${fmt(kg / 1000, 3)} ${t('tonnes')}</td><td></td></tr></tfoot></table>`
    : `<div class="empty">${t('wEmpty')}</div>`}
    <div class="wtools">
      <button class="btn" data-act="wsched">${icon('schedule')}${t('wAddSchedule')}</button>
      ${L.length ? `<button class="btn" data-act="wxlsx">${icon('excel')}${t('exportExcel')}</button><button class="btn ghost" data-act="wclear">${icon('trash')}${t('wClear')}</button>` : ''}
    </div>`;
}

function weightsView() {
  const c = wCurrent();
  const f = c.f;
  const fields = f.manual
    ? f.manual.map(([k]) => `<label class="field">${t('wDim_' + k)}<input data-w="${k}" class="num" inputmode="decimal" value="${esc(weights.manual[f.key][k])}"></label>`).join('')
    : `<label class="field">${t('wSize')}<select data-w="size">${f.sizes.map((s, i) => `<option value="${i}"${i === Math.min(weights.size, f.sizes.length - 1) ? ' selected' : ''}>${esc(s.designation)}</option>`).join('')}</select></label>`;
  const method = f.manual ? `<div class="field">${t('wMethod')}
      <div class="seg"><button data-act="wquick" data-q="0" class="${weights.quick ? '' : 'on'}">${t('wExact')}</button><button data-act="wquick" data-q="1" class="${weights.quick ? 'on' : ''}">${t('wQuick')}</button></div>
      <small>${t(weights.quick ? 'wQuickHint' : 'wExactHint')}</small></div>` : '';
  return `<div id="wkpis">${wKpis(c)}</div>
    <div class="card"><div class="chips">${FAMILIES.map((x) => `<button class="chip${x.key === f.key ? ' on' : ''}" data-act="wfam" data-fam="${x.key}">${esc(famName(x.key))}</button>`).join('')}</div></div>
    <div class="wcols">
      <div class="card">
        <h3>${esc(famName(f.key))}<span>${esc(f.standard || t('wMarket'))}</span></h3>
        <div class="wcalc">
          <div class="form wform">${fields}
            <label class="field">${t('wLength')}<input data-w="length" class="num" inputmode="decimal" value="${esc(weights.length)}"></label>
            <label class="field">${t('wQty')}<input data-w="qty" class="num" inputmode="numeric" value="${esc(weights.qty)}"></label>
            ${method}
          </div>
          <figure class="xfig" id="wfig">${wFigure(c)}</figure>
        </div>
        <div id="wwarn">${wWarn(c)}</div>
        <button class="btn primary" data-act="wadd">${icon('plus')}${t('wAdd')}</button>
      </div>
      <div class="card" id="wlist">${wListHtml()}</div>
    </div>
    <p class="muted" style="font-size:12px">${t('wNote')}</p>`;
}

// Refresh the figures in place so the field being typed in keeps focus.
function wRefresh() {
  const c = wCurrent();
  $('#wkpis').innerHTML = wKpis(c);
  $('#wfig').innerHTML = wFigure(c);
  $('#wwarn').innerHTML = wWarn(c);
}
const wListRefresh = () => { wSave(); $('#wlist').innerHTML = wListHtml(); };

function aboutView() {
  return `<div class="card prose"><h3>${t('aboutTitle')}</h3>
    <p>${t('aboutPrivacy')}</p>
    <p>${t('aboutSupport')} <a href="mailto:${SUPPORT_EMAIL}" data-link="mailto:${SUPPORT_EMAIL}" class="num">${SUPPORT_EMAIL}</a></p>
    <p>${t('aboutSource')} <a href="${REPO}" data-link="${REPO}" class="num">github.com/UKDean/RebarPlan</a></p>
    <p class="muted">${t('aboutDisclaimer')}</p>
    <p class="muted"><span class="num">RebarPlan ${esc(version)}</span> · © Omar Mashharawi · <a href="${SITE}" data-link="${SITE}" class="num">mashharawi.com</a></p>
  </div>`;
}

// ---------- actions ----------

function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), ms);
}

const fileBase = () => (project.name || 'RebarPlan').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'RebarPlan';

function closeMenu() {
  const m = $('#exportMenu');
  if (!m) return;
  m.classList.remove('open');
  m.querySelector('[data-act="menu"]').setAttribute('aria-expanded', 'false');
}

const actions = {
  async new() {
    if (dirty && !confirm(t('confirmNew'))) return;
    project = blankProject(); plans = {}; planKey = ''; dirty = false; persist(); view = 'schedule'; renderShell();
  },
  async open() {
    const f = await pickFile(['rebarplan', 'json']);
    if (!f) return;
    try {
      project = normalise(JSON.parse(new TextDecoder().decode(f.bytes)));
    } catch { return toast(t('fileError')); }
    plans = {}; planKey = ''; persist(); dirty = false; view = 'schedule'; renderShell();
  },
  async save() {
    const bytes = new TextEncoder().encode(JSON.stringify(project, null, 1));
    if (await saveFile(`${fileBase()}.rebarplan`, bytes, ['rebarplan'])) { dirty = false; setStatus(); toast(t('saved')); }
  },
  async import() {
    const f = await pickFile(['xlsx', 'xls', 'csv']);
    if (!f) return;
    let rows;
    try { rows = importSchedule(f.bytes); } catch { return toast(t('fileError')); }
    if (!rows.length) return toast(t('importNone'), 4000);
    project.rows.push(...rows.map(normaliseRow));
    if (!project.name) project.name = f.name.replace(/\.[^.]+$/, '');
    touch(); view = 'schedule'; renderShell();
    toast(t('importDone', { n: rows.length }));
  },
  async xlsx() {
    if (planKey !== fingerprint()) calculate();
    await saveFile(`${fileBase()}.xlsx`, exportWorkbook(project, plans), ['xlsx']);
  },
  pdf() {
    view = 'report'; renderView();
    toast(t('pdfHint'), 5000);
    setTimeout(() => window.print(), 400);
  },
  async email() {
    if (planKey !== fingerprint()) calculate();
    const kg = summary(project.rows).reduce((a, x) => a + x.kg, 0);
    const bars = Object.values(plans).reduce((a, p) => a + p.bars, 0);
    const name = project.name || t('untitled');
    const result = await emailFile({
      subject: t('emailSubject', { name }),
      body: t('emailBody', { name, t: fmt(kg / 1000, 2), bars: fmt(bars) }),
      fileName: `${fileBase()}.xlsx`,
      bytes: exportWorkbook(project, plans),
    });
    if (result !== 'attached') toast(t('emailAttach', { file: result }), 7000);
  },
  printWs() { setTimeout(() => window.print(), 100); },
  async template() { await saveFile('RebarPlan-template.xlsx', templateWorkbook(), ['xlsx']); },
  calc() { calculate(); view = 'cutting'; renderView(); },
  add() {
    const last = project.rows[project.rows.length - 1];
    project.rows.push(normaliseRow({ member: last?.member, dia: last?.dia ?? 12, shape: project.settings.standard === 'ACI' ? 'S' : '00' }));
    touch(); renderView();
    const marks = document.querySelectorAll('input[data-k="mark"]');
    marks[marks.length - 1]?.focus();
  },
  dup(i) { project.rows.splice(i + 1, 0, { ...project.rows[i] }); touch(); renderView(); },
  del(i) { project.rows.splice(i, 1); touch(); renderView(); },
  wfam(_, btn) {
    const f = family(btn.dataset.fam);
    if (f.key !== weights.fam) { weights.fam = f.key; weights.size = wDefaultSize(f); }
    wSave(); renderView();
  },
  wquick(_, btn) { weights.quick = btn.dataset.q === '1'; wSave(); renderView(); },
  wadd() {
    const c = wCurrent();
    const { length, qty } = weights;
    if (!Number.isFinite(c.kgm) || !(length > 0) || !(qty > 0)) return toast(t('wInvalid'));
    weights.list.push({ fam: c.f.key, size: c.size, length, qty, kgm: c.kgm, kg: c.kgm * length * qty });
    wListRefresh();
  },
  wsched() {
    const lines = project.rows.map((r) => ({ r, tot: rowTotals(r) })).filter(({ tot }) => Number.isFinite(tot.cut) && tot.count > 0);
    if (!lines.length) return toast(t('emptySchedule'));
    for (const { r, tot } of lines) {
      weights.list.push({ fam: 'rebar', size: `Ø${r.dia}${r.mark ? ' · ' + r.mark : ''}`, length: tot.cut / 1000, qty: tot.count, kgm: kgPerMetre(r.dia), kg: tot.kg });
    }
    wListRefresh();
  },
  wdel(i) { weights.list.splice(i, 1); wListRefresh(); },
  wclear() { if (confirm(t('wConfirmClear'))) { weights.list = []; wListRefresh(); } },
  async wxlsx() {
    const lines = weights.list.map((l) => ({ ...l, section: famName(l.fam) }));
    await saveFile(`${fileBase()} - ${t('wSheet')}.xlsx`, weightsWorkbook(lines), ['xlsx']);
  },
  menu(_, btn) {
    const m = $('#exportMenu');
    const open = !m.classList.contains('open');
    m.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  },
};

// ---------- events ----------

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-view]');
  if (nav) { view = nav.dataset.view; renderView(); return; }
  const link = e.target.closest('[data-link]');
  if (link) { e.preventDefault(); openLink(link.dataset.link); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.closest('.pop') || !e.target.closest('#exportMenu')) closeMenu();
  if (!btn) return;
  const fn = actions[btn.dataset.act];
  if (fn) Promise.resolve(fn(Number(btn.dataset.i), btn)).catch((err) => { console.error(err); toast(t('fileError')); });
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'pname') { project.name = el.value; touch(); return; }
  if (el.dataset.w) {
    const k = el.dataset.w;
    const v = Math.max(0, Number(el.value) || 0);
    if (k === 'size') weights.size = Number(el.value) || 0;
    else if (k === 'length' || k === 'qty') weights[k] = k === 'qty' ? Math.floor(v) : v;
    else weights.manual[weights.fam][k] = v;
    wSave(); wRefresh();
    return;
  }
  if (el.dataset.set) {
    if (['kerf', 'minReuse', 'price'].includes(el.dataset.set)) { project.settings[el.dataset.set] = Math.max(0, Number(el.value) || 0); touch(); }
    return;
  }
  if (el.dataset.i === undefined) return;
  const r = project.rows[Number(el.dataset.i)];
  const k = el.dataset.k;
  r[k] = ['mark', 'member', 'shape'].includes(k) ? el.value : k === 'dia' ? Number(el.value) : num(el.value);
  touch();
  if (k === 'shape') {
    renderView();
    document.querySelector(`select[data-i="${el.dataset.i}"][data-k="shape"]`)?.focus();
    return;
  }
  // Update this row's computed cells in place so focus stays where it is.
  const tr = el.closest('tr');
  const tot = rowTotals(r);
  const cut = tr.querySelector('[data-out="cut"]');
  cut.textContent = fmt(tot.cut);
  cut.classList.toggle('bad', !Number.isFinite(tot.cut));
  tr.querySelector('[data-out="kg"]').textContent = fmt(tot.kg, 1);
  const short = new Map(shortLegs(r).map((x) => [x.dim, x.min]));
  tr.querySelectorAll('.dims input').forEach((inp) => {
    inp.classList.toggle('warn', short.has(inp.dataset.k));
    if (short.has(inp.dataset.k)) inp.title = t('shortLeg', { min: short.get(inp.dataset.k) }); else inp.removeAttribute('title');
  });
  const kp = $('.kpis');
  if (kp) kp.outerHTML = kpis();
  const sc = $('#sumcol');
  if (sc) sc.innerHTML = summaryHtml();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'lang' || el.dataset.set === 'lang') {
    setLang(el.value);
    store.set(LANG_KEY, el.value);
    renderShell();
  } else if (el.dataset.set === 'standard') {
    project.settings.standard = el.value === 'ACI' ? 'ACI' : 'BS';
    touch(); renderView();
  } else if (el.dataset.stock) {
    const picked = [...document.querySelectorAll('[data-stock]:checked')].map((c) => Number(c.dataset.stock));
    if (!picked.length) { el.checked = true; return; }
    project.settings.stocks = picked.sort((a, b) => b - a);
    touch();
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 's') { e.preventDefault(); actions.save(); }
  else if (mod && key === 'o') { e.preventDefault(); actions.open(); }
  else if (mod && key === 'p') { e.preventDefault(); actions.pdf(); }
  else if (mod && e.key === 'Enter') { e.preventDefault(); actions.calc(); }
  else if (e.key === 'Escape') closeMenu();
});

// ---------- start ----------

setLang(store.get(LANG_KEY) || (navigator.language || 'ar').slice(0, 2));
// Deep link for documentation screenshots: #view=cutting&lang=en
const hash = new URLSearchParams(location.hash.slice(1));
if (LANGS[hash.get('lang')]) setLang(hash.get('lang'));
if (NAV[hash.get('view')]) { view = hash.get('view'); if (view !== 'schedule') calculate(); }
renderShell();
appVersion().then((v) => { version = v; const el = $('.foot .num'); if (el) el.textContent = v; }).catch(() => {});
