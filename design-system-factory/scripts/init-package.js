#!/usr/bin/env node
/**
 * 设计系统技能包建包器 v1.0
 * ------------------------------------------------------------
 * 把 assets/engine 下的「引擎」（4 个 JS 工具 + 11 套 HTML 模板）复制成一个新技能包，
 * 并完成三件容易出错的事：
 *   1. CSS 类名前缀替换（gf- → 新前缀）——全库统一，漏一处就会样式失效
 *   2. 系统名参数化（脚本里的默认系统名、文档里的品牌词）
 *   3. 生成规范文档骨架（tokens.md / design-sync.md / SKILL.md / 各目录说明）
 *
 * 用法：
 *   node init-package.js --name=<系统名> --prefix=<类名前缀> [--out=<目录>] [--force]
 *
 *   --name    系统中文名，写入文档与生成器默认系统名，必填
 *   --prefix  CSS 类名前缀，小写字母/数字/连字符，如 acme。必填
 *   --out     输出目录，默认 ./<prefix>-design-specs
 *   --force   目标目录非空时仍继续（会覆盖同名文件）
 *   --no-engine  只建文档骨架，不复制引擎（用于已有实现、只想补规范的场景）
 *
 * 建包后还要人做的事（脚本做不了）：
 *   - 用 mine-tokens.js 从线上采集 + 设计稿导出里挖取值，填进 foundation/tokens.md
 *   - 把 tokens.md 定稿的取值回灌到 scripts/ 各模板的 :root
 *   - 按实际页面类型生成 components/ pages/ 文档与 examples/ 标杆页
 *   - 跑 check-tokens.js --strict 直到退出码 0
 *
 * 退出码：0 成功；1 参数错误或目标目录冲突
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
  opts[k] = idx === -1 ? true : a.slice(idx + 1);
}

const NAME = String(opts.name || '').trim();
const PREFIX = String(opts.prefix || '').trim().toLowerCase();
const FORCE = !!opts.force;
const WITH_ENGINE = !opts['no-engine'];

if (!NAME || !PREFIX) {
  console.error('✗ 必填参数缺失。用法：');
  console.error('  node init-package.js --name=<系统名> --prefix=<类名前缀> [--out=<目录>]');
  process.exit(1);
}
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(PREFIX)) {
  console.error('✗ --prefix 只能是小写字母开头、含数字与单个连字符的形式，例如：acme / tx-bank');
  console.error('  收到：' + PREFIX);
  process.exit(1);
}

const OUT = path.resolve(opts.out || path.join(process.cwd(), PREFIX + '-design-specs'));
const PKG = path.basename(OUT);
const FACTORY = path.resolve(__dirname, '..');

if (fs.existsSync(OUT) && fs.readdirSync(OUT).filter((f) => f !== '.DS_Store').length && !FORCE) {
  console.error('✗ 目标目录已存在且非空：' + OUT);
  console.error('  确需覆盖请加 --force，或换一个 --out');
  process.exit(1);
}

const DATE = new Date().toISOString().slice(0, 10);
const NODE = process.execPath;
const PREFIX_UP = PREFIX.replace(/-/g, '_').toUpperCase();

/* ---------- 文本替换规则（顺序敏感：长词在前） ---------- */
const RULES = [
  [/广发中后台系统/g, NAME],
  [/广发中后台/g, NAME],
  [/广发/g, NAME],
  [/GF_SKIP_TOKEN_CHECK/g, PREFIX_UP + '_SKIP_TOKEN_CHECK'],
  [/gf-/g, PREFIX + '-'],
  [/design-specs/g, PKG]
];

function apply(content) {
  return RULES.reduce((acc, [re, to]) => acc.replace(re, to), content);
}

const BINARY_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.zip'];

function copyDir(src, dst, stats) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) { copyDir(s, d, stats); continue; }
    const ext = path.extname(entry.name).toLowerCase();
    if (BINARY_EXT.includes(ext)) { fs.copyFileSync(s, d); stats.files++; continue; }
    const before = fs.readFileSync(s, 'utf8');
    const after = apply(before);
    fs.writeFileSync(d, after, 'utf8');
    stats.files++;
    if (before !== after) stats.replaced++;
  }
}

/* ---------- 骨架填充 ---------- */
function render(tplRel, vars) {
  const p = path.join(FACTORY, 'assets', 'doc-skeletons', tplRel);
  if (!fs.existsSync(p)) throw new Error('骨架模板缺失：' + tplRel);
  let t = fs.readFileSync(p, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    t = t.split('{{' + k + '}}').join(v);
  }
  return t;
}

const BASE = { SYSTEM: NAME, PREFIX, PACKAGE: PKG, DATE, NODE, SPEC_ROOT: OUT, WORKDIR: path.dirname(OUT) };

/* ---------- 执行 ---------- */
console.log('· 建包：' + OUT);
console.log('  系统名：' + NAME + '　类名前缀：' + PREFIX + '-');

fs.mkdirSync(OUT, { recursive: true });
['foundation', 'components', 'pages', 'examples', 'scripts'].forEach((d) =>
  fs.mkdirSync(path.join(OUT, d), { recursive: true })
);

let stats = { files: 0, replaced: 0 };
if (WITH_ENGINE) {
  copyDir(path.join(FACTORY, 'assets', 'engine', 'scripts'), path.join(OUT, 'scripts'), stats);
  console.log('· 引擎复制完成：' + stats.files + ' 个文件，其中 ' + stats.replaced + ' 个做了前缀/系统名替换');
}

/* 规范文档骨架 */
fs.writeFileSync(path.join(OUT, 'foundation', 'tokens.md'), render('foundation/tokens.md.tpl', BASE), 'utf8');
fs.writeFileSync(path.join(OUT, 'foundation', 'design-sync.md'), render('foundation/design-sync.md.tpl', BASE), 'utf8');
fs.writeFileSync(path.join(OUT, 'SKILL.md'), render('PACKAGE-SKILL.md.tpl', BASE), 'utf8');

/* 目录说明：告诉下一个接手的人这里该放什么、按什么标准写 */
fs.writeFileSync(path.join(OUT, 'foundation', 'README.md'),
  '# foundation/\n\n取值唯一来源是 `tokens.md`。其余按实际需要补充（颜色 / 字体 / 间距 / 阴影 / 图标 / 设计稿映射）。\n\n' +
  '规则：\n\n- 任何数值只在 `tokens.md` 登记一次，其它文件一律写「见 `tokens.md` §X」，不抄数值\n' +
  '- `design-sync.md` 是流程文档，已预置，按设计稿分组补充映射表即可\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'components', 'README.md'),
  '# components/\n\n只写实际存在的组件，不写理论组件。\n\n' +
  '每个组件一份 md，骨架见工厂包 `assets/doc-skeletons/COMPONENT.md.tpl`。\n' +
  '取值一律引用 Token，禁止裸数值。\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'pages', 'README.md'),
  '# pages/\n\n按线上产品实际存在的页面类型建文档，骨架见工厂包 `assets/doc-skeletons/PAGE.md.tpl`。\n\n' +
  '页面类型清单不要预先写死——由 `mine-tokens.js` 的结构特征汇总推断，再人工确认。\n', 'utf8');

fs.writeFileSync(path.join(OUT, 'examples', 'README.md'),
  '# examples/\n\n标杆页 = 「这类页面长什么样」的唯一参考答案。\n\n' +
  '生成方式：用 `scripts/new-page.js` 生成骨架，再填入真实业务文案与数据。\n' +
  '改规范或模板后，标杆页就是回归验证的基线。\n', 'utf8');

/* ---------- 收尾提示 ---------- */
console.log('');
console.log('✓ 包已建好：' + OUT);
console.log('');
console.log('接下来（脚本做不了，必须人做）：');
console.log('  1. 采集：让能打开线上页面的人跑 scripts/collect-from-browser.js，拿到 *-styles.json');
console.log('  2. 挖掘：' + NODE + ' ' + path.join(FACTORY, 'scripts', 'mine-tokens.js') + ' \\');
console.log('             --online=<采集JSON> --figma=<设计稿导出> --emit-tokens=tokens.draft.md');
console.log('  3. 定稿：把候选值确认后填进 ' + PKG + '/foundation/tokens.md，再回灌各模板 :root');
console.log('  4. 补模板：引擎只带通用骨架（布局仅 mixed 一套）。你这套系统大概率还有');
console.log('     自己特有的布局 / 页面类型——多数中后台至少还需要一套侧边导航布局。');
console.log('     缺哪个让生成器报给你，它不干报错，会打印完整创建引导：');
console.log('       ' + NODE + ' ' + PKG + '/scripts/new-page.js --type=list --name=测试 --layout=side');
console.log('     （引导含：派生自谁 / 结构锚点 / 类名前缀 / 落位 / 自检命令）');
console.log('  5. 补文档：按实际页面类型生成 components/ pages/ 文档与 examples/ 标杆页');
console.log('  6. 校验：' + NODE + ' ' + PKG + '/scripts/check-tokens.js ' + path.dirname(OUT) + ' --strict');
console.log('     退出码必须是 0 才能交付');
process.exit(0);
