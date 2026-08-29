/**
 * 货运雷达 · 规则版 LLM 实现（阶段一）
 *
 * 不调用任何外部 API，用规则解析中文自然语言与生成解释，
 * 保证：
 *  - 开发环境零配置可跑；
 *  - 单元测试完全确定；
 *  - 接口与真实 LLM 实现完全一致，后续替换不影响业务层。
 *
 * 解析规则覆盖常见说法：
 *  "从 X 到 Y" / "去 X" / "回临汾" / "拉黄豆粕" / "13米" / "只看回程"
 *  "500公里以内" / "每公里不低于3块" / "给我5条"
 */
import type { DriverQuery, Recommendation, ScoredCargo, Vehicle } from '../core/types.js';
import type { LlmPort } from './llm.js';
import { BASE_CITIES } from '../data/seed.js';

const CITY_HINTS = [
  '临汾', '太原', '大同', '运城', '晋城', '长治', '侯马', '襄汾',
  '石家庄', '北京', '天津', '郑州', '西安', '济南', '青岛', '临沂',
  '合肥', '南京', '苏州', '上海', '杭州', '宁波', '武汉', '长沙',
  '南昌', '广州', '深圳', '佛山', '东莞', '成都', '重庆', '贵阳',
  '昆明', '南宁', '沈阳', '大连', '长春', '哈尔滨', '兰州', '西宁',
  '乌鲁木齐', '福州', '厦门', '泉州',
];

const CARGO_HINTS = [
  '黄豆粕', '饲料', '粮食', '玉米', '蔬菜', '水果', '冷冻', '冷藏',
  '百货', '纸品', '塑料', '纺织', '五金', '家电', '钢材', '瓷砖',
  '水泥', '木材', '机械', '汽配', '化工', '快递',
];

export class RuleBasedLlm implements LlmPort {
  /** AI 引擎标识（前端展示） */
  readonly engine = 'rule';

  async parseRequest(text: string): Promise<{ query: DriverQuery; raw: string }> {
    const query: DriverQuery = {};
    const raw: string[] = [];

    // 1. 回程："回临汾/回家/回程" → 目的地 + 回程标记
    //    注意"回"必须在城市名前，避免与"从X回Y"混淆（从X回Y会在城市解析中处理）
    const backHome = text.match(/回(临汾|太原|运城|大同|晋城|长治|侯马|襄汾)/);
    if (backHome && backHome[1]) {
      query.to = backHome[1];
      query.backhaulOnly = true;
      raw.push(`回${backHome[1]}（回程）`);
    } else if (/回程|回家|朝家|往家/.test(text)) {
      query.backhaulOnly = true;
      raw.push('只看回程');
    }

    // 2. 城市："从X到Y" / "从X回Y"（X/Y 取城市池中的城市）
    //    "回Y"时若 Y 是回程基地城市则同时标记回程（在下方判断）
    const fromTo = text.match(/从(.+?)(?:到|回)([\u4e00-\u9fa5]{2,4})/);
    const fromSeg = fromTo ? fromTo[1] : undefined;
    const toSeg = fromTo ? fromTo[2] : undefined;
    const fromCity = fromSeg ? CITY_HINTS.find(c => fromSeg.includes(c)) : undefined;
    const toCity = toSeg ? CITY_HINTS.find(c => toSeg.includes(c)) : undefined;
    if (fromCity && toCity) {
      query.from = fromCity;
      query.to = toCity;
      raw.push(`从${fromCity}到${toCity}`);
      // "从X回Y"且 Y 是回程基地城市 → 标记回程方向
      if (fromTo && fromTo[0].includes('回') && BASE_CITIES.includes(toCity)) {
        query.backhaulOnly = true;
        raw.push('回程方向');
      }
    } else if (!query.to) {
      // 单城市目的地："去广州"/"到成都"
      const m = text.match(/(?:到|去)([\u4e00-\u9fa5]{2,4})/);
      const seg = m ? m[1] : undefined;
      if (seg) {
        const c = CITY_HINTS.find(x => seg.includes(x));
        if (c) {
          query.to = c;
          raw.push(`目的地${c}`);
        }
      }
    }

    // 3. 货物
    for (const c of CARGO_HINTS) {
      if (text.includes(c)) {
        query.cargo = c;
        raw.push(`拉${c}`);
        break;
      }
    }

    // 4. 车型（具体型号优先，避免"13米高栏"被"13米"先匹配）
    const truck = text.match(/(13米高栏|13米平板|17\.5米平板|9\.6米|6\.8米|4\.2米|厢式车|半挂)/);
    if (truck) {
      query.truck = truck[1];
      raw.push(`车型${truck[1]}`);
    }

    // 5. 最大运距
    const km = text.match(/(\d{2,4})公里(以内|之内|内)?/);
    if (km) {
      query.maxKm = Number(km[1]);
      raw.push(`≤${km[1]}公里`);
    }

    // 6. 每公里净收益下限（支持"3块"/"3元"）
    const per = text.match(/每公里(?:不低于|至少|不低|要)(\d+(?:\.\d+)?)(?:块|元)/);
    if (per) {
      query.minPerKm = Number(per[1]);
      raw.push(`每公里净收益≥${per[1]}元`);
    }

    // 7. topN
    const n = text.match(/(\d+)条/);
    if (n) query.topN = Number(n[1]);

    return {
      query,
      raw: raw.length ? raw.join('，') : '（未识别到具体条件，返回默认推荐）',
    };
  }

  async explain(
    top: ScoredCargo[],
    query: DriverQuery,
    vehicle: Vehicle,
  ): Promise<string> {
    if (!top.length) {
      return '暂时没有符合你条件的货源。可以放宽运距或运费要求，或者换换目的地再试试。';
    }
    const lines: string[] = [];
    const first = top[0]!;
    const fc = first.cargo;
    const backhaulNote = first.isBackhaul ? `，是回程货，往家方向顺路` : '';
    lines.push(
      `综合下来，${fc.from}→${fc.to}的${fc.cargo}最值得跑：运费${fc.price}元，扣掉油费、高速、杂费后预计净收益${first.cost.netIncome}元，每公里${first.cost.perKm}元${backhaulNote}。`,
    );
    if (top.length > 1) {
      const second = top[1]!;
      const sc = second.cargo;
      lines.push(
        `备选：${sc.from}→${sc.to}的${sc.cargo}，净收益${second.cost.netIncome}元、每公里${second.cost.perKm}元。`,
      );
    }
    if (first.score.backhaul === 100 && !first.isBackhaul) {
      lines.push(`这单目的地${fc.to}离你家近，回来大概率能接到回程货，别放走。`);
    } else if (first.score.route >= 80) {
      lines.push(`而且这条线在${vehicle.plate}的常跑路线上，路熟、风险低。`);
    }
    if (query.minPerKm !== undefined) {
      lines.push(`已按你要求筛掉每公里净收益低于${query.minPerKm}元的单。`);
    }
    return lines.join('');
  }
}
