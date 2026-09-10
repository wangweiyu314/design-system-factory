#!/usr/bin/env node
/**
 * 规范核对门禁安装器  v1.1
 * ------------------------------------------------------------
 * 把 check-tokens.js --strict 装进 git 的提交环节：
 * 「交付前手动检查」→「不合规则不让提交」，让约束真正生效而不是靠自觉。
 *
 * 用法：
 *   node design-specs/scripts/install-hooks.js install     安装 pre-commit（默认，幂等）
 *   node design-specs/scripts/install-hooks.js uninstall   卸载，保留你原有的 hook
 *   node design-specs/scripts/install-hooks.js status      查看当前仓库门禁状态
 *
 * 行为约定：
 *   - 只校验，不改代码；失败则 exit 1 阻止提交
 *   - 全库扫描（与文档里的验收命令一致），保证「提交后仓库整体是干净的」
 *   - 紧急绕过：git commit --no-verify，或 GF_SKIP_TOKEN_CHECK=1 git commit
 *   - 仓库里已有别人的 pre-commit 不会被覆盖，改名为 pre-commit.local 并链式调用
 *
 * v1.1 修复：
 *   - 链式调用失效：ROOT 在引用之后才赋值，导致 `-x` 判断永远为假、原有 hook 静默不执行
 *   - uninstall 只删不还原：原 hook 留在 pre-commit.local 里，现已自动还原
 *
 * 退出码：0 成功；1 安装/卸载失败或当前不是 git 仓库
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CMD = (process.argv[2] || 'install').toLowerCase();
if (!['install', 'uninstall', 'remove', 'status'].includes(CMD)) {
  console.error('✗ 未知命令：' + CMD + '。可选：install / uninstall / status');
  process.exit(1);
}
const SCRIPTS_DIR = __dirname;

const BEGIN = '# ===== BEGIN gf-design-spec pre-commit =====';
const END = '# ===== END gf-design-spec pre-commit =====';

/* ---------- 定位 git 仓库 ---------- */
function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

const gitRootRes = git(['rev-parse', '--show-toplevel']);
if (gitRootRes.status !== 0) {
  console.error('✗ 当前目录不在 git 仓库中，无法安装提交门禁。\n');
  console.error('  请先初始化仓库后再安装（数据无风险，只是建立一个本地仓库）：');
  console.error('    cd ' + process.cwd());
  console.error('    git init');
  console.error('    git add .');
  console.error('    node design-specs/scripts/install-hooks.js install\n');
  console.error('  若只是想先看看规范是否达标，直接跑：');
  console.error('    node design-specs/scripts/check-tokens.js design-specs --strict');
  process.exit(1);
}
const REPO_ROOT = gitRootRes.stdout.trim();

/* --git-path 能正确处理 worktree / 子目录 场景 */
const hooksDirRes = git(['rev-parse', '--git-path', 'hooks']);
const HOOKS_DIR = path.resolve(REPO_ROOT, hooksDirRes.status === 0 ? hooksDirRes.stdout.trim() : '.git/hooks');
const HOOK_PATH = path.join(HOOKS_DIR, 'pre-commit');
const LOCAL_HOOK = path.join(HOOKS_DIR, 'pre-commit.local');

/* 脚本相对仓库根的路径（支持 design-specs 被放到子目录里） */
const SPEC_REL = path.relative(REPO_ROOT, SCRIPTS_DIR).split(path.sep).join('/');
/* 校验范围 = 规范包根目录（scripts 的上一级），而不是整个仓库。
 * 仓库里常有不受本规范管辖的页面（介绍页、其它子包），拿本包规范去判它们
 * 会误报 [W1] 未收编 / [E1] 硬编码，把「别人的文件」变成「你的提交被拦」。 */
const SPEC_PKG_REL = path.posix.dirname(SPEC_REL);
const SPEC_PKG_ABS = path.resolve(REPO_ROOT, SPEC_PKG_REL);

/* node 兜底：PATH 里没有 node 时用安装时的解释器 */
const NODE_FALLBACK = process.execPath;

/* ---------- hook 内容 ---------- */
function hookBody() {
  return `#!/bin/sh
${BEGIN}
# 由 ${SPEC_REL}/install-hooks.js 生成，请勿手工编辑；重新执行 install 可覆盖。
# 作用：提交前跑 Design Token 双向对齐校验，不合规则阻止提交。

ROOT=$(git rev-parse --show-toplevel)

if [ -n "$GF_SKIP_TOKEN_CHECK" ]; then
  echo "[规范门禁] 检测到 GF_SKIP_TOKEN_CHECK，跳过 Token 校验"
  exit 0
fi

CHECKER="$ROOT/${SPEC_REL}/check-tokens.js"

if [ ! -f "$CHECKER" ]; then
  echo "[规范门禁] 未找到校验器 $CHECKER，跳过（请确认规范包未被移动）"
  exit 0
fi

if command -v node >/dev/null 2>&1; then
  NODE=node
elif [ -x "${NODE_FALLBACK}" ]; then
  NODE="${NODE_FALLBACK}"
else
  echo "[规范门禁] 未找到 node，跳过校验（建议安装 Node 后重新 install）"
  exit 0
fi

echo "[规范门禁] 校验 Design Token 双向对齐（E1 硬编码 / E2 取值漂移 / E3 未定义引用 / W1 规范未收编）..."
if "$NODE" "$CHECKER" "$ROOT/${SPEC_PKG_REL}" --strict --quiet; then
  echo "[规范门禁] 通过，允许提交。"
else
  echo ""
  echo "[规范门禁] 未通过，已阻止本次提交。"
  echo "  修复上方列出的 Token 问题后重新 git commit。"
  echo "  确需紧急绕过：git commit --no-verify（仅限紧急，事后必须补修）"
  exit 1
fi
${END}
`;
}

/** 去掉我们注入的块，返回剩余内容 */
function stripOurBlock(content) {
  const b = content.indexOf(BEGIN);
  const e = content.indexOf(END);
  if (b < 0 || e < 0) return content;
  return (content.slice(0, b) + content.slice(e + END.length)).replace(/\n{3,}/g, '\n\n');
}

/* ---------- install ---------- */
function install() {
  if (!fs.existsSync(HOOKS_DIR)) fs.mkdirSync(HOOKS_DIR, { recursive: true });

  let existing = fs.existsSync(HOOK_PATH) ? fs.readFileSync(HOOK_PATH, 'utf8') : '';
  const hadOurs = existing.includes(BEGIN);
  let foreign = stripOurBlock(existing).replace(/^#!\/bin\/sh\s*/, '').trim();

  /* 已有别人的 hook：先改名存档，装好后链式调用，绝不静默丢弃 */
  let chained = false;
  if (foreign && !/^#\s*由\s/.test(foreign)) {
    fs.writeFileSync(LOCAL_HOOK, foreign.startsWith('#!') ? foreign : '#!/bin/sh\n' + foreign);
    try { fs.chmodSync(LOCAL_HOOK, 0o755); } catch (e) { /* 忽略权限失败 */ }
    chained = true;
  }

  let body = hookBody();
  if (chained) {
    body = body.replace(/\nif \[ -n "\$GF_SKIP_TOKEN_CHECK" \]; then/,
      `\n# 链式调用安装前已存在的 hook（原文件已备份为 pre-commit.local）\nif [ -x "$ROOT/${path.relative(REPO_ROOT, LOCAL_HOOK).split(path.sep).join('/')}" ]; then\n  "$ROOT/${path.relative(REPO_ROOT, LOCAL_HOOK).split(path.sep).join('/')}" || exit 1\nfi\n\nif [ -n "$GF_SKIP_TOKEN_CHECK" ]; then`);
  }

  fs.writeFileSync(HOOK_PATH, body);
  try { fs.chmodSync(HOOK_PATH, 0o755); } catch (e) {
    console.error('✗ 无法给 hook 加可执行权限：' + HOOK_PATH);
    process.exit(1);
  }

  /* 语法自检：避免写了个坏脚本把后续提交全卡死 */
  const sh = spawnSync('sh', ['-n', HOOK_PATH], { encoding: 'utf8' });
  if (sh.status !== 0) {
    console.error('✗ 生成的 hook 语法有问题，已回滚：\n' + (sh.stderr || ''));
    fs.unlinkSync(HOOK_PATH);
    process.exit(1);
  }

  console.log('===== 规范核对门禁安装完成 =====\n');
  console.log('仓库根目录　：' + REPO_ROOT);
  console.log('门禁文件　　：' + path.relative(process.cwd(), HOOK_PATH));
  console.log('校验范围　　：' + SPEC_PKG_REL + ' 下全部 HTML / MD（不含仓库内其它无关页面），' + path.relative(REPO_ROOT, path.join(SCRIPTS_DIR, 'check-tokens.js')) + ' --strict');
  console.log('本次操作　　：' + (hadOurs ? '更新已有门禁' : '新装门禁'));
  if (chained) console.log('原有 hook　 ：已备份为 pre-commit.local 并在校验前链式执行');
  console.log('\n紧急绕过　　：git commit --no-verify　或　GF_SKIP_TOKEN_CHECK=1 git commit');
}

/* ---------- uninstall ---------- */
function uninstall() {
  if (!fs.existsSync(HOOK_PATH)) {
    console.log('· 未安装门禁，无需卸载');
    return;
  }
  const content = fs.readFileSync(HOOK_PATH, 'utf8');
  if (!content.includes(BEGIN)) {
    console.log('· 现有 pre-commit 不是本工具安装的，未做任何改动');
    return;
  }
  const rest = stripOurBlock(content).replace(/^#!\/bin\/sh\s*/, '').trim();
  if (rest && !/^#\s*由\s/.test(rest)) {
    fs.writeFileSync(HOOK_PATH, rest.startsWith('#!') ? rest : '#!/bin/sh\n' + rest + '\n');
    console.log('===== 已移除门禁，恢复原 pre-commit =====');
  } else if (fs.existsSync(LOCAL_HOOK)) {
    /* 安装时被我们备份的原始 hook：直接还原，别让用户再手工 mv 一次 */
    fs.renameSync(LOCAL_HOOK, HOOK_PATH);
    try { fs.chmodSync(HOOK_PATH, 0o755); } catch (e) { /* 忽略权限失败 */ }
    console.log('===== 已移除门禁，已还原你原有的 pre-commit =====');
  } else {
    fs.unlinkSync(HOOK_PATH);
    console.log('===== 已移除门禁 =====');
  }
  if (fs.existsSync(LOCAL_HOOK)) {
    console.log('提示：检测到 pre-commit.local 备份，如需恢复请手工执行：');
    console.log('  mv ' + path.relative(process.cwd(), LOCAL_HOOK) + ' ' + path.relative(process.cwd(), HOOK_PATH));
  }
}

/* ---------- status ---------- */
function status() {
  const installed = fs.existsSync(HOOK_PATH) && fs.readFileSync(HOOK_PATH, 'utf8').includes(BEGIN);
  console.log('===== 规范核对门禁状态 =====\n');
  console.log('仓库根目录　：' + REPO_ROOT);
  console.log('门禁文件　　：' + path.relative(process.cwd(), HOOK_PATH));
  console.log('安装状态　　：' + (installed ? '已安装' : '未安装'));
  if (fs.existsSync(LOCAL_HOOK)) {
    console.log('本地备份　　：pre-commit.local（安装前的原 hook）');
  }
  if (!installed) {
    console.log('\n安装命令　　：node design-specs/scripts/install-hooks.js install');
    return;
  }

  /* 顺手跑一次，让人立刻知道「现在提交会不会被拦」 */
  console.log('\n---- 当前规范达标情况 ----');
  const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, 'check-tokens.js'), SPEC_PKG_ABS, '--strict', '--quiet'], { encoding: 'utf8' });
  const lines = (res.stdout || '').split('\n')
    .filter((l) => /硬编码|取值漂移|未定义引用|规范未收编|全部通过|结果/.test(l));
  console.log(lines.join('\n') || (res.stderr || '').trim());
  console.log('\n' + (res.status === 0 ? '✓ 当前可正常提交。' : '✗ 当前提交会被门禁拦截，请先修复。'));
}

/* ---------- 分发 ---------- */
if (CMD === 'install') install();
else if (CMD === 'uninstall' || CMD === 'remove') uninstall();
else status();
