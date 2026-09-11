# 广发中后台设计系统 — HTML 模板总索引

> 本目录是**代码起步基座**。生成页面时从这里复制对应模板再改业务字段，
> 而不是从零写样式——这是保证 Token 化率、避免规范漂移的最短路径。
>
> 规范版本：design-specs **v2.10.3**　|　取值唯一来源：`foundation/tokens.md`
>
> 目录说明：技能包 = `design-specs/`。标杆页在 `examples/`，模板在 `scripts/`，
> 规范正文在 `foundation/` `components/` `pages/`。
>
> **v2.10 框架改版**：交付默认 MixedLayout（`layout/mixed-layout.html`）—— 通栏顶栏 56px 深蓝 #0C1D43 + 浅色侧边栏 200px 白底 + 卡片式多标签 40px + 内容流顶部面包屑（**v2.10.3 起不再占独立 48px 行**，见下）。
> **深色侧边栏变体已废弃**（`layout/dark-side-layout.html` 已删除，20 个 `--nav-color-sider*` Token 已清理）。存量页面迁移对照见 `components/layout.md` §7.5 末尾。
>
> v2.8 图表提示：手写 SVG 图表必须加 `max-height` 兜底，环形图直径要锁死（220px），
> 色值一律经 `chartToken()` 读 CSS 变量。详见 `pages/dashboard-page.md` §图表实现约束。
>
> v2.9 按钮语义提示：裸 `.gf-btn` = **主按钮**，次按钮 `.gf-btn--secondary`、危险 `.gf-btn--danger`；
> **禁止 `.gf-btn--primary`**（历史上浮层模板语义相反，已统一）。详见 `components/basic.md` §按钮 CSS 类语义（强制）。

---

## 1. 模板清单

| 模板 | 分类 | 用途 | 状态 |
| :-- | :-- | :-- | :-- |
| `layout/mixed-layout.html` | 布局 | **v2.10 唯一布局**：通栏顶栏（56px 深蓝）+ 浅色侧边栏（200px 白底）+ 卡片式多标签 + 内容流顶部面包屑（v2.10.3 起并入内容流，无独立行/无背景） | v2.10 新增 / v2.10.3 收尾 |
| `layout/side-layout.html` | 布局 | 侧边导航布局（仅作选型参考） | 仅作参考 |
| `navigation/multi-tab-nav.html` | 导航 | **多标签导航**（卡片式页签 + 箭头溢出切换、三项关闭策略；页签宽度由内容决定） | v2.10 卡片化 / v2.10.3 同步 |
| `table/basic-table.html` | 表格 | 基础表格（表格卡节奏、操作列、分页） | 已沉淀 |
| `table/fixed-action-table.html` | 表格 | **固定操作列表格**（sticky 右固定列 + 分隔阴影） | v2.4 沉淀 |
| `form/basic-form.html` | 表单 | 基础表单（垂直布局、字段宽度档、底部操作栏） | 已沉淀 |
| `charts/basic-statistic-card.html` | 指标卡 | 基础指标卡（多列等分 + SVG sparkline） | 已沉淀 |
| `description-list/basic-descriptions.html` | 描述列表 | 基础描述列表（多列布局、Tag 标签、长文本） | 已沉淀 |
| `pages/login-page.html` | 页面 | **登录页**（样式一 渐变双栏 / 样式二 白底单栏，含完整交互） | v2.5 新增 |
| `modal/basic-modal.html` | 浮层 | **弹窗**（三段式 header/body/footer + 480/640/800 三档宽度） | v2.6 新增 |
| `drawer/basic-drawer.html` | 浮层 | **抽屉**（自定义固定工作栏 + 480/560 两档宽度） | v2.6 新增 |

### 标杆页索引（`../examples/`）

规则写在规范文档里，**「长什么样」看标杆页**。改模板或规范后，标杆页就是回归基线。

| 标杆页 | 类型 | 看点 |
| :-- | :-- | :-- |
| `../examples/demo.html` | 列表页 | v2.10 MixedLayout：通栏顶栏 + 浅色侧边栏、卡片式多标签、内容流顶部面包屑（v2.10.3 起）、固定操作列表格、常驻底部操作栏 |
| `../examples/demo-form.html` | 表单页 | 字段宽度档、双列布局、校验提示、底部操作栏 |
| `../examples/demo-detail.html` | 详情页 | 描述列表、流程时间轴、关联表格、Tag 标签 |
| `../examples/demo-dashboard.html` | 仪表盘页 | KPI 指标卡、SVG 图表（`max-height` 兜底 / 环形直径锁死） |
| `../examples/demo-login.html` | 登录页 | 渐变双栏 980×616 / 白底单栏 408×430、图标 36px 预留 |
| `../examples/demo-overlay.html` | 页面 + 浮层 | 弹窗 640 + 抽屉 480、遮罩作用域隔离 |
| `../examples/产品备案登记表单.html` | 交付样例 | 真实业务表单页（v2.10 框架；无多标签） |

> 生成器产出的页面默认落在当前目录；若要沉淀为标杆页，输出到 `../examples/` 并回本表登记。

---

## 2. 选型决策树

### 2.1 布局选型（v2.10）

| 判断条件 | 选它 | 依据 |
| :-- | :-- | :-- |
| **0→1 新建系统（默认）**） | `layout/mixed-layout.html`（通栏顶栏 + 浅色侧边栏） | `components/layout.md` §7.5 |
| 已有项目中加页面 | **不套布局模板**，只生成内容区（`--layout=none`） | SKILL.md「页面生成工作流」第 2 条 |
| 深色侧边栏 + 菜单搜索 + 底部用户区（**已废弃**） | 旧 `layout/dark-side-layout.html` 已删除，请迁移至 mixed-layout | `components/layout.md` §7.5 末尾 |

### 2.2 内容区选型

| 页面类型 | 主模板 | 配套 |
| :-- | :-- | :-- |
| 列表页 | `table/fixed-action-table.html`（有横向滚动/固定操作列）<br>`table/basic-table.html`（列少、无需固定） | `layout/mixed-layout.html`（内置卡片式多标签与内容流顶部面包屑） |
| 表单页 | `form/basic-form.html` | 同上 |
| 详情页 | `description-list/basic-descriptions.html` | 配套表格用 `table/basic-table.html` |
| 仪表盘页 | `charts/basic-statistic-card.html` | `components/statistic-card.md` 选型表 |
| 登录页 | `pages/login-page.html` | 不套布局，独立全屏页 |

### 2.3 表格选型

| 判断条件 | 选它 |
| :-- | :-- |
| 列数多、需横向滚动、操作列需常驻 | `fixed-action-table.html` |
| 列数少（≤6）、无横向滚动 | `basic-table.html` |

### 2.4 指标卡选型

| 判断条件 | 类型 | 依据 |
| :-- | :-- | :-- |
| 单个核心指标 + 迷你趋势图 | 基础指标卡 | `components/statistic-card.md` |
| 多个同级核心指标横向并排 | 同级指标卡 | 同上 |
| 总量与分项占比关系 | 总分指标卡 | 同上 |
| 多个独立指标 + 每卡 mini chart | 嵌套指标卡 | 同上 |
| 多维指标通过页签切换 | 页签联动指标卡 | 同上 |

### 2.5 浮层选型

| 判断条件 | 选它 | 宽度 Token |
| :-- | :-- | :-- |
| 二次确认、简短提示 | `modal/basic-modal.html` → `.gf-modal--confirm` | `--modal-confirm-width` 480px |
| 普通单列表单 | `modal/basic-modal.html` → `.gf-modal--form` | `--modal-form-width` 640px |
| 复杂表单、多模块配置、列表弹窗 | `modal/basic-modal.html` → `.gf-modal--complex` | `--modal-complex-width` 800px |
| 信息详情、只读预览 | `drawer/basic-drawer.html` → `.gf-drawer--detail` | `--drawer-detail-width` 480px |
| 单列垂直表单，需保留页面上下文 | `drawer/basic-drawer.html` → `.gf-drawer--form` | `--drawer-form-width` 560px |

**浮层强约束（改动即踩坑）**

- Modal 必须三段式，`container` 强制 `padding: 0`（否则分割线左右不到头）
- Modal 头部 **52px**（`--floating-header-height`）、底部 **52px**（`--floating-footer-height`）
- Drawer 头部 **56px**（`--floating-drawer-header-height`），与 Modal **不同值**，勿混用
- Drawer 禁用默认 `title` / `closable`，一律自定义 header，操作按钮放 header 右侧
- 桌面端 Drawer **默认不生成 footer**，仅移动端或强流程才加
- `body` 是唯一滚动区，禁止把操作区卷进滚动区
- 展示类浮层（详情、只读）不生成 footer；操作类（新增、编辑、审批）必须有固定可见操作区
- 必须有视口兜底 `max-width: calc(100vw - 48px)`，且上下居中（禁止 `top: 100px`）

---

## 3. 使用工作流

```
1. 判类型   → pages/ 下对应规范文档（list / form / detail / dashboard / login）
2. 选布局   → layout/mixed-layout.html（v2.10 唯一布局）
3. 选内容   → 按 §2.2 选型表挑内容区模板
4. 拼装     → 用 new-page.js 一键拼装（默认 mixed），或手工把内容区塞进布局模板 .gf-content
5. 换业务   → 只替换「业务替换点」注释处：标题、菜单、字段、数据、提交逻辑
6. 保结构   → 关键 className、Design Token、间距节奏、交互分区一律不动
7. 跑校验   → node design-specs/scripts/check-tokens.js design-specs --strict
```

### 替换点约定

模板内所有需改位置均用注释标记，全局搜索 **`业务替换点`** 即可定位：

```html
<!-- 业务替换点：菜单分组（标题 + 菜单项 + 图标） -->
<!-- ★ 业务替换点：替换为真实登录接口调用 -->
```

### 禁止改动清单

- `:root` 中的 Token **取值**（要改先改 `foundation/tokens.md`，再回灌）
- `.gf-` 前缀的 className 与 BEM 命名结构
- 表格卡内部节奏（水平 24px 内容线 / 垂直 16px / 首末列 24px）
- 固定列的 `border-collapse: separate`（强约束 #18）
- 多标签的箭头溢出方案（强约束 #19）

---

## 4. 模板验收清单

复制模板改造后，逐项自检：

- [ ] `node design-specs/scripts/check-tokens.js design-specs --strict` 退出码 0
- [ ] 无 JS 控制台报错，内联 `<script>` 语法通过
- [ ] 无外链资源（CDN、图片、图标字体），图标全部内联 SVG
- [ ] 页面标题只渲染一次（PageHeader 是唯一来源，强约束 #6）
- [ ] PageHeader 无 `padding-inline`（强约束 #7）
- [ ] 面包屑仅出现在有上级路径的页面（强约束 #8）；**v2.10.3 起位于 `.gf-content` 内并作为其首子元素**，无独立行、无背景，上下留白由 `padding: var(--space-3) 0` 自带；`.gf-content` 的 `padding-top` 必须为 0（由 [E4-2] 自动校验）
- [ ] 分页器未出现 margin + padding 叠加 32px（强约束 #12）
- [ ] 固定操作列使用 `border-collapse: separate`（强约束 #18）
- [ ] 多标签为卡片式（页签宽度由内容决定、可关闭页签右侧留白 32px 使 X 不挤文字、激活白底 + 主色文字、页签间 1px 分隔线、栏体下投影且肉眼可见），溢出用箭头、滚动条隐藏（强约束 #19）
- [ ] 指标卡 mini chart 为 SVG sparkline，非 img 占位
- [ ] 浮层容器 `padding: 0`，分割线横向到边缘
- [ ] 浮层上下居中且有 `max-width: calc(100vw - 48px)` 兜底
- [ ] Drawer 用自定义 header（56px），未使用默认标题栏结构

---

## 5. 配套脚本

| 脚本 | 用途 | 用法 |
| :-- | :-- | :-- |
| `check-tokens.js` | Token **双向**对齐校验 | `node design-specs/scripts/check-tokens.js design-specs --strict [--json]` |
| `new-page.js` | 一键生成页面 / 浮层脚手架 | `node design-specs/scripts/new-page.js --type=list --name=产品列表` |
| `install-hooks.js` | 把规范校验装进 git 提交环节 | `node design-specs/scripts/install-hooks.js install`<br>📖 完整用法见 **[HOOKS-GUIDE.md](./HOOKS-GUIDE.md)** |
| `check-design-sync.js` | 设计稿 ↔ 规范**双向**核对（抓两个真值源的漂移） | `node design-specs/scripts/check-design-sync.js <导出文件>`<br>📖 映射与流程见 `../foundation/design-sync.md` |

#### 提交门禁（推荐：让约束自动生效）

`check-tokens.js` 靠自觉，`install-hooks.js` 靠流程。装好之后 `git commit` 会自动校验，
不合规直接拦下并给出行号——**从「交付前手动检查」变成「不合规则不让提交」**。

```bash
node design-specs/scripts/install-hooks.js install   # 装
node design-specs/scripts/install-hooks.js status    # 查状态 / 现在能否提交
node design-specs/scripts/install-hooks.js uninstall # 卸
```

三步上手、被拦后怎么改、紧急绕过、团队协作、CI 配合等完整说明见
**[HOOKS-GUIDE.md](./HOOKS-GUIDE.md)**。

> 当前工作区尚未 `git init`，无法安装门禁。想先验证规范是否达标，直接跑
> `node design-specs/scripts/check-tokens.js design-specs --strict`（退出码 0 即达标）。

### new-page.js 参数（v1.2：页面 + 浮层全覆盖）

```
node design-specs/scripts/new-page.js --type=<类型> --name=<名称> [选项]

--type     list | form | detail | dashboard | login | modal | drawer
--layout   mixed（默认，v2.10 通栏顶栏 + 浅色侧边栏）| none（只要内容区）
--tabs     mixed 内置卡片式多标签，--tabs 忽略
--overlay  给页面附带浮层骨架，逗号分隔，每档可带尺寸：
             modal           弹窗 confirm(480) 档
             modal:form      弹窗 form(640) 档
             modal:complex   弹窗 complex(800) 档
             drawer          抽屉 detail(480) 档
             drawer:form     抽屉 form(560) 档
             both            modal + drawer（各取默认档）
--no-trigger  不注入「演示入口」触发条
--out      输出路径  --system 系统名  --no-check 跳过校验
```

四种典型用法：

```bash
# 1）独立浮层演示页（modal / drawer 直接产出可打开的页面）
node design-specs/scripts/new-page.js --type=modal  --name=新增客户
node design-specs/scripts/new-page.js --type=drawer --name=客户详情

# 2）页面 + 浮层一次到位（可指定档位）
node design-specs/scripts/new-page.js --type=list  --name=交易申报记录 --overlay=modal:form,drawer
node design-specs/scripts/new-page.js --type=form  --name=新增交易申报 --overlay=modal:form

# 3）只出内容区（已有项目里加页面）
node design-specs/scripts/new-page.js --type=form --name=新增交易申报 --layout=none
```

**浮层接入**：生成器会打印遮罩 `id`，给任意按钮加 `data-modal-open="<id>"` /
`data-drawer-open="<id>"` 即可打开；关闭已内置（关闭图标 / 取消 / 点遮罩 / Esc）。
默认还会注入一条「演示入口」触发条，页面一打开就能点开浮层验收，
**接入业务后搜索「演示入口」整块删除**（`--no-trigger` 可不注入）。

**⚠ 浮层样式的作用域不要去掉**：注入宿主页面的浮层 CSS 会被自动改写为
`.gf-modal-mask …` / `.gf-drawer-mask …`。作用是防止浮层规则反向污染宿主页面
（v2.9 前浮层与布局的按钮语义相反，曾导致全站主按钮集体变白；语义虽已统一，
作用域隔离仍是必要的兜底——两边同名类的取值仍可能各自演进）。

生成器的防呆：模板缺失在参数阶段就报错（不抛栈）；`--out` 指向目录会提示带文件名；
档位非法会列出可选值；注入浮层时剔除宿主已有规则，并过滤演示页专用的 `.demo-launch`。

### check-design-sync.js（设计稿 ↔ 规范）

`check-tokens.js` 管的是「交付物有没有按规范写」，`check-design-sync.js` 管的是更上游的一段——
**规范里的数跟设计稿对不对得上**。设计稿和规范是两个各自演进的真值源，不同步就会漂移——
漂移不会报错，只会悄悄变成规范的一部分，等下游页面长歪了才被发现。

```bash
# 1) 设计师导出变量文件，照 design-export.sample.json / .csv 填
# 2) 跑核对
node design-specs/scripts/check-design-sync.js design-specs/scripts/design-export.sample.json

# 建议加 --strict，把「设计稿有规范无 / 规范有设计稿无」也计为失败
node design-specs/scripts/check-design-sync.js <导出文件> --strict
```

| 差异 | 含义 | 处置 |
| :-- | :-- | :-- |
| **D3 同名不同值** | **真值源冲突**（核心目标）：规范与设计稿取值不一致 | 先定哪边是「意图源」再改另一边，**禁止两边各留一个数** |
| **D1 设计稿有、规范无** | 规范未收编 | 收编进 `tokens.md`；确属色板预留则标注「预留」并指向替代 Token |
| **D2 规范有、设计稿无** | 设计稿未同步，或规范虚胖 | 补设计稿 / 按虚胖处理。局部导出时天然很长，默认只列前 12 项 |

自动识别 4 种导出形态：Figma 原生变量、Tokens Studio 嵌套、扁平 JSON、CSV/TSV。
名称配对会**逐级去掉路径前缀**去试（`global/color/primary` → `--color-primary`），
`headerHeight` 这类驼峰与 `color/primary` 这类斜杠也能命中。
`hex + opacity` 会自动合成 rgba——**填充色与不透明度分开导出**是最高频的偏差来源。

退出码 0 = 无差异；1 = 存在差异。详见 `../foundation/design-sync.md`。

### check-tokens.js 检查项

| 级别 | 项 | 含义 |
| :-- | :-- | :-- |
| E1 | 硬编码色值 | 正文出现未在 `:root` 声明的 hex / rgb 字面量 |
| E2 | 取值漂移 | 文件 `:root` 定义与 `foundation/tokens.md` 不一致（**规范 → 交付物**） |
| E3 | 未定义引用 | `var(任意 Token 名)` 被使用但本文件未定义（**交付物 → 规范**） |
| W1 | 规范未收编 | 文件已定义并使用，但 `tokens.md` 未登记（潜在双源漂移） |
| I1 | 规范未落地 | `tokens.md` 有定义但全库零使用（信息项，供清理废 Token） |
| E4 | 框架结构一致 | 框架约定级回归，见下节（v2.10.3 新增） |

> 双向 = 既查「交付物有没有按规范写」，也查「规范有没有收全交付物在用的」。
> 只做单向会在模板里悄悄长出规范管不到的私有变量——v2.5 之前就是这样欠下 58 个未收编 Token 的。

### check-tokens.js 的 [E4] 框架结构一致性

E1/E2/E3 只管**取值对不对**，管不了**结构对不对**。E4 补的是后者：

| 编号 | 断言 |
| :-- | :-- |
| E4-1 | 不得再引用 `tokens.md`「已移除 Token」表中的 Token（自动读表，新增移除项即生效） |
| E4-2 | 有面包屑时 `.gf-content` 的 `padding-top` 必须为 0 |
| E4-3 | `.gf-breadcrumb` 禁止 `background` / `height`（背景归 `.gf-content`，高度由内容流决定） |
| E4-4 | 面包屑必须是 `<main class="gf-content">` 的**首子元素** |
| E4-5 | `.gf-tabsbar__tab` 禁止 `min-width` / 固定 `width`（宽度由内容 + padding 决定） |
| E4-6 | 必须存在 `.gf-layout--collapsed .gf-collapse-trigger … { rotate(180deg) }`（收起态箭头向右） |
| E4-7 | `.gf-tabsbar` 必须 `position: relative` + `z-index`（否则下投影被后续兄弟元素盖住） |
| E4-8 | `.gf-sider` 背景必须为 `var(--color-bg-card)`（浅色侧栏，深色变体已删） |

只作用于含 `.gf-content` / `.gf-tabsbar` / `.gf-collapse-trigger` 的布局类文件，
组件片段与独立页面自动跳过——每项都有「相关元素是否出现」的前置条件。

**为什么需要它**：v2.10.3 批量改造 6 份布局文件时，`demo-dashboard.html` 的
`.gf-content` 把 background 写成 `--color-bg-card`（当时仪表盘走白底例外，v2.10.3 末已取消、统一为 `--color-bg-canvas`），
整串精确匹配落空 → 它是唯一残留 `padding-top: 16px` 的文件，面包屑比其它页面低 16px。
而 E1/E2/E3 全 0、校验器报绿，只能靠肉眼发现。
**结论：框架约定不能只写在文档里——凡是「批量脚本可能漏掉某个文件」的约定，都应进校验器。**

### 关于 I1「未落地」

I1 不是失败项，但**不应该被无视**——它通常指向三种真实问题，v2.6 已全部处理：

| 成因 | 表现 | 处理 |
| :-- | :-- | :-- |
| 校验器盲区 | Token 在 JS 里通过 `getPropertyValue('--x')` 读取，静态扫 `var()` 扫不到 | 校验器已支持识别 JS 动态读取 |
| 缺模板 | 规范写了尺寸 Token 但没有对应组件（如浮层尺寸） | 补模板，让 Token 真正落地 |
| 规范虚胖 | 重复定义、照抄外部技能包、色板预留档位 | 在 `tokens.md` 用途列标注「预留 / 色板 / 废弃」并指向应替代的 Token |

> **标注预留的写法**：在 `tokens.md` 用途列写「预留：……，请用 `--xxx`」。校验器识别后单列为「已标注预留」，不计入 I1。
> 这样既保留溯源价值（如 Ant Design 对标档位），又明确了实现该用哪个 Token。
