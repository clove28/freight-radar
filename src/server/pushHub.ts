/**
 * 货运雷达 · WebSocket 实时推送（P7）
 *
 * 基于 ws 库的双向通道：
 *  - 客户端连上后订阅感兴趣的事件（默认全部）
 *  - 服务端扫描匹配货源（回程/常跑）推送 new-cargo
 *  - 客户端可发送 { type: 'subscribe', backhaulOnly: true } 过滤
 *
 * 与 SSE（/api/events）并存：WS 支持双向、可按司机过滤；
 * SSE 保持兼容（老客户端仍可用）。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { RepositorySet } from '../data/repository.js';

export interface CargoPushEvent {
  type: 'new-cargo';
  from: string;
  to: string;
  cargo: string;
  price: number;
  backhaul: boolean;
  routeMatch: boolean;
}

export class PushHub {
  private wss: WebSocketServer;
  private repos: RepositorySet;
  private timer: NodeJS.Timeout | null = null;
  /** 已推送的货源 id（去重） */
  private pushed = new Set<string>();

  constructor(server: Server, repos: RepositorySet) {
    this.repos = repos;
    this.wss = new WebSocketServer({ server, path: '/api/ws' });
    this.wss.on('connection', ws => {
      ws.send(JSON.stringify({ type: 'connected' }));
      ws.on('message', raw => this.onMessage(ws, raw));
    });
    this.timer = setInterval(() => this.scanAndPush(), 4000);
  }

  private onMessage(ws: WebSocket, raw: WebSocket.RawData): void {
    try {
      const msg = JSON.parse(raw.toString()) as { type?: string; [k: string]: unknown };
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      // 订阅过滤：每个连接独立状态
      if (msg.type === 'subscribe') {
        (ws as WebSocket & { subs?: Record<string, unknown> }).subs = { ...(msg as object) };
        ws.send(JSON.stringify({ type: 'subscribed' }));
      }
    } catch {
      /* 忽略非法消息 */
    }
  }

  private async scanAndPush(): Promise<void> {
    if (this.wss.clients.size === 0) return;
    try {
      const all = await this.repos.cargo.listAll();
      const vehicle = await this.repos.vehicle.get();
      for (const c of all) {
        if (this.pushed.has(c.id)) continue;
        if (c.status !== 'open') continue;
        const backhaul = vehicle.homeCities.includes(c.to);
        const routeMatch = vehicle.routes.some(r => r.from === c.from && r.to === c.to);
        if (!backhaul && !routeMatch) continue;
        this.pushed.add(c.id);
        const evt: CargoPushEvent = { type: 'new-cargo', from: c.from, to: c.to, cargo: c.cargo, price: c.price, backhaul, routeMatch };
        const text = JSON.stringify(evt);
        for (const client of this.wss.clients) {
          const subs = (client as WebSocket & { subs?: Record<string, unknown> }).subs;
          // 客户端可只订阅回程货
          if (subs?.backhaulOnly === true && !backhaul) continue;
          if (client.readyState === WebSocket.OPEN) client.send(text);
        }
      }
    } catch {
      /* 忽略扫描错误 */
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.wss.close();
  }
}
