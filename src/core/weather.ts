/**
 * 货运雷达 · 天气对驾驶/油耗的影响规则（P4）
 *
 * 确定性规则（非 LLM 判断），输入天气现象与温度，输出：
 *  - 油耗修正系数（>1 表示更费油）
 *  - 胎压建议（温度每降 10℃ 胎压约降 0.1bar，需补气；高温防爆建议降压）
 *  - 行车建议文案
 *
 * 参考行业常识：
 *  - 雨/雪/雾：路面湿滑需降速，油耗 +5%~+12%
 *  - 低温（<10℃）：冷启动+空气密度大，油耗 +3%~+8%；胎压降低需补气
 *  - 高温（>32℃）：开空调 +5%，胎压升高需降压防爆
 *  - 大风（≥6级）：风阻大，油耗 +4%~+8%
 *  - 天然气车：低温气化率降低，气耗 +5% 左右（与油耗同规则估算）
 */

export interface WeatherImpact {
  /** 油耗修正系数（1.0=正常） */
  fuelFactor: number;
  /** 胎压建议（相对标准胎压的调整，bar；正=补气，负=放气） */
  tireAdjustBar: number;
  /** 简短建议文案 */
  advice: string;
  /** 是否需要降速（雨雪雾/大风） */
  slowDown: boolean;
}

/** 根据天气现象与温度计算影响（纯函数，可测） */
export function weatherImpact(weather: string, temp: number, windScale: string): WeatherImpact {
  let fuelFactor = 1.0;
  let tireAdjustBar = 0;
  let slowDown = false;
  const notes: string[] = [];

  const w = weather ?? '';
  const wind = Number(windScale) || 0;

  // 雨雪雾
  if (/雨/.test(w) && !/晴/.test(w)) {
    fuelFactor += 0.06;
    slowDown = true;
    notes.push('雨天路滑，建议降速 10%，油耗约 +6%');
  }
  if (/雪/.test(w)) {
    fuelFactor += 0.12;
    slowDown = true;
    notes.push('雪天路面湿滑，务必降速，油耗约 +12%');
  }
  if (/雾/.test(w)) {
    fuelFactor += 0.05;
    slowDown = true;
    notes.push('有雾能见度低，减速慢行，油耗约 +5%');
  }

  // 低温：油耗增加 + 胎压下降需补气
  if (temp < 10) {
    fuelFactor += 0.04;
    tireAdjustBar += 0.1; // 每降 10℃ 胎压约降 0.1bar，需补气
    notes.push(`低温 ${temp}℃，冷启动费油，油耗约 +4%；胎压下降约 0.1bar，建议补气`);
  }
  if (temp < 0) {
    fuelFactor += 0.04;
    tireAdjustBar += 0.1;
    notes.push(`严寒 ${temp}℃，气耗/油耗进一步上升约 +4%`);
  }

  // 高温：开空调 + 胎压升高防爆
  if (temp > 32) {
    fuelFactor += 0.05;
    tireAdjustBar -= 0.1; // 高温胎压升高，建议放气降压防爆
    notes.push(`高温 ${temp}℃，开空调油耗约 +5%；胎压升高，建议降压 0.1bar 防爆`);
  }

  // 大风
  if (wind >= 6) {
    fuelFactor += 0.05;
    slowDown = true;
    notes.push(`大风 ${wind} 级，风阻大，油耗约 +5%，高栏注意捆扎`);
  }

  return {
    fuelFactor: Math.round(fuelFactor * 100) / 100,
    tireAdjustBar: Math.round(tireAdjustBar * 10) / 10,
    slowDown,
    advice: notes.length ? notes.join('；') : '天气正常，按标准油耗与胎压行驶',
  };
}

/** 天然气车气耗修正（与油耗同规则；低温气化损失略高） */
export function gasFuelFactor(impact: WeatherImpact, isGas: boolean): number {
  if (!isGas) return impact.fuelFactor;
  // 天然气低温气化率下降，额外 +2%
  return Math.round((impact.fuelFactor + 0.02) * 100) / 100;
}
