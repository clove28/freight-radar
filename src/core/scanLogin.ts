/**
 * 货运雷达 · 扫码登录（P9）
 *
 * 流程（模拟微信扫码，架构预留真实微信开放平台接入）：
 *   1. 客户端请求 /api/auth/scan/create → 服务端建扫码会话（qrId，状态 pending）
 *   2. 客户端展示二维码（qrId 编码），并轮询 /api/auth/scan/status?qrId=
 *   3. 手机端"确认登录"（演示环境前端一键模拟；真实版由微信扫码回调触发）
 *      → 服务端把 qrId 绑定到司机并生成登录 token
 *   4. 客户端轮询到 approved → 拿到 token → 登录完成
 *
 * 状态机：pending（待扫）→ approved（已确认）→ expired（超时 120s）
 */

/** 扫码会话状态 */
export type ScanStatus = 'pending' | 'approved' | 'expired';

/** 扫码会话（存 SQLite scan_sessions 表） */
export interface ScanSession {
  qrId: string;
  status: ScanStatus;
  /** 创建时间戳 */
  createdAt: number;
  /** 过期时间戳（默认 120 秒） */
  expiresAt: number;
  /** 确认后绑定的司机 id */
  driverId: string | null;
  /** 确认后生成的登录 token（轮询到 approved 时返回给客户端） */
  token: string | null;
}

/** 扫码会话有效期（毫秒）：2 分钟 */
export const SCAN_TTL = 120 * 1000;

/** 生成 qrId（随机 32 位 hex） */
export function genQrId(): string {
  // 纯函数实现便于测试；运行时由调用方注入随机源
  const arr = new Uint8Array(16);
  for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** 创建扫码会话（纯函数） */
export function createScanSession(qrId: string, now = Date.now()): ScanSession {
  return {
    qrId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + SCAN_TTL,
    driverId: null,
    token: null,
  };
}

/** 确认登录：绑定司机并生成 token（纯函数，token 由调用方生成） */
export function approveScan(session: ScanSession, driverId: string, token: string, now = Date.now()): ScanSession {
  if (now > session.expiresAt) {
    session.status = 'expired';
    return session;
  }
  session.status = 'approved';
  session.driverId = driverId;
  session.token = token;
  return session;
}

/** 检查会话状态（过期则标记 expired，纯函数） */
export function refreshScanStatus(session: ScanSession, now = Date.now()): ScanSession {
  if (session.status === 'pending' && now > session.expiresAt) {
    session.status = 'expired';
  }
  return session;
}

/** 状态文案 */
export const SCAN_STATUS_LABEL: Record<ScanStatus, string> = {
  pending: '等待扫码确认',
  approved: '扫码成功，登录中…',
  expired: '二维码已过期，请刷新',
};
