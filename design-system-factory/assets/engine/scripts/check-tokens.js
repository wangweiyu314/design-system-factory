#!/usr/bin/env node
/**
 * Design Token 双向对齐校验器  v2.0
 * ------------------------------------------------------------
 * 「双向」指两个方向同时校验，缺一不可：
 *
 *   正向（规范 → 交付物）：规范里定义的 Token，交付物引用时取值是否漂移
 *   反向（交付物 → 规范）：交付物里实际在用的 Token，规范是否收编、是否真的定义过
 *
 * 检查项：
 *   [E1] 硬编码色值   —— 正文出现未曾在 :root 声明的 hex / rgb 字面量
 *   [E2] 取值漂移     —— 文件 :root 定义与 foundation/tokens.md 不一致
 *   [E3] 未定义引用   —— var(--x) 被使用，但本文件 :root 里没有定义（引用即失效）
 *   [W1] 规范未收编   —— 文件已定义并使用，但 tokens.md 中没有（潜在双源漂移）
 *   [I1] 规范未落地   —— tokens.md 有定义，但全库零使用（信息项，用于清理废 Token）
 *
 * v2.1 新增：
 *   - 识别 JS 动态读取的 Token（getPropertyValue('--x') 及自定义封装函数），
 *     这类引用同样算「已落地」，只扫 var() 会漏判
 *   - tokens.md 用途列标注「预留 / 色板 / 暂不使用 / 不适用」的 Token
 *     单列为「已标注预留」，不计入 [I1]
 *
 * 用法：
 *   node design-specs/scripts/check-tokens.js [目标目录] [--json] [--strict] [--quiet]
 *        --json    输出机器可读 JSON
 *        --strict  把 [W1] 规范未收编 也计为失败
 *        --quiet   精简输出：只打计数，不打 [I1] 未落地 / 已标注预留清单（门禁 / CI 场景用）
 *
 * 退出码：0 = 通过；1 = 存在 E 级问题（--strict 时 W 级也计失败）
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
const AS_JSON = args.includes('--json');
const STRICT = args.includes('--strict');
/* --quiet：门禁 / CI 场景只关心「有没有问题」，不打 I1 未落地 / 已标注预留清单 */
const QUIET = args.includes('--quiet');

/* 目标可能是单个文件（只想校验一个页面时），也可能是目录 */
const ROOT_IS_FILE = fs.existsSync(ROOT) && fs.statSync(ROOT).isFile();

/* 规范包根目录：从目标位置向上找，支持「工作区根」「design-specs 目录」
 * 以及「包内任意子目录 / 单个文件」三种调用位置 */
function findSpecRoot(start) {
  let dir = ROOT_IS_FILE ? path.dirname(start) : start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'foundation', 'tokens.md'))) return dir;
    if (fs.existsSync(path.join(dir, 'design-specs', 'foundation', 'tokens.md'))) return path.join(dir, 'design-specs');
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  /* 兜底：本脚本固定位于规范包 scripts/ 下，规范文件必在 ../foundation/tokens.md。
   * 场景：校验包外产物（如 new-page.js --out=/tmp/x.html）时向上查找会一路到 / 落空，
   * 曾导致「规范 Token 0」→ 全部 Token 误报 [W1] 规范未收编。 */
  const own = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(own, 'foundation', 'tokens.md'))) return own;
  return path.join(start, 'design-specs');
}
const SPEC_ROOT = findSpecRoot(ROOT);
const SPEC_TOKENS = path.join(SPEC_ROOT, 'foundation', 'tokens.md');

const SKIP_DIRS = ['node_modules', '.git', '.workbuddy-ai', 'design-specs/scripts/node_modules'];

/* 文档扫描豁免：JS 动态变量与文档占位符，不是设计 Token */
const DOC_VAR_ALLOW = new Set(['--xxx', '--count', '--n']);

/* ---------- 收集文件 ---------- */
function collect(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) { if (entry.name.endsWith(ext)) out.push(full); continue; }
    /* 自带 foundation/tokens.md 的子目录 = 另一个独立规范包（如并存的元技能引擎副本），
     * 它的 Token 属于它自己的规范，不该拿本包的规范来判「未收编」。
     * 用「是否自带规范文件」判定而非硬编码目录名，换个工作区同样成立。 */
    if (full !== SPEC_ROOT && fs.existsSync(path.join(full, 'foundation', 'tokens.md'))) continue;
    collect(full, ext, out);
  }
  return out;
}

/* ---------- 解析 tokens.md 为规范取值表 ----------
 * spec       —— 全部 Token（含尺寸/阴影/字体等非色值），用于「是否收编」判断
 * reserved   —— 用途列标注为「预留 / 色板 / 暂不使用 / 不适用」的 Token，
 *               属刻意保留不强制落地，不计入 [I1] 未落地
 * 取值漂移比对时另用 isColor() 过滤出色值子集
 */
const RESERVED_RE = /预留|色板|暂不使用|不适用|保留|废弃/;

function parseSpec(file) {
  const spec = new Map();
  const reserved = new Set();
  if (!fs.existsSync(file)) return { spec, reserved };
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
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

/* ---------- 提取 JS 中动态读取的 Token ----------
 * 样式表里用 var(--x)，但 JS 里常通过 getPropertyValue('--x') 或自定义
 * 封装函数（如 chartToken('--chart-1')）读取。这类引用同样是「已落地」，
 * 只扫 var() 会漏判，把它们计入全库使用集合。
 */
function parseScriptTokens(raw) {
  const found = new Set();
  const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(raw)) !== null) {
    const refs = m[1].match(/['"](--[a-z0-9-]+)['"]/g) || [];
    refs.forEach((r) => found.add(r.replace(/['"]/g, '')));
  }
  return found;
}

/* ---------- 提取 :root 块内的自定义属性定义 ---------- */
function parseRootVars(css) {
  const vars = new Map();
  const rootRe = /:root\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = rootRe.exec(css)) !== null) {
    const varRe = /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;]?/gi;
    let v;
    while ((v = varRe.exec(m[1])) !== null) vars.set(v[1], v[2].trim());
  }
  return vars;
}

/* ---------- 归一化：便于比对 rgba(42, 108, 221, 0.1) 与 rgba(42,108,221,.1) ---------- */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\.(\d)/g, '0.$1')
    .replace(/\b0+(\d)/g, '$1');
}

const isColor = (s) => /^(#|rgba?\()/i.test(norm(s));

/* ---------- 主流程 ---------- */
const { spec, reserved } = parseSpec(SPEC_TOKENS);
/* 传文件时只扫该文件；传目录时递归扫（原行为不变） */
const ROOT_EXT = path.extname(ROOT).toLowerCase();
const htmlFiles = ROOT_IS_FILE ? (ROOT_EXT === '.html' ? [ROOT] : []) : collect(ROOT, '.html');
const mdFiles = ROOT_IS_FILE ? (ROOT_EXT === '.md' ? [ROOT] : []) : collect(SPEC_ROOT, '.md');

const usedAcrossAll = new Set(); // 全库实际引用过的 Token（用于 I1）
const issues = [];              // 逐文件问题
let e1 = 0, e2 = 0, e3 = 0, w1 = 0;

for (const file of htmlFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file) || file;

  const rootVars = parseRootVars(raw);
  // 本文件 :root 已声明的颜色字面量集合（用于判断硬编码是否属已声明值）
  const declaredColors = new Set(
    [...rootVars.values()].filter(isColor).map(norm)
  );

  // 剔除 :root 块与注释后再扫描正文
  const body = raw
    .replace(/:root\s*\{[\s\S]*?\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const hardcodes = [];
  const undefinedRefs = new Map();

  /* JS 动态读取的 Token 视同已使用（计入全库，但不参与 E3 定义检查） */
  parseScriptTokens(raw).forEach((t) => usedAcrossAll.add(t));

  body.split('\n').forEach((line, idx) => {
    const no = idx + 1;
    if (/^\s*<!--/.test(line)) return;
    if (/xmlns|data-page-node-id/.test(line)) return;
    if (/token-ignore/i.test(line)) return; // 显式豁免：行内含 token-ignore

    /* [E3] var() 引用是否在本文件定义过 */
    const varRefs = line.match(/var\(\s*(--[a-z0-9-]+)/gi) || [];
    for (const ref of varRefs) {
      const name = ref.replace(/var\(\s*/i, '');
      usedAcrossAll.add(name);
      if (!rootVars.has(name)) {
        if (!undefinedRefs.has(name)) undefinedRefs.set(name, []);
        undefinedRefs.get(name).push(no);
      }
    }

    /* [E1] 硬编码色值 */
    const literals = line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g);
    if (!literals) return;
    for (const lit of literals) {
      if (!declaredColors.has(norm(lit))) {
        hardcodes.push({ line: no, value: lit, text: line.trim().slice(0, 110) });
      }
    }
  });

  /* [E2] 正向：取值漂移 */
  const drifts = [];
  /* [W1] 反向：规范未收编 */
  const unregistered = [];
  for (const [name, value] of rootVars) {
    if (spec.has(name)) {
      if (isColor(value) && norm(spec.get(name)) !== norm(value)) {
        drifts.push({ name, file: value, spec: spec.get(name) });
      }
    } else {
      unregistered.push({ name, value });
    }
  }

  e1 += hardcodes.length;
  e2 += drifts.length;
  e3 += undefinedRefs.size;
  w1 += unregistered.length;

  if (hardcodes.length || drifts.length || undefinedRefs.size || unregistered.length) {
    issues.push({ file: rel, hardcodes, drifts, undefinedRefs: [...undefinedRefs], unregistered });
  }
}

/* ---------- [I1] 规范已定义但全库零使用 ---------- */
const unusedAll = [...spec.keys()].filter((t) => !usedAcrossAll.has(t));
const unused = unusedAll.filter((t) => !reserved.has(t));
const unusedReserved = unusedAll.filter((t) => reserved.has(t));

/* ---------- 规范文档内部一致性：md 中引用的 Token 是否都已收编 ---------- */
const docOrphans = new Map();
for (const md of mdFiles) {
  if (path.basename(md) === 'tokens.md') continue;
  const text = fs.readFileSync(md, 'utf8');
  const refs = text.match(/var\(\s*(--[a-z0-9-]+)/gi) || [];
  const set = new Set(refs.map((r) => r.replace(/var\(\s*/i, '')));
  for (const t of set) {
    if (DOC_VAR_ALLOW.has(t)) continue;
    if (!spec.has(t) && !docOrphans.has(t)) {
      docOrphans.set(t, []);
      usedAcrossAll.add(t);
    }
    if (!spec.has(t)) docOrphans.get(t).push(path.basename(md));
  }
}

/* ---------- 输出 ---------- */
const ok = e1 + e2 + e3 === 0 && (!STRICT || w1 === 0);

if (AS_JSON) {
  console.log(JSON.stringify({
    scanned: htmlFiles.length,
    specTokens: spec.size,
    summary: { hardcode: e1, drift: e2, undefinedRef: e3, unregistered: w1, unusedSpecToken: unused.length, unusedReserved: unusedReserved.length },
    issues,
    unusedSpecTokens: unused,
    unusedReservedTokens: unusedReserved,
    docOrphanTokens: [...docOrphans].map(([token, files]) => ({ token, files: [...new Set(files)] })),
    pass: ok
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

const L = (s) => console.log(s);
L('===== Design Token 双向对齐校验 =====\n');
L((ROOT_IS_FILE ? '扫描文件　　：' : '扫描目录　　：') + ROOT);
L('HTML 文件　 ：' + htmlFiles.length);
L('规范 Token　：' + spec.size + '（来源 ' + path.relative(ROOT, SPEC_TOKENS) + '）\n');

if (issues.length) {
  for (const it of issues) {
    L('---- ' + it.file + ' ----');
    if (it.drifts.length) {
      L('  [E2] Token 取值偏离规范（正向）');
      it.drifts.forEach((d) => L('       ' + d.name + '：文件=' + d.file + '　规范=' + d.spec));
    }
    if (it.undefinedRefs.length) {
      L('  [E3] 引用了未定义的 Token（反向）');
      it.undefinedRefs.forEach(([name, lines]) =>
        L('       ' + name + '　行：' + lines.slice(0, 6).join(',') + (lines.length > 6 ? '…' : '')));
    }
    if (it.hardcodes.length) {
      L('  [E1] 硬编码色值 ' + it.hardcodes.length + ' 处');
      it.hardcodes.forEach((h) => L('       L' + h.line + '　' + h.value + '　' + h.text));
    }
    if (it.unregistered.length) {
      L('  [W1] 规范未收编的 Token ' + it.unregistered.length + ' 个（反向）');
      it.unregistered.forEach((u) => L('       ' + u.name + ' = ' + u.value));
    }
    L('');
  }
} else {
  L('结果：全部通过 —— 无硬编码、无取值漂移、无未定义引用。\n');
}

L('----');
L('硬编码色值 [E1]　　　：' + e1);
L('取值漂移　 [E2]　　　：' + e2);
L('未定义引用 [E3]　　　：' + e3);
L('规范未收编 [W1]　　　：' + w1 + (STRICT ? '（strict 模式计为失败）' : '（提示项）'));
L('规范未落地 [I1]　　　：' + unused.length + ' 个 Token 全库零使用');
if (unused.length && !QUIET) {
  [...unused].sort().forEach((t) => L('       ' + t + ' = ' + spec.get(t)));
}
if (unusedReserved.length) {
  L('其中已标注预留　　　：' + unusedReserved.length + ' 个（色板/预留，不要求落地）');
  /* --quiet 只保留计数，不打清单：门禁 / CI 场景这些纯信息项全是噪音 */
  if (!QUIET) [...unusedReserved].sort().forEach((t) => L('       ' + t + ' = ' + spec.get(t)));
}
if (docOrphans.size) {
  L('规范文档未收编引用　　：' + docOrphans.size + ' 个 Token 在 .md 中出现但未登记');
  [...docOrphans].slice(0, 12).forEach(([t, files]) => L('       ' + t + '　← ' + [...new Set(files)].join(', ')));
}
L('\n说明：图表数据驱动配色属数据而非样式，如需豁免在行尾加 /* token-ignore */。');
process.exit(ok ? 0 : 1);
