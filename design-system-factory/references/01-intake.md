# 01 · 采集：输入怎么拿

建包质量的上限由输入决定。这一阶段偷的懒，后面十个阶段补不回来。

---

## 1. 需要什么

| 输入 | 用途 | 拿不到时的后果 |
| :-- | :-- | :-- |
| Figma 变量导出 | 颜色/字号/间距/圆角/阴影的**意图值** | 规范只能描述现状，无法表达设计意图 |
| 线上页面采集 JSON | 颜色的**实现值** | 不知道线上和设计稿差多远 |
| 线上页面截图 | 页面结构、区块构成 | 页面类型靠猜 |
| 页面类型清单 | 决定建哪些文档 | 建一堆不存在的页面文档 |

**设计稿与线上两条腿都要。** 只靠设计稿 → 规范描述的是「应该长什么样」，落不了地；
只靠线上 → 规范把历史遗留的脏值洗白成标准。两者的差异本身才是最有价值的信息。

---

## 2. Figma 三条路线

### 路线 A：Figma MCP（最省事，需前置安装）

**先判断当前跑在哪个 Agent 里，再按对应方式接。有官方路线的必须用官方的。**

Figma 官方 Remote MCP 地址统一为 `https://mcp.figma.com/mcp`，
走 OAuth 授权，不需要装 Figma 桌面端。

| Agent | 官方接入方式 | 命令 / 配置 |
| :-- | :-- | :-- |
| **Claude Code** | 官方插件（首选） | `claude plugin install figma@claude-plugins-official` |
| | 或手动添加 | `claude mcp add --transport http figma https://mcp.figma.com/mcp`<br>加 `--scope user` 可全局可用（默认只对当前项目） |
| **Cursor** | 官方插件（首选） | 在 Agent 对话里输入 `/add-plugin figma` |
| | 或 MCP deeplink | `cursor://anysphere.cursor-deeplink/mcp/install?name=Figma&config=eyJ1cmwiOiJodHRwczovL21jcC5maWdtYS5jb20vbWNwIn0%3D` |
| **Codex** | 官方插件（首选） | Codex app → 左上角 Plugins → Figma 旁「+」→ Install |
| | 或 CLI | `codex mcp add figma --url https://mcp.figma.com/mcp` |
| **VS Code** | 官方 | `⌘⇧P` → `MCP: Open User Configuration` → 写 `mcp.json` |
| **Xcode 27+** | 官方插件 | Settings → Intelligence → Plug-ins → Add from URL：`https://github.com/figma/mcp-server-guide` |
| **WorkBuddy** | 配置文件 | `~/.workbuddy-ai/mcp.json`（**注意没有点前缀**） |

需要写文件的两种：

```json
// VS Code —— MCP: Open User Configuration
{
  "servers": {
    "figma": { "url": "https://mcp.figma.com/mcp", "type": "http" }
  }
}
```

```json
// WorkBuddy —— ~/.workbuddy-ai/mcp.json
{
  "mcpServers": {
    "figma": { "url": "https://mcp.figma.com/mcp", "type": "http" }
  }
}
```

**授权动作**：配置完不会自动可用。在客户端里对 Figma 这一项点
**Authenticate / Connect / Start** → 浏览器里 **Allow access** → 回到客户端看到已连接才算通。
WorkBuddy 是：连接器管理页 → 自定义连接器 → 对新服务点「Trust」。

**没有官方插件的 Agent**（只要支持 MCP 就能用）：

1. 先试远程 HTTP —— 上面那个 URL 配 `type: http`，多数客户端认这个
2. 该 Agent 只支持 stdio 的话，退回社区实现（需 Figma API Key）：

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp", "--figma-api-key=<TOKEN>", "--stdio"]
    }
  }
}
```

**判断顺序**：有官方路线 → 用官方；没有官方但支持 MCP → 用上面的通用写法；
完全不支持 MCP → 直接走路线 B（导出文件），别在接入上耗时间——
这条路线的产出和导出文件是一样的，只是省了「让设计师导一次」的沟通成本。

> **别自己编字段名。** 远程地址、deeplink、CLI 参数都从 Figma 官方文档取。
> 这个领域半年一变，任何写死的版本都会过期；配置前先核一眼官方文档。

### 路线 B：导出文件（最稳，推荐默认）

设计师在 Figma 里用 Tokens Studio 或 Variables 导出 JSON/CSV。
`mine-tokens.js` 与引擎里的 `check-design-sync.js` 都认这四种形态：

1. Figma 原生变量：`{"name":"color/primary","value":"#2A6CDD"}`
2. Tokens Studio：`{"global":{"color":{"primary":{"value":"#2A6CDD","type":"color"}}}}`
3. 扁平 JSON：`{"--color-primary":"#2A6CDD"}`
4. CSV/TSV：表头含 name/value（或 名称/值、Token/默认值）

样例见 `assets/engine/scripts/design-export.sample.json` 与 `.csv`。

**建议设计师把变量名起成和 Token 同名**（去掉 `--`），核对脚本就能直连，不用维护改名映射。

### 路线 C：人工标注（兜底）

截图 + 填 `examples/intake.sample.json`。能填多少填多少，空着的地方在阶段三标注「未采集」。

---

## 3. 线上页面：内网/需登录的正确做法

**不要试图让 Agent 硬闯登录页。** 中后台在内网是大概率事件，抓不到就换路子。

### 标准做法：让能打开页面的人跑采集脚本

1. 把 `scripts/collect-from-browser.js` 发给对方
2. 对方打开目标页面（登录态）→ F12 → Console → 粘贴 → 回车
3. 自动下载 `<hostname>-styles.json`，交回给你

脚本只读 DOM，不发请求、不改页面、不碰登录态，生产环境可放心跑。

### 采集哪些页面

| 优先级 | 页面 | 为什么 |
| :-- | :-- | :-- |
| 必采 | 列表页（带表格/分页） | 表格是取值密度最高的组件 |
| 必采 | 表单页 | 控件尺寸、校验态、间距节奏 |
| 必采 | 详情页 | 描述列表、字段分组 |
| 选采 | 仪表盘页 | 图表色、指标卡 |
| 选采 | 登录页 | 通常是独立视觉体系 |

**至少 3 个页面**，单页噪声太大。

### 采不到的部分

| 内容 | 为什么采不到 | 怎么办 |
| :-- | :-- | :-- |
| hover / active / disabled 态 | computed style 只反映当前状态 | 手动触发状态后再采一次，或从设计稿补 |
| 图表系列色 | 常在 JS 里动态生成 | 从设计稿补 |
| 浮层（弹窗/抽屉） | 默认不渲染 | 打开浮层后再跑一次采集 |
| 字体族回退链 | computed style 只给第一个 | 从设计稿或代码补 |

### 公网可访问时

能用浏览器工具就直接用：打开页面 → 执行同样的采集脚本 → 拿 JSON + 截图。
不用再拜托同事手动跑，且能自动扫多个页面。

---

## 4. 采集质量自检

拿到 JSON 后先扫一眼：

- `meta.elementsScanned` 是否小于 `elementsTotal`（被截断了 → 加 `maxNodes`）
- `colors` 里第一条是不是页面底色（大概率是）
- `spacings` 里有没有大量 `1px` `2px`（有 → 可能是边框混入，看 props 过滤）
- `metrics` 里的关键尺寸是否合理（顶栏高 800px 说明选择器猜错了）

不对劲就重采，别硬着头皮往下走。
