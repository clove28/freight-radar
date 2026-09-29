# Phase 5：数据模型

> 结论先行：**现有模型是"单司机工具"视角，V2 需要"多角色平台"视角**。现有模型大多可复用为子结构，需新增角色/可信度/服务费/执行/安全五类模型。只给设计建议，不建代码。

## 一、13 个模型的现状与建议

### User（新）
- 现状：❌ 无（auth 只存账号密码/token，无用户档案）。
- 建议：`{ id, phone, role: driver|shipper|ops|customer, name, status, createdAt }`。角色声明进 token。

### Driver（新）
- 现状：🟡 半有（多司机切换 /api/drivers 只存简单档案）。
- 建议：`{ userId, name, idCard(脱敏), licenseType, yearsExperience, creditScore, safetyContact, emergencyContacts[] }`。**从 Vehicle 中拆出"人"与"车"**。

### Vehicle（复用 + 扩展）
- 现状：🟢 已有（plate/truck/maxLoad/fuelPer100km/fuelPrice/tollPerKm/otherCostPerTrip/currentCity/homeCities/routes）。
- 建议：保留全部成本字段；增加 `{ ownerDriverId, verifyStatus(行驶证审核), dimension }`。成本引擎依赖它，字段名勿改。

### Cargo（复用 + 扩展）
- 现状：🟢 已有（id/from/to/km/cargo/cls/wt/truck/price/pickup/owner/phone/verified/pub/status）。
- 建议：扩展 `{ publisherRole(货主|物流公司|中介), loadAddress, unloadAddress, contactName, loadEntrance(入口), parkingArea, loadNotes, verifyState(待审核/已确认/已驳回), credibility(可信度分), updatedAt }`。**现有字段全部保留**，与真实平台 API 对齐的目标不变。

### CargoVerification（新）
- 现状：❌ 无（只有 verified 布尔）。
- 建议：`{ id, cargoId, opsId, method(电话/平台消息), result(confirmed|rejected|pending), notes, verifiedAt }`。**运营审核留痕 = 可信度证据**。

### CargoFeedback（新）
- 现状：🟡 半有（credit.ts 只有 👍/😐/👎 三档 + 标签，无结构化运输反馈）。
- 建议：在信用评价之外增加结构化卡友反馈：`{ id, cargoId/ownerId, driverId, loadWaitHours(装货等待时长), loadDifficulty, unloadDifficulty, entranceTips, parkingTips, tags[], comment }`。与 Credit 并列，分别回答"货主靠不靠谱"和"这趟货好不好装"。

### Order（复用 + 扩展）
- 现状：🟢 已有（loadId/from/to/cargo/cls/wt/truck/price/km/owner/status/steps/loss）。
- 建议：**保留现有字段与 8 步**，扩展 `{ driverId, serviceFeeId, shipperContact(运营确认后的联系人), routePlanId, actualCost, actualIncome, feedback, settlementState }`。Order 从"订单"升级为"运输任务"的载体，但**不重写**，只加字段与新状态。

### OrderEvidence（新）
- 现状：🟡 半有（8 步 OrderStep 的 done 布尔 + 证据包文本，但无独立证据实体）。
- 建议：把证据从"步骤布尔"升级为独立实体：`{ id, orderId, stepId, type(photo|signature|gps|call_record|receipt), fileRef, gps, takenAt, uploadedBy }`。现有 steps 保留作为"流程进度"视图，证据实体支撑"平台服务保障"。

### DriverPreference（复用 + 扩展）
- 现状：🟢 已有（minPerKm/minNetIncome/maxKm/preferredStrategy）。
- 建议：扩展 `{ safetyContacts, restIntervalHours(强制休息间隔), foodPrefs(车上食品清单，供补给规划), networkReminderEnabled }`。

### TransportTask（新）
- 现状：❌ 无。
- 建议：运输执行任务的计划与状态：`{ id, orderId, plan: { departAt, loadAt, restStops[], refuelStops[], mealStops[], arriveAt }, currentStage, safetyCheckState }`。**与 Order 分离**——Order 管"交易与证据"，TransportTask 管"执行与提醒"。

### ServiceFee（新）
- 现状：❌ 无任何支付/服务费代码。
- 建议：`{ id, orderId, driverId, amount(约 200), currency: 'credit'|'real', state(unpaid|paid|consumed|refunded), paidAt }`。MVP 用虚拟服务额度：`DriverCreditBalance { driverId, balance }`。**明确约束：不可提现、不可转账、不可兑换现金**（防止变成虚拟货币）。

### OperationRecord（新）
- 现状：❌ 无。
- 建议：运营留痕：`{ id, opsId, targetType(cargo|order|feedback|user), targetId, action, before, after, at }`。所有运营写操作强制写此表（审计/防纠纷）。

### SafetyEvent（新）
- 现状：❌ 无。
- 建议：`{ id, driverId, orderId, type(no_response_reminder|escalation|manual_sos), state, createdAt, resolvedAt, escalationContact }`。只做"确认/升级"流程，不做健康监测。

## 二、复用度总结

| 模型 | 复用度 | 动作 |
|---|---|---|
| Vehicle / Cargo / Order / DriverPreference / Credit | 高 | 复用 + 加字段 |
| OrderEvidence / CargoFeedback | 中 | 在现有步骤/信用基础上拆出新实体 |
| User / Driver / CargoVerification / TransportTask / ServiceFee / OperationRecord / SafetyEvent | 无 | 全新设计 |
