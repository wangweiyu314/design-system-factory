# 规范核对门禁使用说明

> 把 `check-tokens.js --strict` 装进 git 的提交环节，
> 让 Design Token 双向对齐从「交付前记得手动跑一下」变成「不合规则不让提交」。
>
> 对应脚本：`design-specs/scripts/install-hooks.js`（v1.0）
> 校验器：`design-specs/scripts/check-tokens.js`

---

## 0. 三十秒速览

```bash
# 装一次（每个 clone 都要装一次）
node design-specs/scripts/install-hooks.js install

# 之后正常开发、正常提交就行，规范不达标会被拦下来
git commit -m "feat: 新增客户列表"

# 随时看门禁状态 + 现在提交会不会被拦
node design-specs/scripts/install-hooks.js status

# 不想要了
node design-specs/scripts/install-hooks.js uninstall
```

**关键心智**：门禁只做校验，不改你的代码。它通过就放行，不通过就 `exit 1` 把提交挡回去，
并打印出具体哪一行有问题——照着改完重新 `git commit` 即可。

---

## 1. 它做了什么

```
git commit
   └─► .git/hooks/pre-commit
         ├─ 1) 若设置 GF_SKIP_TOKEN_CHECK → 跳过
         ├─ 2) 若存在 pre-commit.local → 先链式执行（保护原有 hook）
         ├─ 3) 跑 check-tokens.js <规范包目录> --strict --quiet
         │       E1 硬编码色值
         │       E2 取值漂移（规范 → 交付物）
         │       E3 未定义引用（交付物 → 规范）
         │       W1 规范未收编（潜在双源漂移）
         └─ 4) 全部通过 → 允许提交；否则 → 阻止提交
```

三点要先知道：

1. **校验范围是「规范包内全部页面」，不是「本次改动的文件」。**
   所以你只改了一个页面，却可能因为别人之前留下的历史问题被拦。
   这不是 bug，是刻意设计——保证「仓库里任何一个提交点，整体都是干净的」。
   （想只查自己刚生成的文件，手工跑 `check-tokens.js <那个文件> --strict`。）

   **但范围止于规范包目录**（默认 `design-specs/`），不是整个仓库：
   仓库里常有不受本规范管辖的页面——介绍页、并存的其它子包、第三方 demo——
   它们自带独立色板，拿本包规范去判会误报 [W1] 未收编 / [E1] 硬编码，
   变成「别人的文件让你的提交被拦」。

2. **是「提交时」拦，不是「写代码时」拦。**
   随手保存不会有任何提示。若想在提交前先自查，用 `status`（§5.2）。

3. **默认 fail-open 的三处兜底**（找不到校验器 / 找不到 node / 显式跳过）：
   会打印一行提示后放行，不会把人卡死在无法提交的状态。
   代价是环境坏了门禁会静默失效——所以 §5.2 的 `status` 建议偶尔跑一次。

---

## 2. 前置条件

| 条件 | 检查命令 | 不满足怎么办 |
| :-- | :-- | :-- |
| 目录在 git 仓库里 | `git rev-parse --show-toplevel` | 见 §7「没有 git 仓库」 |
| 有 node | `node -v` | 装 Node；若 PATH 里没有，安装时会把当前解释器绝对路径写进 hook 兜底 |

> **git worktree / 子目录**：脚本用 `git rev-parse --git-path hooks` 定位 hooks 目录，
> worktree、子目录、`core.hooksPath` 自定义路径都能正确识别，不用 `cd` 到仓库根。

---

## 3. 三步上手

### 第 1 步：先确认当前规范是干净的

```bash
node design-specs/scripts/check-tokens.js design-specs --strict
```

退出码必须是 **0**。如果现在就不干净，装完门禁后第一次提交必然被拦——
先把存量问题清掉，避免「装了门禁 → 提交不了 → 怀疑门禁坏了」的体验。

### 第 2 步：安装

```bash
node design-specs/scripts/install-hooks.js install
```

看到 `===== 规范核对门禁安装完成 =====` 就成功了。输出里会告诉你：

```
仓库根目录　：/Users/.../gf-design-system
门禁文件　　：.git/hooks/pre-commit
校验范围　　：design-specs 下全部 HTML / MD，design-specs/scripts/check-tokens.js --strict
本次操作　　：新装门禁        ← 重复执行会显示「更新已有门禁」
```

重复执行是**幂等**的：已装就更新，不会叠加出两份校验逻辑。

### 第 3 步：验证生效

```bash
node design-specs/scripts/install-hooks.js status
```

末尾会明确告诉你 `✓ 当前可正常提交。` 或 `✗ 当前提交会被门禁拦截，请先修复。`。
想看真实拦截效果，可以临时在任意 HTML 里写个 `color: #FF0000` 再 `git commit`，
会看到 `[规范门禁] 未通过，已阻止本次提交。`

---

## 4. 日常使用：提交被拦了怎么办

被拦时终端长这样：

```
[规范门禁] 校验 Design Token 双向对齐（E1 硬编码 / E2 取值漂移 / E3 未定义引用 / W1 规范未收编）...
✗ E1 硬编码色值：demo-form.html:128  color: #FF0000

[规范门禁] 未通过，已阻止本次提交。
  修复上方列出的 Token 问题后重新 git commit。
  确需紧急绕过：git commit --no-verify（仅限紧急，事后必须补修）
```

按检查项对号入座：

| 报错 | 意思 | 怎么改 |
| :-- | :-- | :-- |
| **E1 硬编码色值** | 写了 `:#FF0000` 这类字面量 | 换成 Token；`tokens.md` 里没有的，先在 `tokens.md` 登记再回灌 `:root`（**先规范后模板**） |
| **E2 取值漂移** | 文件 `:root` 的值和 `tokens.md` 不一致 | 以 `tokens.md` 为准改文件；确实要改规范的，先改规范再全量回灌 |
| **E3 未定义引用** | 用 `var()` 引用了某个 Token，但本文件 `:root` 里没定义 | 把该 Token 补进文件 `:root`（值从 `tokens.md` 抄） |
| **W1 规范未收编** | 文件自己定义了新 Token，`tokens.md` 没登记 | 去 `tokens.md` 补一行；若是临时私有变量，考虑改用已有 Token |

改完直接重新 `git commit`，不用重新装门禁。

---

## 5. 三条命令详解

### 5.1 `install`

```bash
node design-specs/scripts/install-hooks.js install
```

- 生成 `.git/hooks/pre-commit`，内容用一对标记包起来：
  `# ===== BEGIN gf-design-spec pre-commit =====` … `# ===== END ... =====`
- 写入后跑 `sh -n` 语法自检，**语法有问题会删掉文件并回滚**，不会留个坏脚本把后续提交全卡死
- 自动 `chmod 755`
- 幂等：装过再装是「更新」

### 5.2 `status`（最常用）

```bash
node design-specs/scripts/install-hooks.js status
```

一次回答三个问题：装没装、仓库根在哪、现在提交会不会被拦。
**排查「门禁好像没生效」时先跑它。**

### 5.3 `uninstall` / `remove`

```bash
node design-specs/scripts/install-hooks.js uninstall
```

- 只移除自己注入的那段标记块，其余内容原样保留
- 若移除后没内容了，直接删除 `pre-commit` 文件
- 若原本就有别人的 hook，会还原成原文件

⚠️ **一个坑**：安装时备份出来的 `.git/hooks/pre-commit.local` 不会自动还原。
卸载后如果看到提示，按它给的命令手工搬回去：

```bash
mv .git/hooks/pre-commit.local .git/hooks/pre-commit
```

---

## 6. 紧急绕过

两种方式，效果相同（都只影响本次提交）：

```bash
# 方式一：跳过所有 pre-commit（含链式调用的 pre-commit.local）
git commit --no-verify -m "hotfix: 线上问题"

# 方式二：只跳过 Token 校验（其他 hook 照常跑，更推荐）
GF_SKIP_TOKEN_CHECK=1 git commit -m "hotfix: 线上问题"
```

**绕过不是免责**：门禁只拦提交、不拦绕过，而这恰恰是它唯一的软肋。建议两条纪律：

1. 绕过时 commit message 里带上原因（如 `hotfix(绕过规范门禁)`），便于事后检索
2. 事后补一条修复提交，把当时欠下的 Token 问题清掉——否则下次别人提交会被你的历史问题拦住（§1 第 1 条）

---

## 7. 没有 git 仓库怎么办

安装器要求必须在 git 仓库里，否则会直接给出引导并退出：

```
✗ 当前目录不在 git 仓库中，无法安装提交门禁。

  请先初始化仓库后再安装（数据无风险，只是建立一个本地仓库）：
    cd /Users/.../gf-design-system
    git init
    git add .
    node design-specs/scripts/install-hooks.js install

  若只是想先看看规范是否达标，直接跑：
    node design-specs/scripts/check-tokens.js design-specs --strict
```

**不上 git 也能用规范约束**，只是退化成手动检查：

```bash
node design-specs/scripts/check-tokens.js design-specs --strict
```

退出码 0 = 达标。把它当作「每次交付前的最后一步」即可，
只是约束靠自觉而不是靠工具——这正是门禁要解决的问题。

哪天决定上 git 了，补三步就能装上（上面的错误提示里原样给了）：

```bash
git init
git add .
node design-specs/scripts/install-hooks.js install
```

---

## 8. 与已有 pre-commit 共存

仓库里已经有 pre-commit（比如 husky、lint-staged、团队自己的脚本）时**不会覆盖**：

1. 原文件被剥离我们注入的块后，备份为 `.git/hooks/pre-commit.local`
2. 新 hook 中插入一段链式调用，**在 Token 校验之前**执行它
3. 原 hook 失败（`exit 非 0`）会中断提交，语义与原来一致

安装输出会明确提示：`原有 hook ：已备份为 pre-commit.local 并在校验前链式执行`。

> 若你原本用的是 husky（husky 管理的 hook 在 `.husky/` 下并把 `.git/hooks` 指过去），
> 建议优先用 husky 的方式加一条，而不是用本工具——两套机制混用容易互相覆盖。

---

## 9. 团队协作与 CI

**`.git/hooks/` 不受版本控制**，所以门禁不会随着 clone 自动分发，每个人都要装一次。
两个办法：

**办法 A（轻量）**：写进 `README` / 新人 onboarding 清单，克隆后执行一次

```bash
node design-specs/scripts/install-hooks.js install
```

**办法 B（强制）**：把 hooks 目录纳入版本控制，全员共享

```bash
git config core.hooksPath .githooks
mkdir -p .githooks
node design-specs/scripts/install-hooks.js install   # 会写进 .githooks/
git add .githooks && git commit -m "chore: 共享 git hooks"
```

新成员克隆后只需 `git config core.hooksPath .githooks` 一次。

**CI 上加一道**（推荐，能兜住 `--no-verify`）：

```yaml
- run: node design-specs/scripts/check-tokens.js design-specs --strict --quiet
```

`--quiet` 会压掉 I1「规范未落地」的信息列表，让 CI 日志只留真正的错误项。

---

## 10. 常见问题

**Q：装完了但提交没有任何输出，是不是没生效？**
先跑 `status`。若显示未安装，检查是不是在别的目录装的 / 用错了仓库。
若显示已安装却没输出，确认 hook 有执行权限：

```bash
ls -l .git/hooks/pre-commit     # 应当是 -rwxr-xr-x
```

**Q：换了个 node（nvm 切版本 / 卸载重装）后门禁报「未找到 node」？**
安装时记录的兜底解释器路径失效了。重新跑一次 `install` 即可刷新。

**Q：把 `design-specs/` 挪位置后门禁失效？**
hook 里写的是安装时算出的相对路径。挪完重新 `install`。
（校验器找不到时会打印提示并放行，不会报错——所以表现为「门禁悄悄不生效」。）

**Q：只想校验我刚生成的那个文件？**
不装门禁，直接跑：

```bash
node design-specs/scripts/check-tokens.js design-specs/examples/demo-form.html --strict
```

**Q：pre-commit.local 是什么，能删吗？**
是安装门禁前的原始 hook 备份。确认当前 `pre-commit` 内容正确后可以删；
但卸载门禁后想完全还原，需要它。建议先留着。

**Q：门禁会改我的代码吗？**
不会。只读取、只校验，唯一的「动作」是决定放行还是拦下。

---

## 11. 速查卡

```bash
# 安装 / 更新（幂等）
node design-specs/scripts/install-hooks.js install

# 看状态 + 现在能否提交
node design-specs/scripts/install-hooks.js status

# 卸载（保留原有 hook）
node design-specs/scripts/install-hooks.js uninstall

# 单独跑一次校验（不依赖 git）
node design-specs/scripts/check-tokens.js design-specs --strict

# CI 用（只输出错误项）
node design-specs/scripts/check-tokens.js design-specs --strict --quiet

# 紧急绕过
git commit --no-verify
GF_SKIP_TOKEN_CHECK=1 git commit
```

退出码：**0 = 通过 / 操作成功，1 = 被拦截或安装失败。**
