#!/usr/bin/env node
/**
 * 设计稿 ↔ 规范 双向核对器  v1.0
 * ------------------------------------------------------------
 * 解决「设计稿 → 规范文档」这段人工转录链路的误差问题：
 * 把设计稿导出的变量与 foundation/tokens.md 做双向比对，输出三类差异
 *
 *   D3 同名不同值 —— 转录误差（核心目标）：两边取值为同一意图却不一致
 *   D1 设计稿有、规范无 —— 规范未收编
 *   D2 规范有、设计稿无 —— 设计稿未同步 或 规范虚胖
 *
 * 用法：
 *   node design-specs/scripts/check-design-sync.js <导出文件> [--strict] [--json] [--quiet]
 *        --json    输出机器可读 JSON
 *        --strict  [D1][D2] 也计为失败（默认只有 D3 计失败）
 *        --quiet   精简输出：只打计数，不打明细清单
 *
 * 支持的导出形态（自动识别）：
 *   1) Figma 原生变量导出      {"name":"color/primary","value":"#2A6CDD"} 或带 collections/variables
 *   2) Tokens Studio JSON      {"global":{"color":{"primary":{"value":"#2A6CDD","type":"color"}}}}
 *   3) 扁平 JSON               {"--color-primary":"#2A6CDD"} 或 [{"name":..,"value":..}]
 *   4) CSV / TSV 表格          表头含 name/value（或 名称/值、Token/默认值）
 *
 * 只读取、只报告，不改任何文件——改规范还是改设计稿由人决定。
 *
 * 退出码：0 = 无差异；1 = 存在差异（或参数错误）
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const STRICT = args.includes('--strict');
const QUIET = args.includes('--quiet');
const INPUT = args.find((a) => !a.startsWith('--'));

/* scripts/ 位于 design-specs/ 下，规范根目录即上一级 */
const SPEC_ROOT = path.resolve(__dirname, '..');
const SPEC_TOKENS = path.join(SPEC_ROOT, 'foundation', 'tokens.md');

const RESERVED_RE = /预留|色板|暂不使用|不适用|保留|废弃/;

/* ---------- 解析 tokens.md（与 check-tokens.js 同一套规则） ---------- */
function parseSpec(file) {
  const spec = new Map();
  const reserved = new Set();
  if (!fs.existsSync(file)) return { spec, reserved };
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\|\s*(--[a-z0-9-]+)\s*\|([^\n]*)$/i.exec(raw.trim());
    if (!m) continue;
    const name = m[1];
    const cells = m[2].split('|').map((c) => c.replace(/`/g, '').trim());
    const value = cells[0];
    const note = cells.slice(1).join(' ');
    if (/^(--|\|)/.test(value) || spec.has(name)) continue;
    spec.set(name, value);
    if (RESERVED_RE.test(note)) reserved.add(name);
  }
  return { spec, reserved };
}

/* ---------- 归一化：#2a6cdd / #2A6CDD、rgba(0,0,0,.6) / rgba(0, 0, 0, 0.6) 视作相同 ---------- */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\.(\d)/g, '0.$1')
    .replace(/\b0+(\d)/g, '$1');
}

/* ---------- 名称归一：去 -- 前缀、驼峰转连字符、斜杠点转连字符、统一小写 ----------
 * 设计稿命名千奇百怪（color/primary、colorPrimary、Color Primary、--color-primary），
 * 统一成规范 Token 的形状才能配对 */
function normName(s) {
  return String(s)
    .trim()
    .replace(/^--/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[/\\._]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const LOOKS_LIKE_VALUE = (v) =>
  typeof v === 'number' || /^(#|rgba?\(|hsla?\()/i.test(String(v)) || /^-?[\d.]+\s*(px|rem|em|%|ms|s|vh|vw|deg)?$/i.test(String(v).trim());

/* hex + opacity → rgba()。Figma 常把填充色与不透明度分开导出，
 * 手抄时最容易丢掉 alpha，直接合成后再比对 */
function hexToRgba(hex, opacity) {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // 忽略 hex 自带 alpha，以 opacity 字段为准
  if (h.length !== 6) return null;
  const a = String(opacity).endsWith('%') ? parseFloat(opacity) / 100 : parseFloat(opacity);
  if (!isFinite(a)) return null;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/* ---------- 把任意形态的导出摊平成 [{name, path, value}] ----------
 * path 保留完整层级（如 global/color/primary），配对时会逐级去掉前缀去试，
 * 这样既支持「设计稿名 = Token 名」，也支持 Tokens Studio 那种带分组的嵌套结构 */
function flatten(node, path, out) {
  if (node == null) return;
  const segs = path || [];

  if (Array.isArray(node)) {
    node.forEach((item) => flatten(item, segs, out));
    return;
  }

  if (typeof node === 'object') {
    /* 显式别名优先：{ name/token: "--color-primary", value: "#..." } */
    const explicitName = node.token || node.tokenName || node.alias || node.name || node.key || node.id;
    const hint = typeof explicitName === 'string' ? [...segs, explicitName] : segs;

    if (node.value !== undefined && (typeof node.value === 'string' || typeof node.value === 'number')) {
      const v = node.opacity != null && /^#/i.test(String(node.value))
        ? hexToRgba(node.value, node.opacity) || node.value
        : node.value;
      if (hint.length) out.push({ name: hint[hint.length - 1], path: hint, value: v });
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') flatten(v, [...segs, k], out);
      else if (LOOKS_LIKE_VALUE(v)) {
        out.push({ name: /^(value|val|默认值)$/i.test(k) && segs.length ? segs[segs.length - 1] : k, path: [...segs, k], value: v });
      }
    }
    return;
  }

  if (LOOKS_LIKE_VALUE(node) && segs.length) {
    out.push({ name: segs[segs.length - 1], path: segs, value: node });
  }
}

/* ---------- 名称配对：逐级去掉前缀去试规范 Token ---------- */
function resolveName(row, specByNorm) {
  const segs = (row.path || [row.name]).map(normName).filter(Boolean);
  if (!segs.length) return null;
  const cands = [];
  for (let i = 0; i < segs.length; i++) cands.push('--' + segs.slice(i).join('-'));
  const leaf = '--' + segs[segs.length - 1];
  if (!cands.includes(leaf)) cands.push(leaf);
  for (const c of cands) if (specByNorm.has(c)) return c;
  return cands[0]; // 都配不上：用最长（信息最全）的名字报出来
}

/* ---------- 载入导出文件 ---------- */
function loadDesign(file) {
  if (!fs.existsSync(file)) {
    console.error('✗ 找不到设计稿导出文件：' + file);
    console.error('  格式示例见 ' + path.join(path.relative(process.cwd(), __dirname), 'design-export.sample.json'));
    process.exit(1);
  }
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, 'utf8');
  const out = [];

  if (ext === '.csv' || ext === '.tsv') {
    const delim = ext === '.tsv' ? '\t' : ',';
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      console.error('✗ 表格至少要有表头 + 一行数据');
      process.exit(1);
    }
    const head = lines[0].split(delim).map((h) => h.trim().toLowerCase());
    const iName = head.findIndex((h) => /name|token|名称|变量名|变量/.test(h));
    const iValue = head.findIndex((h) => /value|val|默认值|值/.test(h));
    const iOpacity = head.findIndex((h) => /opacity|alpha|透明|不透明/.test(h));
    if (iName < 0 || iValue < 0) {
      console.error('✗ 表头需包含名称列与取值列，当前表头：' + head.join(' | '));
      process.exit(1);
    }
    for (const line of lines.slice(1)) {
      const c = line.split(delim).map((x) => x.trim());
      if (!c[iName]) continue;
      const v = iOpacity >= 0 && c[iOpacity] && /^#/i.test(c[iValue] || '')
        ? hexToRgba(c[iValue], c[iOpacity]) || c[iValue]
        : c[iValue];
      out.push({ name: c[iName], path: [c[iName]], value: v });
    }
    return out;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('✗ JSON 解析失败：' + e.message);
    process.exit(1);
  }
  flatten(data, '', out);
  return out;
}

/* ---------- 主流程 ---------- */
if (!INPUT) {
  console.error('用法：node design-specs/scripts/check-design-sync.js <导出文件> [--strict] [--json] [--quiet]');
  process.exit(1);
}

const { spec, reserved } = parseSpec(SPEC_TOKENS);
if (!spec.size) {
  console.error('✗ 未能从 ' + SPEC_TOKENS + ' 解析到任何 Token，请确认规范包完整');
  process.exit(1);
}

const specByNorm = new Map();
for (const [k, v] of spec) specByNorm.set('--' + normName(k), v);

const rows = loadDesign(INPUT);
const design = new Map();
for (const r of rows) {
  const k = resolveName(r, specByNorm);
  if (k && !design.has(k)) design.set(k, r.value);
}

const d3 = [];                                   // 同名不同值
for (const [k, dv] of design) {
  if (!specByNorm.has(k)) continue;
  const sv = specByNorm.get(k);
  if (norm(sv) !== norm(dv)) d3.push({ token: k, spec: sv, design: dv });
}
const d1 = [...design.keys()].filter((k) => !specByNorm.has(k)).sort();          // 设计稿有、规范无
const d2all = [...specByNorm.keys()].filter((k) => !design.has(k)).sort();       // 规范有、设计稿无
const d2 = d2all.filter((k) => !reserved.has(k));
const d2Reserved = d2all.filter((k) => reserved.has(k));

const ok = d3.length === 0 && !(STRICT && (d1.length > 0 || d2.length > 0));

/* ---------- 输出 ---------- */
const L = (s) => { if (!AS_JSON) console.log(s); };

if (AS_JSON) {
  console.log(JSON.stringify({
    input: INPUT,
    specTokens: spec.size,
    designVars: design.size,
    d3: d3.map((x) => ({ token: x.token, spec: x.spec, design: x.design })),
    d1, d2, d2Reserved,
    pass: ok,
  }, null, 2));
} else {
  L('===== 设计稿 ↔ 规范 双向核对 =====\n');
  L('设计稿导出　　：' + INPUT);
  L('规范 Token　　：' + spec.size + '（来源 ' + path.relative(process.cwd(), SPEC_TOKENS) + '）');
  L('设计稿变量　　：' + design.size);
  L('\n结果：' + (ok ? '一致，无转录误差。' : '存在差异，见下方明细。') + '\n');

  /* 局部导出时 [D2] 天然会长（规范 171 个 Token 不可能一次导全），
   * 逐条打印会淹没真正要看的 [D3]，故截断 */
  const CAP = 12;
  const list = (arr, fmt) => {
    arr.slice(0, CAP).forEach((t) => L('       ' + fmt(t)));
    if (arr.length > CAP) L('       … 其余 ' + (arr.length - CAP) + ' 项略（加 --json 看全量）');
  };

  L('----');
  L('同名不同值 [D3]　：' + d3.length + '（转录误差，须人工裁决哪边是意图源）');
  if (!QUIET) d3.forEach((x) => L('       ' + x.token + '　规范 ' + x.spec + '　≠　设计稿 ' + x.design));
  L('设计稿有规范无 [D1]　：' + d1.length + (STRICT ? '（strict 模式计为失败）' : '（提示项）'));
  if (!QUIET) list(d1, (t) => t + ' = ' + design.get(t));
  L('规范有设计稿无 [D2]　：' + d2.length + (STRICT ? '（strict 模式计为失败）' : '（提示项）'));
  if (!QUIET) list(d2, (t) => t + ' = ' + specByNorm.get(t));
  if (d2Reserved.length) {
    L('其中已标注预留　　：' + d2Reserved.length + ' 个（色板/预留，不要求设计稿同步）');
    if (!QUIET) list(d2Reserved, (t) => t + ' = ' + specByNorm.get(t));
  }

  if (!ok) {
    L('\n处理顺序：');
    L('  1) 先处理 [D3] —— 确认哪边是「意图源」，再改另一边');
    L('  2) 规范侧改动一律：先改 foundation/tokens.md → 再回灌模板 :root → 跑 check-tokens.js --strict');
    L('  3) 决策表见 foundation/design-sync.md §3');
  }
}

process.exit(ok ? 0 : 1);
