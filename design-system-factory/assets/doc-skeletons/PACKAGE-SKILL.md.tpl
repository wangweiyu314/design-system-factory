---
name: "{{PREFIX}}-design-system"
description: "{{SYSTEM}} 设计规范与前端交付能力。当用户要求生成、构建、修改、复刻或评审 {{SYSTEM}} 的网页、页面、UI 组件或前端界面，或询问其设计规范取值（颜色、字体、间距、圆角、阴影、Token、图标、组件规格、页面布局）时使用。也用于执行该系统的 Token 一致性校验与页面脚手架生成。"
agent_created: true
---

# {{SYSTEM}} 设计系统

> **本文件是入口，不是规范副本。**
> 规范正文唯一来源在 `SPEC_ROOT`（见 §0）。任何取值都必须回源查询，禁止凭记忆或从本文件复制数值——
> 本文件刻意不含任何规范数值，以防双源漂移。

## 0. 路径

```
SPEC_ROOT = {{SPEC_ROOT}}
NODE      = {{NODE}}
```

规范版本：**v0.1.0（初始化）**

## 1. 两条铁律

1. **回源再动手**：任何颜色、字号、间距、圆角、阴影、组件尺寸，先查 `foundation/tokens.md`（取值唯一来源）与对应组件/页面文档，禁止凭记忆写数值。
2. **模板起步，别从零写**：`scripts/` 下有已验证模板（清单与选型见 `scripts/README.md`），复制改造比手写更快也更不容易违规。

## 2. 一键生成（新建页面时的首选路径）

```bash
cd {{WORKDIR}}
$NODE {{PACKAGE}}/scripts/new-page.js --type=list --name=<页面名>
```

| 参数 | 取值 |
| :-- | :-- |
| `--type` | `list` / `form` / `detail` / `dashboard` / `login` / `modal` / `drawer`（必填）；后两者产出独立浮层演示页 |
| `--name` | 页面名（必填） |
| `--layout` | `dark-side`（默认）/ `side` / `none`（已有项目只生成内容区） |
| `--tabs` | 附多标签导航 |
| `--overlay` | 附带浮层骨架：`modal[:confirm\|form\|complex]` / `drawer[:detail\|form]` / `both` |
| `--no-trigger` | 不注入「演示入口」触发条 |
| `--out` | 输出路径 |

生成后**必须**按文件里 `业务替换点` 注释逐项替换业务字段、数据与提交逻辑。

## 3. 交付前必跑

```bash
$NODE {{PACKAGE}}/scripts/check-tokens.js {{WORKDIR}} --strict
```

退出码必须为 0。五项检查：E1 硬编码色值 / E2 取值漂移（规范→交付物）/ E3 未定义引用 / W1 规范未收编（交付物→规范）/ I1 规范未落地。

> **只做单向校验不算数。** 单向校验会让「模板在用、规范没收编」的私有 Token 悄悄长出来。

## 3.1 提交门禁（让约束自动生效）

```bash
$NODE {{PACKAGE}}/scripts/install-hooks.js install   # 装（幂等）
$NODE {{PACKAGE}}/scripts/install-hooks.js status    # 查状态
$NODE {{PACKAGE}}/scripts/install-hooks.js uninstall # 卸
```

- 只校验不改码；紧急绕过 `git commit --no-verify` 或 `GF_SKIP_TOKEN_CHECK=1`（**事后必须补修**）
- `.git/hooks/` 不受版本控制，**每个 clone 都要装一次**
- 完整说明见 `scripts/HOOKS-GUIDE.md`

## 4. 文档路由

| 你要做什么 | 去哪 |
| :-- | :-- |
| 页面结构 | `pages/<type>-page.md` |
| 组件规格 | `components/*.md` |
| 任何数值 | `foundation/tokens.md` |
| 设计稿与规范比对 | `foundation/design-sync.md` + `scripts/check-design-sync.js` |
| 模板选型与拼装 | `scripts/README.md` |
| 某类页面「长什么样」 | `examples/` |

<!-- 页面/组件类型清单在建包时按实际采集结果生成，不要预先写死不存在的类型 -->

## 5. 强约束清单

<!-- 建包时按实际采集与评审结果填写。写法建议：一条一行，写清「现象 + 为什么 + 正确做法」。
     只写在本系统真实发生过或验证过的约束，不抄其它系统的清单。 -->

| # | 约束 | 为什么 |
| :-- | :-- | :-- |
| 1 | 交付前跑双向 Token 校验且退出码为 0 | 单向校验会漏掉规范未收编的 Token |

## 6. 标杆页面

<!-- 建包后按实际页面类型生成，见 examples/ -->

---

初始化时间：{{DATE}}
