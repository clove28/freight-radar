# 分支、提交与发布规范

> 详细背景见 [AGENTS.md](../AGENTS.md) §3；本文件是操作手册。

## 1. 分支模型（单人项目也保留痕迹）

- `main`：唯一 SSOT，始终可运行、可演示；Gitee 主推，GitHub 只读镜像。
- 需要开分支的情况：**>1 文件**、改成本/评分/排序语义、实现一个 P 阶段子项。
- 命名：`feat/<主题>`、`fix/<主题>`、`docs/<主题>`、`test/<主题>`（小写短横线，例如 `feat/p17-real-cargo`）。
- 小修（单行常量、错别字、文档）可直接提交 `main`。

## 2. 流程

```bash
git switch -c feat/<主题>
# 改代码 + 补测试 + 更新文档
npx tsc --noEmit && npm test && npm run build   # 前端改动再 cd web && npm run build
npm run test:sqlite                              # 改 sqlite/auth 时
git commit -m "feat: ..."
git push gitee <分支名>
# 自审：按 .github/pull_request_template.md 勾选，然后合并
git switch main
git merge --squash <分支名> && git commit         # 保持 main 线性
git push gitee main && git push origin main       # 两个远端都要推
```

- 合并时保留**结论明确的提交信息**（为什么改、影响面、补了什么测试）。
- 阶段收尾打 tag（见 §4），tag 前必须三道门 + CI 绿。
- 不往 GitHub 直接提交：它是镜像，只接受 `main` 的 force 同步（见 [pitfalls.md](pitfalls.md)）。

## 3. 提交信息

- 前缀：`feat:` / `fix:` / `refactor:` / `test:` / `docs:` / `build:` / `chore:`
- 单主题；正文写清「改了什么 / 为什么安全 / 补了什么测试」。
- 提交前：`git status` 无意外文件；工作区没有别人未提交的半成品。

## 4. 版本与发布

- `main` 每个阶段收尾打 annotated tag：`v0.x.0`（阶段）、`v0.x.y`（修复）。
- tag 命名与 `package.json` version 尽量对齐；`README`/验收记录引用 tag 或 commit。
- 发布（公网演示）前走 [验收标准](验收标准.md) §6 上线门；发布后核对：
  - `git ls-remote --heads gitee main` = `git rev-parse HEAD`
  - `git ls-remote --heads origin main` = 同一哈希
  - GitHub Actions（`.github/workflows/ci.yml`）为绿。

## 5. 回滚

- 代码问题：`git revert <commit>`（优先）或回到上一个 tag 重新部署。
- 数据：`data/`（SQLite/JSON）不进 git；升级前备份，回滚时恢复对应数据目录。
- 不发 force push 到 `main`；需要重写历史时先建 `backup/*` 分支留证。
