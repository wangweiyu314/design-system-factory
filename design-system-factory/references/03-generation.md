# 03 · 生成：建包与写规范

---

## 1. 建包

```bash
$NODE $FACTORY/scripts/init-package.js \
  --name=<系统名> --prefix=<类名前缀> --out=<目录> [--force] [--no-engine]
```

| 参数 | 说明 |
| :-- | :-- |
| `--name` | 系统中文名，写入文档与生成器默认系统名 |
| `--prefix` | CSS 类名前缀，小写字母开头，如 `acme` / `tx-bank` |
| `--out` | 默认 `./<prefix>-design-specs` |
| `--force` | 目标目录非空时仍继续 |
| `--no-engine` | 只建文档骨架，不复制引擎（已有实现只想补规范时用） |

### 建包器自动做的事

1. 复制引擎：4 个 JS（`check-tokens` / `check-design-sync` / `install-hooks` / `new-page`）+ 11 套 HTML 模板 + 2 份说明
2. **前缀替换**：`gf-` → `<prefix>-`（全库，含 CSS 类名、JS 字符串、注释）
3. **系统名参数化**：`广发中后台系统` → 新系统名；`GF_SKIP_TOKEN_CHECK` → `<PREFIX>_SKIP_TOKEN_CHECK`
4. **路径参数化**：文档里的 `design-specs` → 新包名
5. 生成骨架：`foundation/tokens.md`、`foundation/design-sync.md`、包内 `SKILL.md`、四个目录的 README

### 建包器不做的事

- 不猜数值 —— 数值只能来自采集与设计稿
- 不生成组件/页面文档 —— 取决于实际有什么页面
- 不生成标杆页 —— 要先定 Token，再出页面

---

## 2. 前置：为什么前缀必须换

引擎模板里的类名是 `gf-btn` `gf-table` `gf-modal` 这一套。
如果新包保留 `gf-`，同事看到的是「一个叫 gf 的前缀出现在我们系统里」，
语义错乱，而且将来想改已经扩散到几十个页面了。

**前缀在建包时一次性换掉，成本最低。** 等页面生成完了再换，就是全库搜索替换的灾难。

---

## 3. 包结构

```
<prefix>-design-specs/
├── SKILL.md                 # 包内入口：目录结构 / 文档路由 / 强约束
├── foundation/
│   ├── tokens.md            # 取值唯一来源（建包器生成骨架，人工填值）
│   ├── design-sync.md       # 设计稿 ↔ 规范映射与同步流程（建包器预置）
│   └── （colors / typography / spacing / shadows / icons …按需要补）
├── components/              # 只写实际存在的组件
├── pages/                   # 只写实际存在的页面类型
├── examples/                # 标杆页
└── scripts/
    ├── check-tokens.js      # Token 双向校验器
    ├── check-design-sync.js # 设计稿 ↔ 规范核对器
    ├── new-page.js          # 页面生成器
    ├── install-hooks.js     # 提交门禁安装器
    ├── README.md            # 模板总索引
    ├── HOOKS-GUIDE.md       # 门禁说明
    └── <分类>/<模板>.html   # 11 套模板
```

---

## 4. 填充顺序（不能乱）

```
① foundation/tokens.md      写定稿取值
② scripts/*/*.html 的 :root  回灌取值
③ components/ pages/        按实际类型写文档
④ examples/                 new-page.js 出骨架 + 填真实文案
⑤ SKILL.md                  补文档路由与强约束清单
⑥ check-tokens.js --strict  退出码必须是 0
```

**① 和 ② 的顺序是硬约束。** 先改模板再补规范，两边就会各留一个数，
而且因为两边都「看起来合理」，往往几个月后才发现。

### 回灌时注意

- 模板 `:root` 只写本模板用到的 Token，不必全量复制
- 缺的 Token 由 `new-page.js` 自动合并（只补缺失项），但独立手写的页面要自己补
- 回灌完立刻跑一次校验，别攒到最后

---

## 5. 文档骨架

| 场景 | 骨架 |
| :-- | :-- |
| 组件文档 | `assets/doc-skeletons/COMPONENT.md.tpl` |
| 页面文档 | `assets/doc-skeletons/PAGE.md.tpl` |
| Token 汇总 | `assets/doc-skeletons/foundation/tokens.md.tpl` |
| 设计稿映射 | `assets/doc-skeletons/foundation/design-sync.md.tpl` |
| 包内入口 | `assets/doc-skeletons/PACKAGE-SKILL.md.tpl` |
| 用户级入口 | `assets/doc-skeletons/USER-SKILL.md.tpl` |

占位符：`{{SYSTEM}}` `{{PREFIX}}` `{{PACKAGE}}` `{{DATE}}` `{{NODE}}` `{{SPEC_ROOT}}` `{{WORKDIR}}` `{{NAME}}` `{{SOURCE}}`

---

## 6. tokens.md 的表格格式是硬要求

校验器按表格解析本文件来比对交付物：

```
| Token | 默认值 | 用途 |
|-------|--------|------|
| --color-primary | #2A6CDD | 品牌主色 |
```

- 第一列必须是 `--` 开头的 Token 名
- 第二列是取值；**留空或写 `--` 的占位行不会被解析**，可以放心做待填骨架
- 第三列含「预留 / 色板 / 暂不使用 / 不适用 / 保留 / 废弃」→ 识别为预留，不计入「规范未落地」

写错格式不会报错，只会静默漏检——这是最坏的一类失败。

---

## 7. 标杆页怎么生成

```bash
$NODE <包>/scripts/new-page.js --type=list --name=<真实页面名> --out=examples/demo-list.html
```

生成的是骨架 + 规范样式，**业务字段、数据、文案要逐项替换**
（文件里标了 `业务替换点` 注释）。

标杆页的价值：它是「这类页面长什么样」的唯一参考答案，
也是改规范/模板后的回归验证基线。空着不写，规范就只是一堆没有着落的数值。
