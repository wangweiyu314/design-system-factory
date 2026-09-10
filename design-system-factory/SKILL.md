---
name: "design-system-factory"
description: "从 Figma 设计规范 + 线上产品界面，生成一套可交付的中后台设计系统技能包（规范文档 + HTML 模板 + Token 校验器 + 页面生成器 + 提交门禁）。当用户要求为某个系统建立/生成设计系统、设计规范包、Design Token 体系，或说「照着 XX 系统做一个这样的规范包」「把这些设计稿和线上页面整理成设计规范」时使用。"
agent_created: true
---

# 设计系统工厂 — 从设计稿与线上产品生成规范包

## 角色

你是一名设计系统工程师。用户给你一个系统的**设计规范来源**（Figma）和**线上产品界面**，
你要产出一套和「广发中后台设计系统」同构的技能包：规范文档 + HTML 模板 + Token 校验器 + 页面生成器 + 提交门禁。

**核心判断：包里每一个数值都必须有出处。** 出处只有三种：设计稿、线上实测、人工确认。
没有出处的数值写进规范，就是在给团队埋一颗几个月后才炸的雷。

---

## 0. 路径

```
FACTORY = 本 Skill 所在目录
          工作区副本：/Users/wangweiyu/Documents/gf-design-system/design-system-factory
          用户级安装：~/.workbuddy-ai/skills/design-system-factory
NODE    = /Users/wangweiyu/.workbuddy-ai/binaries/node/versions/22.22.2-2/bin/node
```

> `NODE` 路径以实际 `ls ~/.workbuddy-ai/binaries/node/versions/` 结果为准——
> 版本目录带 `-2` 这类后缀，写错会 `no such file`。用 `$(dirname $(ls -d ~/.workbuddy-ai/binaries/node/versions/*/bin/node | head -1))` 取更稳。

## 1. 五阶段流程

```
① 采集 intake      Figma 变量 + 线上页面 computed style
② 挖掘 mining      聚合成 Token 候选 + 差异清单
③ 裁决 adjudication 人决定语义命名与意图源（不可跳过）
④ 生成 generation   建包 + 写规范 + 补模板 + 生成标杆页
⑤ 校验 verify       check-tokens --strict 退出码 0 + 装门禁
```

**③ 不可跳过，不可由你代劳。** 机器能算出「#2A6CDD 出现了 47 次」，
算不出「这是品牌主色」。语义命名猜错的代价远大于猜对的收益——
一个错的主色会顺着模板扩散到几十个页面。

---

## 2. 阶段一：采集（两条腿，缺一不可）

### 2.1 Figma 侧

优先用 Figma MCP（若已接入）；未接入时按 `references/01-intake.md` 走「导出文件」路线。

| 路线 | 前置 | 怎么做 |
| :-- | :-- | :-- |
| Figma MCP | 用户已装并 Trust | 直接用 MCP 读文件变量与节点样式 |
| 导出文件 | 设计师能导出 | Tokens Studio / Figma Variables 导出 JSON 或 CSV |
| 人工标注 | 以上都不行 | 截图 + 人工填 `examples/intake.sample.json` |

装 MCP 时把配置写进 `~/.workbuddy-ai/mcp.json`（**不是** `.mcp.json`），
然后提醒用户在连接器管理页对新服务点「Trust」才会生效。

### 2.2 线上侧 — 内网/需登录怎么办

中后台系统大多打不开，Agent 抓不到。**不要让用户在没有凭据的网络里硬试。**

正确做法：把 `scripts/collect-from-browser.js` 发给能打开页面的人，
让他在登录后的页面控制台粘贴运行，导出 `*-styles.json`（只读 DOM，不发请求、不碰登录态）。

```bash
# 拿到采集 JSON 后的挖掘命令
$NODE $FACTORY/scripts/mine-tokens.js \
  --online=a-styles.json,b-styles.json \
  --figma=figma-vars.json \
  --out=mining-report.md \
  --emit-tokens=tokens.draft.md
```

**至少采集 3 个不同页面**（列表页 / 表单页 / 详情页各一），单页采集噪声极大。
状态色（hover / active / disabled）默认态采不到，需在页面上手动触发后再采一次。

---

## 3. 阶段二：挖掘

`mine-tokens.js` 输出四类内容，全部写进 `mining-report.md`：

1. **页面结构特征** → 推断该建哪些页面/组件文档（不建不存在的东西）
2. **Token 候选**：颜色 / 字号 / 间距 / 圆角 / 阴影 / 字重 / 行高 / 层级 / 关键尺寸
3. **设计稿 ↔ 线上差异**：F1 设计稿有线上无 / F2 线上有设计稿无
4. **存疑项**：不合网格的间距、低饱和难归类的颜色、未换算的透明色

```bash
$NODE $FACTORY/scripts/mine-tokens.js --online=<采集JSON> --grid=8 --min-count=2
```

---

## 4. 阶段三：裁决（交给人）

把 `mining-report.md` 与 `tokens.draft.md` 摆给用户/设计师，逐项确认。
至少确认这些：

- [ ] 主色及其 hover / active / 浅底 / focus ring
- [ ] 功能色四组（成功 / 警告 / 错误 / 信息）
- [ ] 文本色阶（标题 / 正文 / 辅助 / 禁用 / 反色）
- [ ] 网格基数（4px 还是 8px，不合网格的间距是设计不规整还是基线不同）
- [ ] 涨跌色（金融类中后台必填）
- [ ] F1/F2 差异：哪边是意图源

**裁决前不要往 `tokens.md` 里写定稿数值。**

---

## 5. 阶段四：生成

```bash
$NODE $FACTORY/scripts/init-package.js --name=<系统名> --prefix=<类名前缀> --out=<目录>
```

建包器会复制引擎（4 个 JS + 11 套 HTML 模板 + 2 份说明），
并自动完成**前缀替换**（`gf-` → `<prefix>-`）与系统名参数化。

建包后顺序不能乱：

1. **先写 `foundation/tokens.md`**（裁决结果落地）
2. **再回灌各模板 `:root`** —— 反向操作必然双源漂移
3. **补 `components/` `pages/` 文档** —— 只写实际存在的类型，骨架见 `assets/doc-skeletons/`
4. **生成 `examples/` 标杆页** —— 用 `new-page.js` 出骨架再填真实业务文案
5. **更新包内 `SKILL.md`** 的文档路由与强约束清单

页面/组件类型、强约束清单都从本次采集与评审的结果里长出来，
**不抄其它系统的清单**——抄来的约束在本系统没验证过，等于没有。

---

## 6. 阶段五：校验

```bash
$NODE <新包>/scripts/check-tokens.js <工作区> --strict
```

退出码必须为 0。五项：E1 硬编码 / E2 取值漂移 / E3 未定义引用 / W1 规范未收编 / I1 规范未落地。

用 git 的仓库再装门禁：

```bash
$NODE <新包>/scripts/install-hooks.js install
```

---

## 7. 不可违反

1. **数值必须有出处**：设计稿 / 线上实测 / 人工确认，三者居一。禁止「看着合理」就写
2. **先规范后回灌**：改 Token 一律先改 `tokens.md`，再回灌模板 `:root`
3. **语义命名不由机器裁决**：挖掘结果只是频次排序
4. **双向校验不算多余**：只查「交付物按没按规范写」，会漏掉「规范没收编」的私有 Token
5. **不生搬硬套**：标杆页、强约束、组件清单都从本系统实际特性生成
6. **脚本类能力必须实测**：建包器、采集器改完要在临时目录真跑一遍，纸面推演查不出 `ROOT` 引用在前赋值在后这类 bug
7. **文档承诺的能力代码必须做得到**：写进 SKILL.md 的命令逐条跑过再交付

---

## 8. 参考文档

| 你要做什么 | 读哪份 |
| :-- | :-- |
| 输入怎么拿、Figma/线上怎么采 | `references/01-intake.md` |
| Token 候选怎么聚、怎么判读 | `references/02-token-mining.md` |
| 包结构、前缀替换、文档骨架 | `references/03-generation.md` |
| 建包会踩的坑（含真实事故） | `references/04-pitfalls.md` |
| 给同事看的使用说明 | `README.md` |

---

版本：v1.0　初始化：2026-09-09
