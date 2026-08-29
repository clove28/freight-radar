/**
 * 货运雷达 · 空驶/路线规划（P3+P4）
 *
 * 目标：用真实路线替换估算，让净收益、每公里收益、底线过滤
 * 全部自动使用真实值。
 *
 *  - MockRoutePlanner：城市距离估算（无外部依赖，可测试）
 *  - ApiRoutePlanner：接高德驾车路径规划（AMAP_KEY），返回真实距离/时长/过路费
 */

import type { RoutePlanner } from '../data/repository.js';
import { distBetween } from '../data/seed.js';
import { AmapClient } from '../data/amap.js';

/**
 * Mock 实现：城市间距离估算。
 * 同一城市空驶 0（货就在脚下），否则用 seed.distBetween 的稳定伪距离。
 */
export class MockRoutePlanner implements RoutePlanner {
  async estimateEmptyKm(currentCity: string, cargoFrom: string): Promise<number> {
    if (currentCity === cargoFrom) return 0;
    return distBetween(currentCity, cargoFrom);
  }
}

/**
 * 真实实现（P4）：接高德驾车路径规划。
 * 未配置 AMAP_KEY 时回退 Mock，保证演示不中断。
 */
export class ApiRoutePlanner implements RoutePlanner {
  private amap: AmapClient;

  constructor(apiKey?: string) {
    this.amap = new AmapClient({ apiKey: apiKey || process.env.AMAP_KEY });
  }

  /** 空驶里程：当前城市 → 装货城市（速度优先路径） */
  async estimateEmptyKm(currentCity: string, cargoFrom: string): Promise<number> {
    if (currentCity === cargoFrom) return 0;
    try {
      const plan = await this.amap.driving(currentCity, cargoFrom, 0);
      return plan.real ? plan.distanceKm : new MockRoutePlanner().estimateEmptyKm(currentCity, cargoFrom);
    } catch {
      return new MockRoutePlanner().estimateEmptyKm(currentCity, cargoFrom);
    }
  }
}

