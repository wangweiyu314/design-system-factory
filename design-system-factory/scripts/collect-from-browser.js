/**
 * 线上页面样式采集器（浏览器端） v1.0
 * ------------------------------------------------------------
 * 用途：设计系统建包时，「线上产品实际长什么样」是最可靠的取值来源之一。
 * 但中后台系统大多在内网、需要登录，Agent 打不开。
 * 解法：让能打开页面的人在控制台跑一次本脚本，把真实 computed style 导出成 JSON。
 *
 * ── 使用方法（三种任选）────────────────────────────────
 * 1) 控制台粘贴：打开目标页面 → F12 → Console → 粘贴本文件全部内容 → 回车
 *    → 弹出下载 <hostname>-styles.json，把文件交给 Agent
 * 2) 存成书签（更快）：新建书签，网址填
 *      javascript:(function(){...})()
 *    把本文件内容压缩成一行填进去，之后点一下书签即可
 * 3) 控制台拿到对象后自己处理：window.__DSF_COLLECT__(...)
 *
 * ── 采集什么 ────────────────────────────────────────
 *   colors      颜色（背景/文字/边框），带出现次数与用途分布
 *   fontSizes   字号    fontWeights 字重    lineHeights 行高
 *   fontFamilies 字体族
 *   spacings    间距（padding / margin / gap），用于拟合网格基数
 *   radii       圆角    shadows 阴影        borders 描边
 *   metrics     关键区块尺寸（顶栏高、侧边栏宽、表格行高、按钮高、控件高）
 *   structure   页面结构特征（有无侧边栏/顶栏/表格/表单/分页/浮层/图表）
 *
 * ── 注意事项 ────────────────────────────────────────
 *   - 只读 DOM，不发请求、不改页面、不碰登录态，可放心在生产页跑
 *   - 页面越大越慢；默认最多扫 8000 个元素，超了会提示
 *   - 采集的是「渲染后 computed style」，会包含浏览器默认值，
 *     所以每个取值都带 count 与 props，让下游按频次筛选
 *
 * 输出：下载 JSON 文件；同时挂到 window.__DSF_RESULT__ 便于二次处理
 */

window.__DSF_COLLECT__ = function collectFromBrowser(opts) {
  'use strict';
  var O = opts || {};
  var MAX_NODES = O.maxNodes || 8000;
  var TOP_N = O.topN || 60;

  var doc = document;
  var win = window;

  /* ---------- 工具 ---------- */
  function toHex(c) {
    if (!c) return null;
    var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(c.trim());
    if (!m) return null;
    var r = Math.round(+m[1]), g = Math.round(+m[2]), b = Math.round(+m[3]);
    var a = m[4] === undefined ? 1 : +m[4];
    var hex = '#' + [r, g, b].map(function (n) {
      return ('0' + n.toString(16)).slice(-2);
    }).join('').toUpperCase();
    if (a >= 0.999) return hex;
    /* 半透明保留 rgba 原样，避免丢信息 */
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  function isTransparent(c) {
    return !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
  }

  function bump(map, key, prop, sample) {
    if (!key) return;
    var e = map.get(key);
    if (!e) { e = { value: key, count: 0, props: {}, sample: sample || '' }; map.set(key, e); }
    e.count++;
    if (prop) e.props[prop] = (e.props[prop] || 0) + 1;
  }

  function finalize(map) {
    return Array.from(map.values())
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, TOP_N)
      .map(function (e) {
        var props = Object.keys(e.props).sort(function (a, b) { return e.props[b] - e.props[a]; });
        return { value: e.value, count: e.count, props: props, sample: e.sample.slice(0, 160) };
      });
  }

  function sel(el) {
    if (!el || !el.tagName) return '';
    var s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    var cls = (el.getAttribute && el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) return s + '.' + cls.join('.');
    return s;
  }

  /* ---------- 采集 ---------- */
  var all = doc.querySelectorAll('*');
  var total = all.length;
  var truncated = total > MAX_NODES;
  var n = Math.min(total, MAX_NODES);

  var colors = new Map();
  var fontSizes = new Map();
  var fontWeights = new Map();
  var lineHeights = new Map();
  var fontFamilies = new Map();
  var spacings = new Map();
  var radii = new Map();
  var shadows = new Map();
  var borders = new Map();
  var zIndexes = new Map();

  var metrics = {};
  var structure = {
    sidebar: 0, header: 0, footer: 0, tables: 0, forms: 0,
    buttons: 0, inputs: 0, paginations: 0, modals: 0, drawers: 0,
    tabs: 0, charts: 0, cards: 0, tags: 0
  };

  var SPACING_PROPS = [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'column-gap', 'row-gap'
  ];

  function looksLike(el, re) {
    var c = (el.getAttribute && el.getAttribute('class') || '') + ' ' + (el.id || '');
    return re.test(c) || re.test(el.tagName || '');
  }

  for (var i = 0; i < n; i++) {
    var el = all[i];
    if (!el || el.nodeType !== 1) continue;
    var cs;
    try { cs = win.getComputedStyle(el); } catch (err) { continue; }
    if (!cs) continue;

    var s = sel(el);

    /* 颜色：背景 / 文字 / 边框，分别记 prop 便于判断用途 */
    var bg = cs.backgroundColor;
    if (!isTransparent(bg)) bump(colors, toHex(bg) || bg, 'background-color', s);
    var fg = cs.color;
    if (!isTransparent(fg)) bump(colors, toHex(fg) || fg, 'color', s);
    var bc = cs.borderTopColor;
    if (!isTransparent(bc) && cs.borderTopWidth !== '0px') {
      bump(colors, toHex(bc) || bc, 'border-color', s);
      bump(borders, cs.borderTopWidth, 'border-width', s);
    }

    /* 字体 */
    if (cs.fontSize) bump(fontSizes, cs.fontSize, 'font-size', s);
    if (cs.fontWeight) bump(fontWeights, cs.fontWeight, 'font-weight', s);
    if (cs.lineHeight && cs.lineHeight !== 'normal') bump(lineHeights, cs.lineHeight, 'line-height', s);
    if (cs.fontFamily) bump(fontFamilies, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(), 'font-family', s);

    /* 间距：只收非零，否则全是 0 */
    for (var p = 0; p < SPACING_PROPS.length; p++) {
      var v = cs[SPACING_PROPS[p].replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); })];
      if (v && v !== '0px' && v !== 'normal' && /px$/.test(v)) bump(spacings, v, SPACING_PROPS[p], s);
    }
    if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') bump(spacings, cs.gap, 'gap', s);

    /* 圆角 / 阴影 / 层级 */
    if (cs.borderTopLeftRadius && cs.borderTopLeftRadius !== '0px') bump(radii, cs.borderTopLeftRadius, 'border-radius', s);
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, cs.boxShadow, 'box-shadow', s);
    if (cs.zIndex && cs.zIndex !== 'auto') bump(zIndexes, cs.zIndex, 'z-index', s);

    /* 结构特征：靠类名/标签猜，不追求精确，只给下游一个「有没有」的信号 */
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'table' || looksLike(el, /(^|[\s-])table|data-grid|datagrid/i)) structure.tables++;
    if (tag === 'form' || looksLike(el, /(^|[\s-])form|search-bar|query-filter/i)) structure.forms++;
    if (tag === 'button' || looksLike(el, /(^|[\s-])btn|button/i)) structure.buttons++;
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || looksLike(el, /(^|[\s-])input|select|picker/i)) structure.inputs++;
    if (looksLike(el, /sidebar|sider|aside|nav-menu|menu-left/i)) structure.sidebar++;
    if (tag === 'header' || looksLike(el, /(^|[\s-])header|topbar|top-bar|navbar/i)) structure.header++;
    if (tag === 'footer' || looksLike(el, /(^|[\s-])footer/i)) structure.footer++;
    if (looksLike(el, /pagination|pager/i)) structure.paginations++;
    if (looksLike(el, /modal|dialog|popup/i)) structure.modals++;
    if (looksLike(el, /drawer|slide-panel|side-panel/i)) structure.drawers++;
    if (looksLike(el, /(^|[\s-])tab|tabs/i)) structure.tabs++;
    if (tag === 'svg' || tag === 'canvas' || looksLike(el, /chart|echarts|graph/i)) structure.charts++;
    if (looksLike(el, /(^|[\s-])card|panel/i)) structure.cards++;
    if (looksLike(el, /(^|[\s-])tag|badge|chip|label-status/i)) structure.tags++;

    /* 关键区块尺寸：只测第一个命中的，避免被列表项污染 */
    try {
      var r = el.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (w > 0 && h > 0) {
        if (!metrics.headerHeight && (tag === 'header' || looksLike(el, /(^|[\s-])header|topbar|top-bar/i)) && w > 600) metrics.headerHeight = h;
        if (!metrics.sidebarWidth && looksLike(el, /sidebar|sider|nav-menu/i) && h > 300) metrics.sidebarWidth = w;
        if (!metrics.tableRowHeight && tag === 'tr') metrics.tableRowHeight = h;
        if (!metrics.buttonHeight && (tag === 'button' || looksLike(el, /(^|[\s-])btn/i)) && h > 0 && h < 80) metrics.buttonHeight = h;
        if (!metrics.inputHeight && (tag === 'input' || looksLike(el, /(^|[\s-])input/i)) && h > 0 && h < 80) metrics.inputHeight = h;
      }
    } catch (e2) { /* 忽略布局异常 */ }
  }

  var result = {
    meta: {
      scriptVersion: '1.0',
      url: location.href,
      title: doc.title || '',
      viewport: win.innerWidth + 'x' + win.innerHeight,
      collectedAt: new Date().toISOString(),
      elementsScanned: n,
      elementsTotal: total,
      truncated: truncated
    },
    structure: structure,
    metrics: metrics,
    colors: finalize(colors),
    fontSizes: finalize(fontSizes),
    fontWeights: finalize(fontWeights),
    lineHeights: finalize(lineHeights),
    fontFamilies: finalize(fontFamilies),
    spacings: finalize(spacings),
    radii: finalize(radii),
    shadows: finalize(shadows),
    borderWidths: finalize(borders),
    zIndexes: finalize(zIndexes)
  };

  win.__DSF_RESULT__ = result;

  /* ---------- 输出 ---------- */
  var json = JSON.stringify(result, null, 2);
  var name = (location.hostname || 'page').replace(/[^\w.-]/g, '_') + '-styles.json';
  try {
    var blob = new Blob([json], { type: 'application/json' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    console.log('%c[设计采集] 已导出 ' + name + '（' + n + ' 个元素）', 'color:#2A6CDD;font-weight:bold');
  } catch (e3) {
    console.log('[设计采集] 自动下载失败，请手动复制下面 JSON：');
    console.log(json);
  }
  console.log('[设计采集] 结构特征：', structure);
  console.log('[设计采集] 关键尺寸：', metrics);
  if (truncated) {
    console.warn('[设计采集] 元素超过 ' + MAX_NODES + ' 个，只扫了前 ' + MAX_NODES + ' 个。' +
      '如需全量，在控制台执行 __DSF_COLLECT__({maxNodes: 50000})');
  }
  return result;
};

/* 粘贴到控制台即自动运行一次；需要调整参数时再手动调 __DSF_COLLECT__({maxNodes: 50000}) */
if (typeof window !== 'undefined') window.__DSF_COLLECT__();
