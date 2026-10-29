## 主题

<!-- 一句话：这个 PR 解决了什么 / 对应哪个 US/UAT/P 阶段 -->

## 变更

- 
- 

## 验收门（全部勾选才能合并）

- [ ] `npx tsc --noEmit`
- [ ] `npm test`（全绿；新增测试文件已登记 README「八、测试」）
- [ ] `npm run build`
- [ ] `npm run test:sqlite`（改了 `sqliteRepository.ts` / 鉴权时）
- [ ] `cd web && npm run build`（改了前端时）

## 文档与数据

- [ ] 新增文档已登记 `docs/README.md`
- [ ] 验收标准 / HANDOFF 已更新（如有状态变化）
- [ ] README 的测试文件数 / API 表与实际一致
- [ ] 没有密钥、`.env`、个人数据进入 diff

## 风险与回滚

<!-- 影响面（金额/评分/排序？数据迁移？）；出问题怎么回滚 -->

## 证据

<!-- 命令输出摘要、截图、curl 结果、远端哈希 -->
