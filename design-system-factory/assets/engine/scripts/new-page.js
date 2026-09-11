#!/usr/bin/env node
/**
 * 广发中后台页面脚手架生成器  v1.2
 * ------------------------------------------------------------
 * 把「规范 + 模板」封装成一条命令：选好页面类型，自动拼装
 * 布局骨架 + 内容区模板 + 多标签导航 + 浮层（弹窗/抽屉），
 * 写入文件并跑 Token 校验，实现「页面 + 浮层」完整覆盖。
 *
 * 用法：
 *   node design-specs/scripts/new-page.js --type=<类型> --name=<名称> [选项]
 *
 * 必填：
 *   --type     list | form | detail | dashboard | login | modal | drawer
 *              modal / drawer 直接产出可独立打开的浮层演示页
 *   --name     标题，用于 <title> 与 PageHeader / 首个浮层标题
 *
 * 选项：
 *   --layout   mixed（默认，通栏顶栏 + 浅色侧边栏）
 *              side （浅色侧边栏；模板未沉淀时打印创建引导，不报错了事）
 *              none （只要内容区）
 *   --tabs     附带多标签导航（mixed 布局已内置卡片式多标签，本参数忽略）
 *   --overlay  在页面里附带浮层骨架，逗号分隔，每档可带尺寸：
 *                modal           弹窗 confirm(480) 档
 *                modal:form      弹窗 form(640) 档
 *                modal:complex   弹窗 complex(800) 档
 *                drawer          抽屉 detail(480) 档
 *                drawer:form     抽屉 form(560) 档
 *                both            modal + drawer（各取默认档）
 *   --no-trigger  不注入「演示入口」触发条（默认注入，接业务后整块删除）
 *   --out      输出路径，默认 ./<name>.html
 *   --system   系统名称，默认「广发中后台系统」
 *   --no-check 生成后不自动跑 Token 校验
 *
 * 示例：
 *   node new-page.js --type=list   --name=交易申报记录 --tabs --overlay=modal:form,drawer
 *   node new-page.js --type=modal  --name=新增客户 --out=design-specs/examples/modal.html
 *   node new-page.js --type=drawer --name=客户详情
 *   node new-page.js --type=form   --name=新增交易申报 --layout=mixed
 *
 * 浮层接入提示：生成后用 data-modal-open="<maskId>" / data-drawer-open="<maskId>"
 * 挂到任意按钮即可打开，关闭已内置（关闭图标 / 取消按钮 / 点遮罩 / Esc）。
 *
 * 【实现要点｜改动前必读】
 * 注入到宿主页面的浮层 CSS 一律加作用域前缀（.gf-modal-mask / .gf-drawer-mask）。
 * 原因：浮层模板与布局模板的按钮语义相反——布局里裸 .gf-btn 是主按钮（蓝底），
 * 浮层模板里裸 .gf-btn 是次按钮（白底描边）。若不做作用域隔离，后注入的浮层样式
 * 会覆盖宿主页面，导致全站主按钮集体变白。作用域隔离后两套语义各自生效、互不干扰。
 *
 * 退出码：0 成功；1 参数错误、生成失败或 Token 校验未通过
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* ---------- 参数解析 ---------- */
const argv = process.argv.slice(2);
const opts = {};
for (const a of argv) {
  if (!a.startsWith('--')) continue;
  const [k, v] = a.replace(/^--/, '').split('=');
  opts[k] = v === undefined ? true : v;
}

const TYPE = opts.type;
const NAME = opts.name;
const LAYOUT = opts.layout || 'mixed';
const OUT = opts.out || path.join(process.cwd(), `${NAME || 'new-page'}.html`);
const SYSTEM = opts.system || '广发中后台系统';
const WITH_TABS = !!opts.tabs;
const DO_CHECK = opts.check !== 'false' && !opts['no-check'];

const SCRIPTS_DIR = __dirname;

const CONTENT_TPL = {
  list: 'table/fixed-action-table.html',
  form: 'form/basic-form.html',
  detail: 'description-list/basic-descriptions.html',
  dashboard: 'charts/basic-statistic-card.html',
  login: 'pages/login-page.html',
  modal: 'modal/basic-modal.html',
  drawer: 'drawer/basic-drawer.html'
};
const LAYOUT_TPL = {
  mixed: 'layout/mixed-layout.html',
  /* side 本包尚未沉淀：指定时不会干报错，而是打印创建引导（见 guideCreateTemplate） */
  side: 'layout/side-layout.html'
};

/* 浮层：模板路径 + 遮罩 class + 需要一并带走的样式选择器 */
const OVERLAY_TPL = {
  modal: {
    file: 'modal/basic-modal.html',
    mask: 'gf-modal-mask',
    needles: ['.gf-modal', '.gf-btn', '.gf-form-field', '.gf-table', '.gf-link'],
    openAttr: 'data-modal-open'
  },
  drawer: {
    file: 'drawer/basic-drawer.html',
    mask: 'gf-drawer-mask',
    needles: ['.gf-drawer', '.gf-btn', '.gf-form-field', '.gf-desc', '.gf-tag'],
    openAttr: 'data-drawer-open'
  }
};
const OVERLAY_ALIAS = { both: ['modal', 'drawer'] };

/* 浮层档位：容器 class 决定宽度，禁止自由数值 */
const OVERLAY_SIZE = {
  modal: {
    default: 'confirm',
    label: { confirm: '确认 480', form: '表单 640', complex: '复杂 800' },
    cls: { confirm: 'gf-modal--confirm', form: 'gf-modal--form', complex: 'gf-modal--complex' }
  },
  drawer: {
    default: 'detail',
    label: { detail: '详情 480', form: '表单 560' },
    cls: { detail: 'gf-drawer--detail', form: 'gf-drawer--form' }
  }
};

/* 解析 --overlay：modal[:档位] | drawer[:档位] | both，逗号分隔组合 */
const rawOverlay = typeof opts.overlay === 'string' ? opts.overlay : (opts.overlay === true ? 'both' : '');
let OVERLAYS = [];
if (rawOverlay) {
  const tokens = rawOverlay.split(',').map((s) => s.trim()).filter(Boolean)
    .reduce((acc, k) => acc.concat(OVERLAY_ALIAS[k] || [k]), []);
  const bad = [];
  const seen = new Set();
  tokens.forEach((tk) => {
    const [kind, size] = tk.split(':').map((s) => s.trim().toLowerCase());
    if (!OVERLAY_TPL[kind]) { bad.push(tk); return; }
    const spec = OVERLAY_SIZE[kind];
    const finalSize = size || spec.default;
    if (!spec.cls[finalSize]) { bad.push(tk); return; }
    const key = kind + ':' + finalSize;
    if (!seen.has(key)) { seen.add(key); OVERLAYS.push({ kind, size: finalSize }); }
  });
  if (bad.length) {
    console.error('✗ 错误的 --overlay：' + bad.join(', '));
    console.error('  可选：modal | modal:form | modal:complex | drawer | drawer:form | both');
    process.exit(1);
  }
}

if (!TYPE || !CONTENT_TPL[TYPE]) {
  console.error('✗ 缺少或错误的 --type。可选：' + Object.keys(CONTENT_TPL).join(' / '));
  process.exit(1);
}
if (!NAME) {
  console.error('✗ 缺少 --name（页面标题）');
  process.exit(1);
}
if (LAYOUT !== 'none' && !LAYOUT_TPL[LAYOUT]) {
  console.error('✗ 错误的 --layout=' + LAYOUT + '。可选：' + Object.keys(LAYOUT_TPL).join(' / ') + ' / none');
  process.exit(1);
}
const IS_OVERLAY_TYPE = TYPE === 'modal' || TYPE === 'drawer';

/**
 * 模板缺失时的「创建引导」。
 * 中后台普遍该有自己的布局/内容模板，但本包未必都沉淀了——
 * 这时不能只报一句「缺失」，要给出一条能走完的路（派生自谁、结构锚点、落位、自检）。
 */
function guideCreateTemplate(missing) {
  console.error('\n—— 以下模板本包尚未沉淀。多数系统都需要它们，按下面补即可 ——');
  missing.forEach((f) => {
    const isLayout = f.startsWith('layout/');
    console.error('\n▸ ' + f);
    console.error('  派生自　：' + (isLayout
      ? 'scripts/layout/mixed-layout.html（同一套骨架，按需去掉通栏顶栏）'
      : '同目录下最接近的模板，照它的结构写'));
    console.error('  结构锚点：' + (isLayout
      ? '保留 <main class="gf-content">；有面包屑时它必须是 .gf-content 的首子元素'
      : '只写内容区，样式随模板走，不引入新的布局容器'));
    console.error('  类名前缀：沿用 gf-，不要另起一套');
    console.error('  落位　　：design-specs/scripts/' + f);
  });
  console.error('\n自检：node design-specs/scripts/check-tokens.js design-specs --strict');
  console.error('      （[E4] 会校验上面那些结构锚点，退出码必须 0）');
  console.error('\n不确定长什么样：先用 --layout=mixed 生成一版，手工改成需要的样子，');
  console.error('再放回上面的路径——new-page.js 下次会自动认。\n');
}

/* 模板存在性预检：缺模板要在参数阶段报错，不能等到生成到一半抛栈 */
const NEED_TPL = [CONTENT_TPL[TYPE]];
if (!IS_OVERLAY_TYPE && TYPE !== 'login' && LAYOUT !== 'none') {
  if (LAYOUT_TPL[LAYOUT]) NEED_TPL.push(LAYOUT_TPL[LAYOUT]);
}
if (!IS_OVERLAY_TYPE) OVERLAYS.forEach((o) => NEED_TPL.push(OVERLAY_TPL[o.kind].file));
const MISSING = [...new Set(NEED_TPL)].filter((f) => !fs.existsSync(path.join(SCRIPTS_DIR, f)));
if (MISSING.length) {
  console.error('✗ 以下模板缺失，无法生成：');
  MISSING.forEach((f) => console.error('    design-specs/scripts/' + f));
  guideCreateTemplate(MISSING);
  process.exit(1);
}

if (IS_OVERLAY_TYPE) {
  if (OVERLAYS.length) console.log('· --type=' + TYPE + ' 已是浮层页，--overlay 忽略（想让页面带浮层请用 --type=list|form|… --overlay=' + TYPE + '）');
  if (opts.layout) console.log('· 浮层页是独立全屏演示页，--layout 忽略');
  if (WITH_TABS) console.log('· 浮层页无多标签导航，--tabs 忽略');
}

/* ---------- HTML 拆解工具 ---------- */
function read(rel) {
  const p = path.join(SCRIPTS_DIR, rel);
  if (!fs.existsSync(p)) throw new Error('模板不存在：' + rel);
  return fs.readFileSync(p, 'utf8');
}

/** 拆出一份模板的 style / body 内层 / 脚本 */
function parts(html) {
  const styleM = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const style = styleM ? styleM[1] : '';
  const rootM = style.match(/:root\s*\{([\s\S]*?)\}/);
  const rootCss = rootM ? rootM[0] : '';
  const bodyM = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let bodyInner = bodyM ? bodyM[1] : '';
  bodyInner = bodyInner.replace(/<script[\s\S]*?<\/script>/gi, '').trim();
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return { html, style, rootCss, bodyCss: style.replace(rootCss, ''), bodyInner, scripts };
}

/** 顶层 CSS 规则切分（忽略 @media 内部，模板中无嵌套规则） */
function splitRules(css) {
  const rules = [];
  let buf = '';
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    buf += ch;
    if (depth === 0 && ch === '}') { rules.push(buf.trim()); buf = ''; }
  }
  return rules;
}

const SKIP_SELECTOR = /^(\*|html|body|html\s*,\s*body|html,body)$/i;

/** 剥离 CSS 注释 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 取规则的选择器：先剥注释，再取 { 之前。
 * ⚠ 模板 CSS 习惯在规则前写块注释，直接 split('{')[0] 会得到
 *   "/* ===== 按钮 ===== *\/ \n .gf-btn"，注释成了选择器的一部分，
 *   精确去重（hostHasSelector）就永远匹配不上，样式被反复注入。
 */
function selectorOf(rule) {
  return stripComments(rule.split('{')[0]).trim();
}

/** 取内容模板的样式，剔除会与布局层打架的全局选择器 */
function portableCss(css) {
  return splitRules(css)
    .filter((r) => {
      const sel = selectorOf(r);
      return sel && !SKIP_SELECTOR.test(sel);
    })
    .join('\n    ');
}

/** 选中包含指定子串的规则（用于抽取多标签栏样式） */
function rulesContaining(css, needles) {
  return splitRules(css)
    .filter((r) => needles.some((n) => selectorOf(r).includes(n)))
    .join('\n    ');
}

/** 按 <div>…</div> 深度配对，从 startIdx 起切出一个完整块 */
function extractDivBlock(html, startIdx) {
  const re = /<div\b[^>]*>|<\/div>/gi;
  re.lastIndex = startIdx;
  let depth = 0, m, end = -1;
  while ((m = re.exec(html)) !== null) {
    if (m[0].toLowerCase() === '</div>') {
      depth--;
      if (depth === 0) { end = m.index + m[0].length; break; }
    } else { depth++; }
  }
  return end < 0 ? null : html.slice(startIdx, end);
}

/** 取模板中的浮层块（遮罩 + 浮层容器）；可指定档位 class，未命中则回落第一个 */
function overlayBlock(html, maskClass, sizeClass) {
  const re = new RegExp('<div\\b[^>]*class="[^"]*' + maskClass + '[^"]*"[^>]*>', 'gi');
  const hits = [...html.matchAll(re)];
  if (!hits.length) return null;
  const blocks = hits.map((m) => extractDivBlock(html, m.index)).filter(Boolean);
  if (!sizeClass) return blocks[0];
  return blocks.find((b) => b.includes(sizeClass)) || blocks[0];
}

/**
 * 给选择器加作用域前缀（根容器自身及其变体不加）。
 * 浮层模板与布局模板的按钮语义相反，浮层样式必须锁在遮罩内，
 * 否则后注入的规则会覆盖宿主页面的组件样式。
 */
function scopeSelector(sel, scope) {
  if (!sel) return sel;
  if (sel === scope || sel.startsWith(scope + '[') || sel.startsWith(scope + '.') || sel.startsWith(scope + ' ')) return sel;
  return scope + ' ' + sel;
}

/**
 * 整段 CSS 加作用域。@media / @supports 递归处理内部，
 * @keyframes / @font-face 等原样保留（动画名必须保持全局）。
 */
function scopeCss(css, scope) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i);
    if (brace < 0) { out += css.slice(i).replace(/\s+$/, '\n'); break; }
    const head = stripComments(css.slice(i, brace)).trim();
    let depth = 0, j = brace;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const body = css.slice(brace + 1, j - 1);
    if (/^@(media|supports)\b/i.test(head)) {
      out += head + ' {\n' + scopeCss(body, scope) + '}\n';
    } else if (head.startsWith('@')) {
      out += head + ' {' + body + '}\n';
    } else if (head) {
      const sel = head.split(',').map((s) => scopeSelector(s.trim(), scope)).join(', ');
      out += sel + ' {\n' + body.replace(/^\s+|\s+$/g, '') + '\n}\n';
    }
    i = j;
  }
  return out;
}

/** 宿主 CSS 是否已定义该选择器（精确匹配，避免 .gf-btn 命中 .gf-btn__icon） */
function hostHasSelector(hostCss, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[,{])\\s*' + esc + '\\s*([,{])', 'm').test(hostCss);
}

/** 只保留宿主没有的规则，避免注入后反过来覆盖宿主页面已有样式 */
function onlyMissingRules(css, hostCss) {
  return splitRules(css)
    .filter((r) => {
      const sel = selectorOf(r);
      if (!sel || SKIP_SELECTOR.test(sel)) return false;
      return !sel.split(',').map((s) => s.trim()).filter(Boolean)
        .some((s) => hostHasSelector(hostCss, s));
    })
    .join('\n    ');
}

/** 合并 :root 变量：只补布局层没有的 */
function mergeRootVars(layoutStyle, contentRootCss) {
  if (!contentRootCss) return layoutStyle;
  const defined = new Set(
    [...(layoutStyle.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '').matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])
  );
  const add = [...contentRootCss.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)]
    .filter((m) => !defined.has(m[1]))
    .map((m) => `      ${m[1]}: ${m[2].trim()};`);
  if (!add.length) return layoutStyle;
  const inject = '\n      /* ---- 由内容区模板合并 ---- */\n' + add.join('\n');
  return layoutStyle.replace(/(:root\s*\{[\s\S]*?)(\n\s*\})/, `$1${inject}$2`);
}

/* ---------- 生成 ---------- */
const content = parts(read(CONTENT_TPL[TYPE]));

let output;
let used = [CONTENT_TPL[TYPE]];

if (TYPE === 'login' || IS_OVERLAY_TYPE || LAYOUT === 'none') {
  /* 登录页 / 浮层页是独立全屏页；--layout=none 表示只产出内容区 */
  output = content.html;
} else {
  const layoutRaw = read(LAYOUT_TPL[LAYOUT]);
  const layout = parts(layoutRaw);
  used.unshift(LAYOUT_TPL[LAYOUT]);

  output = layoutRaw;

  /* 1) 合并 :root 变量 */
  const mergedStyle = mergeRootVars(layout.style, content.rootCss);
  output = output.replace(layout.style, mergedStyle);

  /* 2) 合并内容区样式（插到 </style> 前） */
  const cssToInject = portableCss(content.bodyCss);
  output = output.replace(/(\s*)<\/style>/i,
    `\n\n    /* ============ 内容区样式（来自 ${CONTENT_TPL[TYPE]}） ============ */\n    ${cssToInject}\n  </style>`);

  /* 3) 多标签导航：mixed 布局已内置卡片式多标签（.gf-tabsbar），无需注入 */
  if (WITH_TABS && LAYOUT === 'mixed') {
    console.log('· mixed 布局已内置卡片式多标签导航，--tabs 忽略');
  }

  /* 4) 内容区塞进 <main class="gf-content">
   *    保留布局模板自带的 .gf-breadcrumb 与 .gf-page-header 作为 main 的首子元素；
   *    业务内容模板（table/form/detail/dashboard）的 bodyInner 追加在其后。 */
  const mainRe = /(<main\b[^>]*class="[^"]*gf-content[^"]*"[^>]*>)([\s\S]*?)(<\/main>)/i;
  const mainMatch = output.match(mainRe);
  if (!mainMatch) throw new Error('布局模板缺少 <main class="gf-content">');
  const mainOpen = mainMatch[1];
  const mainInner = mainMatch[2];
  const mainClose = mainMatch[3];
  // 从布局模板里抽出 .gf-breadcrumb 与 .gf-page-header（业务内容模板可能也自带 PageHeader，见 4.1）
  const bcMatch = mainInner.match(/[ \t]*<nav\b[^>]*class="[^"]*gf-breadcrumb[^"]*"[\s\S]*?<\/nav>\s*/i);
  const breadcrumb = bcMatch ? bcMatch[0] : '';
  const hasLayoutHeader = /class="[^"]*gf-page-header[^"]*"/.test(mainInner);
  output = output.replace(mainRe, `${mainOpen}\n        ${breadcrumb}${content.bodyInner.replace(/\n/g, '\n        ')}\n      ${mainClose}`);

  /* 4.1) 兜底 PageHeader：指标卡等内容模板自带标题区，缺则补一个
   *      强约束 #6：标题只能由页面层 PageHeader 渲染一次，布局层不得重复
   *      注意：v2.10.3 起面包屑已并入 main 内部，本兜底插在 breadcrumb 之后、bodyInner 之前 */
  if (!hasLayoutHeader && !/class="gf-page-header"/.test(output)) {
    output = output.replace(mainRe,
      '$1\n        ' + breadcrumb +
      '\n        <div class="gf-page-header">\n' +
      `          <h1 class="gf-page-header__title">${NAME}</h1>\n` +
      '        </div>' +
      '\n        ' + content.bodyInner.replace(/\n/g, '\n        ') +
      '\n      $3');
    if (!/\.gf-page-header__title/.test(output)) {
      const headerCss = rulesContaining(layout.style, ['.gf-page-header']);
      if (headerCss) {
        output = output.replace(/(\s*)<\/style>/i, `\n\n    /* ============ 页头样式（兜底注入） ============ */\n    ${headerCss}\n  </style>`);
      }
    }
  }

  /* 5) 内容区脚本（独立 IIFE，避免与布局脚本互相污染） */
  if (content.scripts.length) {
    const js = content.scripts.join('\n\n');
    output = output.replace(/(\s*)<\/body>/i, `\n  <script>\n${js}\n  </script>\n</body>`);
  }
}

/* ---------- 浮层骨架（--overlay）---------- */
/* 挂到页面 body 末尾：CSS 去重注入 + HTML 结构 + 通用开关脚本 */
const overlayInfo = [];
if (OVERLAYS.length && !IS_OVERLAY_TYPE) {
  OVERLAYS.forEach(({ kind, size }) => {
    const cfg = OVERLAY_TPL[kind];
    const spec = OVERLAY_SIZE[kind];
    const tpl = parts(read(cfg.file));
    used.push(cfg.file);
    const label = kind === 'modal' ? '弹窗' : '抽屉';
    const sizeCls = spec.cls[size];

    /* 1) 样式：先按档位取规则，再整段锁进遮罩作用域，最后剔除宿主已有的。
     *    作用域是硬要求——浮层与布局的按钮语义相反，不隔离会污染宿主页面 */
    const picked = rulesContaining(tpl.bodyCss, cfg.needles);
    /* cfg.mask 是 class 名（用于匹配 HTML），做 CSS 选择器要补上点号 */
    const scoped = scopeCss(picked, '.' + cfg.mask);
    /* 演示页触发区样式对宿主无意义，剔除 */
    const css = onlyMissingRules(scoped, output)
      .split('\n')
      .filter((l) => !/\.demo-launch/.test(l))
      .join('\n');
    if (css.trim()) {
      output = output.replace(/(\s*)<\/style>/i,
        `\n\n    /* ============ ${label}骨架（${spec.label[size]}，来自 ${cfg.file}） ============ */\n` +
        `    /* 已加 .${cfg.mask} 作用域：只作用于浮层内部，不污染本页面组件 */\n    ${css}\n  </style>`);
    }

    /* 2) :root 变量补齐 */
    output = mergeRootVars(output, tpl.rootCss);

    /* 3) 结构：按档位取浮层块，挂到 body 末尾 */
    let block = overlayBlock(tpl.html, cfg.mask, sizeCls);
    if (!block) throw new Error('浮层模板未找到遮罩块：' + cfg.file);
    if (sizeCls && !block.includes(sizeCls)) {
      console.log(`· 未找到 ${label}档位 ${size}（${sizeCls}），已回落为模板首档`);
    }
    /* 首个浮层标题继承 --name，其余保持样例文案 */
    block = replaceTag(block, kind === 'modal' ? 'gf-modal__title' : 'gf-drawer__title', NAME);

    const idM = block.match(/\bid="([^"]+)"/);
    output = output.replace(/(\s*)<\/body>/i,
      `\n\n  <!-- ============ ${label}骨架（${spec.label[size]}）：业务替换点 ============ -->\n  ${block}\n</body>`);

    /* 4) 开关脚本：模板里是通用实现（关闭图标/取消/点遮罩/Esc），直接复用 */
    if (tpl.scripts.length) {
      output = output.replace(/(\s*)<\/body>/i, `\n  <script>\n${tpl.scripts.join('\n\n')}\n  </script>\n</body>`);
    }

    overlayInfo.push({ kind, label, size, sizeText: spec.label[size], id: idM ? idM[1] : '(未命名)', attr: cfg.openAttr });
  });
}

/* ---------- 演示入口触发条 ---------- */
/* 浮层默认 hidden，没有触发器就等于交付了一个看不见的骨架。
 * 这里注入一条入口条，接入业务后整块删除（--no-trigger 可关闭）。 */
if (overlayInfo.length && opts.trigger !== 'false' && !opts['no-trigger']) {
  const btns = overlayInfo.map((o) => `      <button class="gf-btn" ${o.attr}="${o.id}">打开${o.label}（${o.sizeText}）</button>`).join('\n');
  const bar =
    '\n\n      <!-- ============ 演示入口：接入业务后删除本块 ============ -->\n' +
    '      <div class="gf-overlay-demo">\n' +
    '        <span class="gf-overlay-demo__label">演示入口</span>\n' + btns + '\n' +
    '      </div>';
  const mainRe = /(<main\b[^>]*class="[^"]*gf-content[^"]*"[^>]*>)([\s\S]*?)(<\/main>)/i;
  if (mainRe.test(output)) {
    output = output.replace(mainRe, `$1${bar}\n      $2      $3`);
  } else {
    output = output.replace(/(<body[^>]*>)/i, `$1${bar}`);
  }
  const demoCss =
    '\n\n    /* ============ 演示入口条（接入业务后随 HTML 块一并删除） ============ */\n' +
    '    .gf-overlay-demo {\n' +
    '      display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;\n' +
    '      margin-bottom: var(--space-4); padding: var(--space-2) var(--space-3);\n' +
    '      background: var(--color-bg-card); border: 1px dashed var(--color-border-strong);\n' +
    '      border-radius: var(--radius-card);\n' +
    '    }\n' +
    '    .gf-overlay-demo__label { font-size: var(--font-size-body-sm); color: var(--color-text-tertiary); }';
  output = output.replace(/(\s*)<\/style>/i, `${demoCss}\n  </style>`);
}

/* ---------- 文案替换 ---------- */
function replaceTag(html, cls, text) {
  const re = new RegExp(`(class="${cls}"[^>]*>)([^<]*)(<)`, 'i');
  return re.test(html) ? html.replace(re, `$1${text}$3`) : html;
}
output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${NAME} - ${SYSTEM}</title>`);
output = replaceTag(output, 'gf-topbar__system', SYSTEM);
output = replaceTag(output, 'gf-page-header__title', NAME);
output = replaceTag(output, 'gf-login__brand-name', SYSTEM);
/* 浮层页：--name 落到首个浮层标题，其余保持样例文案 */
if (IS_OVERLAY_TYPE) {
  output = replaceTag(output, TYPE === 'modal' ? 'gf-modal__title' : 'gf-drawer__title', NAME);
}

/* ---------- 清理设计工具残留 ---------- */
/* 模板源自设计稿导出，带 data-page-node-id（校验器已豁免，但业务页无需保留） */
output = output.replace(/\s+data-page-node-id="[^"]*"/g, '');

/* ---------- 写盘 ---------- */
const outPath = path.resolve(process.cwd(), OUT);
if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
  console.error('✗ --out 指向的是目录，请带上文件名，例如：--out=design-specs/examples/交易申报记录.html');
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output);

const replacePoints = (output.match(/业务替换点/g) || []).length;
console.log('===== 页面生成完成 =====\n');
console.log('输出文件　　：' + path.relative(process.cwd(), outPath));
const layoutLabel = (TYPE === 'login' || IS_OVERLAY_TYPE) ? '独立全屏页' : LAYOUT + (WITH_TABS ? '　多标签：是' : '');
console.log('页面类型　　：' + TYPE + '　布局：' + layoutLabel);
console.log('拼装模板　　：' + used.join(' + '));
if (overlayInfo.length) {
  console.log('附带浮层　　：' + overlayInfo.map((o) => `${o.label} #${o.id}（${o.sizeText}）`).join('、'));
  overlayInfo.forEach((o) => {
    console.log(`  · 打开方式：任意按钮加 ${o.attr}="${o.id}"`);
  });
  if (opts.trigger !== 'false' && !opts['no-trigger']) {
    console.log('  · 已注入「演示入口」条，接入业务后搜索「演示入口」整块删除（--no-trigger 可关闭）');
  }
}
if (IS_OVERLAY_TYPE) {
  const own = (output.match(/data-(?:modal|drawer)-open="([^"]+)"/g) || [])
    .map((s) => s.match(/"([^"]+)"/)[1]);
  console.log('浮层遮罩 ID ：' + ([...new Set(own)].join('、') || '(未找到)'));
}
console.log('文件规模　　：' + output.split('\n').length + ' 行');
console.log('业务替换点　：' + replacePoints + ' 处（全局搜索「业务替换点」逐项替换）');

/* ---------- 自动校验 ---------- */
if (DO_CHECK) {
  /* 校验范围 = 规范包 design-specs，而不是工作区根：
   * 工作区根下若并存其他包（如 design-system-factory 的引擎副本），
   * 其旧框架 Token 会被当成「本包未收编」误报 [W1]。 */
  const specRoot = path.resolve(SCRIPTS_DIR, '..');
  const targets = [{ label: '规范包', path: specRoot }];
  /* 产物落在包外时（--out=/tmp/x.html）目录扫描覆盖不到，单独校验一次 */
  if (!outPath.startsWith(specRoot + path.sep)) targets.push({ label: '输出文件', path: outPath });

  let failed = false;
  console.log('\n---- Token 校验 ----');
  for (const t of targets) {
    const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'check-tokens.js'), t.path, '--strict', '--quiet'], { encoding: 'utf8' });
    const tail = (res.stdout || '').split('\n').filter((l) => /硬编码|取值漂移|未定义引用|规范未收编|全部通过/.test(l));
    console.log('· ' + t.label + '：' + (tail.join(' ｜ ') || (res.stderr || '').trim() || '(无输出)'));
    if (res.status !== 0) failed = true;
  }
  if (failed) {
    console.log('\n⚠ 校验未通过，请按上方提示修正后再交付。');
    process.exit(1);
  }
}
console.log('\n下一步：替换业务字段与数据 → 跑一遍自测验收清单（scripts/README.md §4）');
