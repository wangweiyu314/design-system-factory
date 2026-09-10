---
name: "{{PREFIX}}-design-system"
description: "{{SYSTEM}} 设计规范与前端交付能力。当用户要求生成、构建、修改、复刻或评审 {{SYSTEM}} 的网页、页面、UI 组件或前端界面，或询问其设计规范取值（颜色、字体、间距、圆角、阴影、Token、图标、组件规格、页面布局）时使用。"
agent_created: true
---

# {{SYSTEM}} 设计系统 — 交付能力入口

> **本 Skill 是入口，不是规范副本。**
> 规范正文唯一来源在 `SPEC_ROOT`（见下），任何取值都必须回源查询——本文件刻意不含任何规范数值。

## 0. 路径

```
SPEC_ROOT = {{SPEC_ROOT}}
NODE      = {{NODE}}
```

## 1. 两条铁律

1. **回源再动手**：任何数值先查 `foundation/tokens.md`，禁止凭记忆。
2. **模板起步**：`scripts/` 下有已验证模板，复制改造比手写更快也更不容易违规。

## 2. 一键生成

```bash
cd {{WORKDIR}}
$NODE {{PACKAGE}}/scripts/new-page.js --type=list --name=<页面名>
```

## 3. 交付前必跑

```bash
$NODE {{PACKAGE}}/scripts/check-tokens.js {{WORKDIR}} --strict
```

退出码必须为 0。

## 4. 文档路由

先读 `{{PACKAGE}}/SKILL.md` 定位唯一一个最相关子文档；`foundation/tokens.md` 与 `scripts/` 模板属公共资源，可附加读取。

---

初始化时间：{{DATE}}
