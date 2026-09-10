#!/usr/bin/env node
/**
 * 取值挖掘器 v1.0 —— 从「线上页面采集 JSON」和「Figma 变量导出」里挖 Token 候选
 * ------------------------------------------------------------
 * 建包最难的不是写文档，是确定取值。本脚本把两路原始素材聚合成候选，
 * 并把「设计稿 vs 线上实现」的差异摆出来让人裁决。
 *
 * 用法：
 *   node mine-tokens.js --online=<采集JSON>[,<采集JSON>...] [--figma=<导出文件>]
 *                       [--grid=8] [--min-count=2] [--emit-tokens=<path>] [--json] [--out=<path>]
 *
 *   --online        collect-from-browser.js 导出的 JSON，可多份（多页面合并统计）
 *   --figma         设计稿变量导出（复用 check-design-sync.js 能识别的 4 种形态）
 *   --grid          期望的间距网格基数，默认 8；用于标注「不合网格」的间距
 *   --min-count     出现次数低于此值的取值不进候选，默认 2（过滤个别手滑值）
 *   --emit-tokens   额外输出一份 tokens.md 草稿表格，供人工确认后并入规范
 *   --json          输出机器可读 JSON
 *   --out           报告写到文件（默认打 stdout）
 *
 * 输出四类内容：
 *   1. 页面结构特征 → 推断该建哪些页面/组件文档（不建不存在的东西）
 *   2. Token 候选（颜色 / 字号 / 间距 / 圆角 / 阴影 / 字重 / 行高 / 层级 / 关键尺寸）
 *   3. 设计稿 ↔ 线上 差异（F1 设计稿有线上无 / F2 线上有设计稿无 / F3 值不同）
 *   4. 存疑项清单（不合网格、低饱和难归类、透明色未换算等）
 *
 * 重要：本脚本只做「候选 + 存疑」，不做命名裁决。
 * 语义命名（哪个是主色、哪个是危险色）必须由人确认——机器猜错的代价远大于猜对的收益。
 *
 * 退出码：0 正常；1 参数错误或输入文件不可解析
 */

const fs = require('fs');
const path = require('path');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const opts = {};
for (const a of argv) {
  if (!a.startsWith('--')) continue;
  const idx = a.indexOf('=');
  const k = a.slice(2, idx === -1 ? undefined : idx);
  const v = idx === -1 ? true : a.slice(idx + 1);
  opts[k] = v;
}

const AS_JSON = !!opts.json;
const GRID = parseInt(opts.grid || '8', 10) || 8;
const MIN_COUNT = parseInt(opts['min-count'] || '2', 10) || 1;
const ONLINE = String(opts.online || '').split(',').map((s) => s.trim()).filter(Boolean);
const FIGMA = opts.figma ? String(opts.figma) : '';

if (!ONLINE.length && !FIGMA) {
  console.error('✗ 至少要给一份数据源：--online=<采集JSON> 或 --figma=<设计稿导出>');
  console.error('  没有线上采集？让能打开页面的人跑 scripts/collect-from-browser.js');
  process.exit(1);
}

/* ---------- 读线上采集 ---------- */
function readJson(p) {
  if (!fs.existsSync(p)) {
    console.error('✗ 文件不存在：' + p);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('✗ 不是合法 JSON：' + p + '\n  ' + e.message);
    process.exit(1);
  }
}

const pages = ONLINE.map(readJson);

/* ---------- 读 Figma 导出（与 check-design-sync.js 同一套识别逻辑，简化版） ---------- */

/* 只收看起来像色值/尺寸的叶子节点，避免把 type / description 也当成变量。
   必须定义在 loadFigma 之外：walk 是函数声明会提升，const 不会，
   放在函数体内的调用点之后会撞 TDZ。 */
const VALUE_LIKE = /^(#|rgba?\(|hsla?\(|[\d.]+(px|rem|em|%)?( |$)|[\d.]+px [\d.]+px)/i;

function loadFigma(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const out = new Map(); // name -> value
  let text = raw.trim();

  if (text.startsWith('{') || text.startsWith('[')) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      console.error('✗ Figma 导出不是合法 JSON：' + file);
      process.exit(1);
    }
    walk(data, '');
  } else {
    /* CSV / TSV */
    const lines = text.split(/\r?\n/).filter(Boolean);
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const head = lines[0].split(sep).map((s) => s.trim().toLowerCase());
    const iName = head.findIndex((h) => /name|名称|token|变量/.test(h));
    const iVal = head.findIndex((h) => /value|值|默认|default/.test(h));
    if (iName < 0 || iVal < 0) {
      console.error('✗ 表格缺少 名称/值 列：' + file);
      process.exit(1);
    }
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(sep);
      if (c[iName] && c[iVal]) out.set(c[iName].trim(), c[iVal].trim());
    }
  }

  function walk(node, prefix) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, prefix)); return; }

    /* 形态 1：{ name, value } 或 { value, type }（Figma 原生 / Tokens Studio 叶子节点） */
    if (typeof node.value === 'string') {
      const nm = typeof node.name === 'string' ? node.name : prefix;
      if (nm && VALUE_LIKE.test(node.value)) out.set(nm, node.value);
      return;
    }

    const entries = Object.entries(node);

    /* 形态 2：扁平映射 { "--color-primary": "#2A6CDD" } */
    if (entries.length && entries.every(([, v]) => typeof v === 'string')) {
      entries.forEach(([k, v]) => { if (VALUE_LIKE.test(v)) out.set(k, v); });
      return;
    }

    /* 形态 3：继续下钻，路径作为变量名 */
    entries.forEach(([k, v]) => walk(v, prefix ? prefix + '/' + k : k));
  }
  return out;
}

const figma = FIGMA ? loadFigma(FIGMA) : new Map();

/* ---------- 合并多页统计 ---------- */
function merge(key) {
  const map = new Map();
  for (const p of pages) {
    const arr = (p && p[key]) || [];
    for (const e of arr) {
      const cur = map.get(e.value);
      if (cur) {
        cur.count += e.count;
        (e.props || []).forEach((pr) => { cur.props[pr] = (cur.props[pr] || 0) + 1; });
      } else {
        map.set(e.value, { value: e.value, count: e.count, props: {}, samples: [] });
        (e.props || []).forEach((pr) => { map.get(e.value).props[pr] = (e.props[pr] || 0) + 1; });
      }
      if (e.sample && map.get(e.value).samples.length < 3) map.get(e.value).samples.push(e.sample);
    }
  }
  /* props 累加时是对象（带次数），输出前转成按次数排序的数组，下游统一当数组用 */
  return [...map.values()]
    .filter((e) => e.count >= MIN_COUNT)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({
      value: e.value,
      count: e.count,
      props: Object.keys(e.props).sort((x, y) => e.props[y] - e.props[x]),
      samples: e.samples
    }));
}

const C = {
  colors: merge('colors'),
  fontSizes: merge('fontSizes'),
  fontWeights: merge('fontWeights'),
  lineHeights: merge('lineHeights'),
  fontFamilies: merge('fontFamilies'),
  spacings: merge('spacings'),
  radii: merge('radii'),
  shadows: merge('shadows'),
  borderWidths: merge('borderWidths'),
  zIndexes: merge('zIndexes')
};

/* ---------- 结构特征汇总 ---------- */
const struct = {};
const metrics = {};
for (const p of pages) {
  const s = p.structure || {};
  for (const [k, v] of Object.entries(s)) struct[k] = (struct[k] || 0) + v;
  const m = p.metrics || {};
  for (const [k, v] of Object.entries(m)) if (v && !metrics[k]) metrics[k] = v;
}

/* ---------- 颜色语义初判（只给候选，明确标注待确认） ---------- */
const isGray = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
};
const isLight = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
};

function topByProp(list, prop) {
  return list
    .filter((e) => e.props && e.props.includes(prop))
    .sort((a, b) => b.count - a.count)[0];
}

const guess = {};
const bgTop = topByProp(C.colors, 'background-color');
const fgTop = topByProp(C.colors, 'color');
const bdTop = topByProp(C.colors, 'border-color');
if (bgTop) guess.pageBg = bgTop.value + '（背景色第 1 高频）';
if (fgTop) guess.textPrimary = fgTop.value + '（文字色第 1 高频）';
if (bdTop) guess.border = bdTop.value + '（描边色第 1 高频）';
/* 主色候选：非灰、用于背景、非页面底色里频次最高的 */
const primaryCand = C.colors
  .filter((e) => e.props && e.props.includes('background-color'))
  .filter((e) => !isGray(e.value) && e.value !== (bgTop && bgTop.value))
  .sort((a, b) => b.count - a.count)[0];
if (primaryCand) guess.primary = primaryCand.value + '（非灰背景色第 1 高频，**必须人工确认是否为品牌主色**）';

/* ---------- 网格拟合 ---------- */
const pxOf = (s) => parseFloat(String(s).replace('px', '')) || 0;
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/* 拟合网格基数时要先剔离群值：一个 15px 就能把 gcd 从 8 拉到 1，
   拟合结果反而最没用。按「出现次数不低于最高频 5%」筛出核心档位。 */
const maxSp = C.spacings.reduce((m, e) => Math.max(m, e.count), 1);
const coreSp = C.spacings.filter((e) => e.count >= maxSp * 0.05).map((e) => pxOf(e.value)).filter((n) => n > 0);
let gridFit = 0;
if (coreSp.length) gridFit = coreSp.reduce((acc, n) => gcd(acc, n), coreSp[0]);

/* 覆盖率比裸 gcd 更有用：「80% 的间距落在 8px 网格上」比「公约数是 4」好判读 */
function coverage(base) {
  const total = C.spacings.reduce((s, e) => s + e.count, 0) || 1;
  const hit = C.spacings.filter((e) => pxOf(e.value) % base === 0).reduce((s, e) => s + e.count, 0);
  return Math.round((hit / total) * 100);
}
const cover = { 4: coverage(4), 8: coverage(8) };
const offGrid = C.spacings.filter((e) => pxOf(e.value) % GRID !== 0).slice(0, 10);

/* ---------- 设计稿 ↔ 线上 差异 ---------- */
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/\.(\d)/g, '0.$1');
let figmaDiff = null;
if (figma.size) {
  const onlineColors = new Set(C.colors.map((e) => norm(e.value)));
  const figmaColors = new Map();
  for (const [name, value] of figma) {
    if (/^(#|rgba?\()/i.test(value)) figmaColors.set(name, norm(value));
  }
  const onlineSet = new Set([...onlineColors]);
  const figmaSet = new Set([...figmaColors.values()]);

  const onlyFigma = [...figma.entries()].filter(([, v]) => /^(#|rgba?\()/i.test(v) && !onlineSet.has(norm(v)));
  const onlyOnline = C.colors.filter((e) => !figmaSet.has(norm(e.value)));

  figmaDiff = {
    figmaColorCount: figmaColors.size,
    onlineColorCount: onlineColors.size,
    matched: [...figmaSet].filter((v) => onlineSet.has(v)).length,
    /* F1：设计稿有、线上没落地 */
    onlyInFigma: onlyFigma.slice(0, 30).map(([n, v]) => ({ name: n, value: v })),
    /* F2：线上在用、设计稿没定义 */
    onlyInOnline: onlyOnline.slice(0, 30).map((e) => ({ value: e.value, count: e.count })),
    onlyInFigmaTotal: onlyFigma.length,
    onlyInOnlineTotal: onlyOnline.length
  };
}

/* ---------- 推断该建哪些文档 ---------- */
const has = (k) => (struct[k] || 0) > 0;
const pageTypes = [];
if (has('tables') || has('paginations')) pageTypes.push('list（列表页：检测到表格/分页）');
if (has('forms') || has('inputs')) pageTypes.push('form（表单页：检测到表单/输入控件）');
/* 仪表盘只认图表：卡片在列表页、详情页都很常见，拿卡片推断仪表盘会误报 */
if (has('charts')) pageTypes.push('dashboard（仪表盘页：检测到图表）');
if (has('drawers') || has('modals')) pageTypes.push('overlay（浮层：检测到弹窗/抽屉）');
if (has('header') || has('sidebar')) pageTypes.push('layout（导航布局：检测到顶栏/侧边栏）');

/* 组件级信号另列：卡片/标签在多种页面都有，但它们值得单独建组件文档 */
const compHints = [];
if (has('cards')) compHints.push('卡片（' + struct.cards + ' 处）');
if (has('tags')) compHints.push('标签 Tag（' + struct.tags + ' 处）');
if (has('tabs')) compHints.push('标签页 / 多标签（' + struct.tabs + ' 处）');
if (has('buttons')) compHints.push('按钮（' + struct.buttons + ' 处）');
if (has('inputs')) compHints.push('输入控件（' + struct.inputs + ' 处）');

/* ---------- 输出 ---------- */
function table(list, cols) {
  if (!list.length) return '（无）\n';
  const head = '| ' + cols.map((c) => c.title).join(' | ') + ' |';
  const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const rows = list.map((e) => '| ' + cols.map((c) => String(c.get(e)).replace(/\|/g, '\\|')).join(' | ') + ' |');
  return [head, sep, ...rows].join('\n') + '\n';
}

const L = [];
L.push('# 取值挖掘报告');
L.push('');
L.push('- 数据源：线上采集 ' + pages.length + ' 份' + (FIGMA ? ' + 设计稿导出 ' + path.basename(FIGMA) : ''));
L.push('- 网格基数：' + GRID + 'px；最小出现次数：' + MIN_COUNT);
L.push('');

L.push('## 1. 页面结构特征 → 该建哪些文档');
L.push('');
L.push('```');
Object.entries(struct).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { if (v) L.push('  ' + k.padEnd(12) + v); });
L.push('```');
L.push('');
L.push('推断页面/组件类型：');
L.push('');
(pageTypes.length ? pageTypes : ['（结构特征不足，需人工确认页面类型）']).forEach((t) => L.push('- ' + t));
L.push('');
if (compHints.length) {
  L.push('建议单独建组件文档的信号：' + compHints.join('、'));
  L.push('');
}
if (Object.keys(metrics).length) {
  L.push('关键尺寸（渲染实测）：');
  L.push('');
  L.push('| 指标 | 实测值 |');
  L.push('| --- | --- |');
  Object.entries(metrics).forEach(([k, v]) => L.push('| ' + k + ' | ' + v + 'px |'));
  L.push('');
}

L.push('## 2. 颜色候选');
L.push('');
L.push(table(C.colors.slice(0, 30), [
  { title: '取值', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count },
  { title: '用途分布', get: (e) => (e.props || []).slice(0, 3).join(' / ') },
  { title: '样例选择器', get: (e) => '`' + ((e.samples && e.samples[0]) || '') + '`' }
]));
L.push('语义初判（**仅供参考，必须人工确认**）：');
L.push('');
Object.entries(guess).forEach(([k, v]) => L.push('- ' + k + '：' + v));
L.push('');

L.push('## 3. 字阶候选');
L.push('');
L.push(table(C.fontSizes.slice(0, 16), [
  { title: '字号', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count }
]));
if (C.lineHeights.length) {
  L.push('行高：' + C.lineHeights.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.fontWeights.length) {
  L.push('字重：' + C.fontWeights.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.fontFamilies.length) {
  L.push('字体族：' + C.fontFamilies.slice(0, 5).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}

L.push('## 4. 间距候选与网格拟合');
L.push('');
L.push(table(C.spacings.slice(0, 16), [
  { title: '取值', get: (e) => '`' + e.value + '`' },
  { title: '次数', get: (e) => e.count },
  { title: '主要用途', get: (e) => (e.props || []).slice(0, 3).join(' / ') }
]));
L.push('- 核心档位公约数（已剔除离群值）：**' + (gridFit || '—') + 'px**');
L.push('- 网格覆盖率：4px → ' + cover[4] + '%；8px → ' + cover[8] + '%（覆盖率 = 落在该网格上的间距出现次数占比）');
L.push('- 期望基数：' + GRID + 'px → ' + (cover[GRID] >= 90 ? '覆盖良好' : '**覆盖偏低，需人工确认是设计不规整还是基线不同**'));
if (offGrid.length) {
  L.push('- 不合 ' + GRID + 'px 网格的间距：' + offGrid.map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
}
L.push('');

L.push('## 5. 圆角 / 阴影 / 描边 / 层级');
L.push('');
L.push('圆角：' + (C.radii.length ? C.radii.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、') : '（无）'));
L.push('');
L.push('描边宽度：' + (C.borderWidths.length ? C.borderWidths.slice(0, 5).map((e) => '`' + e.value + '`(' + e.count + ')').join('、') : '（无）'));
L.push('');
if (C.zIndexes.length) {
  L.push('z-index：' + C.zIndexes.slice(0, 8).map((e) => '`' + e.value + '`(' + e.count + ')').join('、'));
  L.push('');
}
if (C.shadows.length) {
  L.push('阴影（取前 6）：');
  L.push('');
  L.push(table(C.shadows.slice(0, 6), [
    { title: '阴影', get: (e) => '`' + e.value.slice(0, 90) + '`' },
    { title: '次数', get: (e) => e.count }
  ]));
}

if (figmaDiff) {
  L.push('## 6. 设计稿 ↔ 线上实现 差异');
  L.push('');
  L.push('- 设计稿色值 ' + figmaDiff.figmaColorCount + ' 个，线上色值 ' + figmaDiff.onlineColorCount + ' 个，完全匹配 ' + figmaDiff.matched + ' 个');
  L.push('');
  if (figmaDiff.onlyInFigmaTotal) {
    L.push('### F1 设计稿有、线上未落地（' + figmaDiff.onlyInFigmaTotal + ' 个）');
    L.push('');
    L.push('| 设计稿变量 | 取值 |');
    L.push('| --- | --- |');
    figmaDiff.onlyInFigma.forEach((e) => L.push('| ' + e.name + ' | `' + e.value + '` |'));
    L.push('');
  }
  if (figmaDiff.onlyInOnlineTotal) {
    L.push('### F2 线上在用、设计稿未定义（' + figmaDiff.onlyInOnlineTotal + ' 个）');
    L.push('');
    L.push('| 线上取值 | 次数 |');
    L.push('| --- | --- |');
    figmaDiff.onlyInOnline.forEach((e) => L.push('| `' + e.value + '` | ' + e.count + ' |'));
    L.push('');
  }
  L.push('> F1/F2 都要人工判读：F1 可能是设计稿超前（线上还没改），也可能是设计稿虚胖；');
  L.push('> F2 往往是线上历史遗留色，是收编进规范还是线上整改，得定哪边是意图源。');
  L.push('');
}

L.push('## 7. 存疑项（必读）');
L.push('');
L.push('1. 颜色语义命名（主色 / 成功 / 警告 / 错误）**机器判断不可靠**，上表只是频次排序，必须由设计师确认');
L.push('2. 采集到的是渲染后 computed style，含浏览器默认值与内联样式，频次高不代表是规范值');
L.push('3. 单个页面的采集结果不具备代表性，**至少采集 3 个不同页面**再合并跑，噪声会明显下降');
L.push('4. 状态色（hover / active / disabled）默认态采集不到，需人工补或在页面上手动触发后再采一次');
L.push('5. 图表系列色、数据可视化色通常不在 computed style 里，需从设计稿补');
L.push('');

const report = L.join('\n');

/* ---------- tokens.md 草稿 ---------- */
if (opts['emit-tokens']) {
  const T = [];
  T.push('# 设计 Token 汇总（草稿 · 由 mine-tokens.js 生成，需人工确认后转正）');
  T.push('');
  T.push('> 本表由线上采集 + 设计稿导出自动生成，语义命名与取值均**待确认**。');
  T.push('> 确认后删除本提示，并作为 `foundation/tokens.md` 的正式内容。');
  T.push('');
  T.push('## 颜色变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.colors.slice(0, 24).forEach((e, i) => {
    const props = (e.props || []).join('/');
    T.push('| --color-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：线上出现 ' + e.count + ' 次，用途 ' + props + ' |');
  });
  T.push('');
  T.push('## 字号变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.fontSizes.slice(0, 12).forEach((e, i) => {
    T.push('| --font-size-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：出现 ' + e.count + ' 次 |');
  });
  T.push('');
  T.push('## 间距变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.spacings.slice(0, 14).forEach((e) => {
    const n = pxOf(e.value);
    T.push('| --space-' + n + ' | ' + e.value + ' | 待确认：出现 ' + e.count + ' 次' + (n % GRID ? '（不合 ' + GRID + 'px 网格）' : '') + ' |');
  });
  T.push('');
  T.push('## 圆角变量');
  T.push('');
  T.push('| Token | 默认值 | 用途 |');
  T.push('|-------|--------|------|');
  C.radii.slice(0, 6).forEach((e, i) => {
    T.push('| --radius-candidate-' + (i + 1) + ' | ' + e.value + ' | 待命名：出现 ' + e.count + ' 次 |');
  });
  T.push('');
  fs.writeFileSync(opts['emit-tokens'], T.join('\n'), 'utf8');
  if (!AS_JSON) console.log('· Token 草稿已写入：' + opts['emit-tokens'] + '\n');
}

if (AS_JSON) {
  console.log(JSON.stringify({
    pages: pages.length, structure: struct, metrics,
    colors: C.colors, fontSizes: C.fontSizes, spacings: C.spacings,
    radii: C.radii, shadows: C.shadows, gridFit, guesses: guess,
    figmaDiff, pageTypes
  }, null, 2));
} else if (opts.out) {
  fs.writeFileSync(opts.out, report, 'utf8');
  console.log('· 报告已写入：' + opts.out);
} else {
  console.log(report);
}
process.exit(0);
