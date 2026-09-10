# 设计系统工厂

给一套 Figma 设计规范和几个线上页面地址，产出一套**可交付的中后台设计系统技能包**：
规范文档 + HTML 模板 + Token 校验器 + 页面生成器 + 提交门禁。

产出的包和「广发中后台设计系统」同构，但**数值、页面类型、约束都来自你这套系统**，不套用广发的。

---

## 你要准备什么

| 输入 | 谁提供 | 怎么给 |
| :-- | :-- | :-- |
| Figma 设计规范 | 设计师 | MCP 接入，或导出 JSON/CSV，或截图 |
| 线上产品主要界面地址 | 产品/开发 | 能打开页面的人跑一下采集脚本，导出 JSON |
| 系统名 + 类名前缀 | 你定 | 例：系统名「某某资管平台」，前缀 `am` |

**内网/需登录的页面**：Agent 打不开，不用试。让能打开的人在浏览器控制台粘贴
`scripts/collect-from-browser.js` 跑一下，会下载一个 `*-styles.json`，把它交给 Agent 即可。
脚本只读 DOM，不发请求、不改页面、不碰登录态。

---

## 五分钟跑通

```bash
NODE=/Users/wangweiyu/.workbuddy-ai/binaries/node/versions/22.22.2-2/bin/node
FACTORY=/Users/wangweiyu/Documents/gf-design-system/design-system-factory

# 1. 挖掘：把采集到的线上样式 + 设计稿导出，聚合成 Token 候选
$NODE $FACTORY/scripts/mine-tokens.js \
  --online=list-styles.json,form-styles.json,detail-styles.json \
  --figma=figma-vars.json \
  --out=mining-report.md --emit-tokens=tokens.draft.md

# 2. 建包（引擎复制 + 类名前缀替换 + 文档骨架）
$NODE $FACTORY/scripts/init-package.js \
  --name=某某资管平台 --prefix=am --out=./am-design-specs

# 3. 填规范（人工，依据 mining-report.md 与 tokens.draft.md）
#    先写 am-design-specs/foundation/tokens.md，再回灌模板 :root

# 4. 校验，退出码必须是 0
$NODE am-design-specs/scripts/check-tokens.js . --strict
```

第 3 步没有捷径。**机器能算出「#2A6CDD 出现了 47 次」，算不出「这是品牌主色」。**
语义命名必须由设计师确认——一个错的主色会顺着模板扩散到几十个页面。

---

## 产出包里有什么

```
am-design-specs/
├── SKILL.md              包内入口（文档路由 + 强约束清单）
├── foundation/
│   ├── tokens.md         取值唯一来源
│   └── design-sync.md    设计稿 ↔ 规范映射与同步流程
├── components/           只写实际存在的组件
├── pages/                只写实际存在的页面类型
├── examples/             标杆页
└── scripts/
    ├── check-tokens.js        Token 双向校验（防硬编码、防取值漂移、防规范未收编）
    ├── check-design-sync.js   设计稿 ↔ 规范核对（抓人工转录误差）
    ├── new-page.js            一键页面生成器
    ├── install-hooks.js       提交门禁（不合规不让提交）
    └── <分类>/*.html          11 套已验证模板
```

---

## 目录说明

| 路径 | 给谁看 |
| :-- | :-- |
| `SKILL.md` | Agent 的工作流总控 |
| `README.md` | 本文件，给用这个工厂的人 |
| `references/01-intake.md` | 输入怎么拿（Figma 三路线 / 线上采集 / 质量自检） |
| `references/02-token-mining.md` | 候选怎么判读、命名规则、常见误判 |
| `references/03-generation.md` | 建包、填充顺序、文档骨架 |
| `references/04-pitfalls.md` | 真实事故清单，动手前值得扫一眼 |
| `scripts/collect-from-browser.js` | 浏览器端采集脚本（给能打开页面的人） |
| `scripts/mine-tokens.js` | 取值挖掘器 |
| `scripts/init-package.js` | 建包器 |
| `assets/engine/` | 待复制的引擎（4 JS + 11 模板 + 2 说明） |
| `assets/doc-skeletons/` | 规范文档骨架模板 |
| `examples/intake.sample.json` | 人工标注兜底模板 |

---

## 常见问题

**一定要有 Figma 吗？**
不一定，但只有线上采集时，规范描述的是「现状」而不是「意图」，
历史遗留的脏值会被洗白成标准。有设计稿才能做双向核对。

**线上页面一个都打不开怎么办？**
走人工标注：截图 + 填 `examples/intake.sample.json`。
质量会下降，但比硬编一套数值强。

**能不能直接复制广发的规范改改？**
不能，也不该。数值、页面类型、约束都是广发系统的产物，
抄过来的东西在你这套系统里没验证过，等于没有。

**生成完就完事了吗？**
没有。`check-tokens.js --strict` 退出码为 0 只是及格线。
规范要跟着设计稿升级持续维护，见产出包里的 `foundation/design-sync.md`。

---

版本：v1.0
