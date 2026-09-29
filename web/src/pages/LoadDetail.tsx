/**
 * 货源详情
 *
 * 路线 / 距离 / 货物 / 车型 / 装货时间
 * 费用拆解：运费、油费、高速费、其他费用、空驶成本
 * 最终：预计总成本、预计净收益、每公里收益
 * "为什么推荐"：调用后端 AI explanation
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { CargoFeedback, ScoredCargoView } from '../api/types';
import { ErrorState, Loading, ScoreRing } from '../components/ui';
import { fmtMoney, fmtNum, fmtPerKm } from '../utils/format';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; item: ScoredCargoView };

export default function LoadDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [explain, setExplain] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [fee, setFee] = useState<{ balance: number; amount: number } | null>(null);
  const [feedbacks, setFeedbacks] = useState<CargoFeedback[]>([]);
  const [fbWait, setFbWait] = useState<'lt1' | '1to3' | '3to6' | 'gt6' | ''>('');
  const [fbDiff, setFbDiff] = useState<'easy' | 'medium' | 'hard' | ''>('');
  const [fbTips, setFbTips] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    if (!id) return;
    setState({ status: 'loading' });
    api
      .getCargo(id)
      .then(item => setState({ status: 'ready', item }))
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  useEffect(load, [id]);

  const showExplain = () => {
    if (!id || explain !== null) return;
    setExplainLoading(true);
    api
      .getCargoExplain(id)
      .then(r => setExplain(r.explanation))
      .catch(() => setExplain('AI 暂时无法解释这单，请稍后再试。'))
      .finally(() => setExplainLoading(false));
  };

  const accept = async () => {
    if (!id) return;
    setAccepting(true);
    try {
      const order = await api.acceptLoad(id);
      setAccepted(order.id);
    } catch (e) {
      alert(`接单失败：${(e as Error).message}`);
    } finally {
      setAccepting(false);
    }
  };

  // P1：加载服务费余额（虚拟额度）
  useEffect(() => {
    (async () => {
      try {
        const r = await api.getServiceFeeBalance();
        setFee({ balance: r.balance, amount: r.amount });
      } catch {
        /* 忽略：演示环境可取不到则隐藏 */
      }
    })();
  }, []);

  const recharge = async () => {
    try {
      const r = await api.rechargeServiceFee();
      setFee({ balance: r.balance, amount: r.amount });
    } catch (e) {
      alert(`充值失败：${(e as Error).message}`);
    }
  };

  // P1：加载卡友反馈
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setFeedbacks(await api.listCargoFeedback(id));
      } catch {
        /* 忽略 */
      }
    })();
  }, [id]);

  const submitFeedback = async () => {
    if (!id) return;
    if (!fbDiff) {
      alert('请选择装卸难易');
      return;
    }
    const waitMap = { lt1: 0.5, '1to3': 2, '3to6': 4, gt6: 6 } as Record<string, number>;
    setFbSubmitting(true);
    try {
      await api.submitCargoFeedback(id, {
        loadWaitHours: fbWait ? waitMap[fbWait] : null,
        loadDifficulty: fbDiff,
        unloadDifficulty: null,
        entranceTips: fbTips,
        parkingTips: '',
        comment: '',
      });
      setFeedbacks(await api.listCargoFeedback(id));
      setFbWait('');
      setFbDiff('');
      setFbTips('');
    } catch (e) {
      alert(`提交失败：${(e as Error).message}`);
    } finally {
      setFbSubmitting(false);
    }
  };

  if (state.status === 'loading') return <Loading text="正在加载详情…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const { cargo: c, cost, score } = state.item;

  const costRows: Array<{ label: string; value: number; hint?: string }> = [
    { label: '运费', value: c.price },
    { label: '油费', value: cost.fuel },
    { label: '高速费', value: cost.toll },
    { label: '其他费用（食宿/停车/杂费）', value: cost.other },
    { label: '空驶成本', value: cost.emptyCost, hint: '当前为估算值，接真实路线服务后更新' },
  ];

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">🚛</div>
          <div>
            <div className="bname">{c.from} → {c.to}</div>
            <div className="bsub">{c.cargo} · {c.wt}吨 · {c.km}公里</div>
          </div>
        </div>
      </header>

      {/* 路线/时间信息 */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="tag tag-gray">📏 {fmtNum(c.km)} km</span>
        <span className="tag tag-gray">⏱️ 约 {Math.max(1, Math.round(c.km / 60))} 小时</span>
        <span className="tag tag-gray">🚛 {c.truck}</span>
        <span className="tag tag-orange">装货 {c.pickup}</span>
        {c.cls && <span className="tag tag-green">{c.cls}</span>}
        <span className="tag tag-gray">货主 {c.owner}{c.verified ? ' ✓认证' : ''}</span>
        {state.item.creditBadge === 'good' && <span className="tag tag-green">👍 靠谱</span>}
        {state.item.creditBadge === 'mid' && <span className="tag" style={{ background: 'rgba(217,119,6,.1)', color: '#d97706', borderColor: 'rgba(217,119,6,.3)' }}>🟡 一般</span>}
        {state.item.blacklisted && <span className="tag tag-red">⚠ 黑名单货主，接单谨慎</span>}
      </div>

      {/* 费用拆解 */}
      <div className="sec-hd">费用拆解</div>
      <div className="card" style={{ padding: '8px 14px' }}>
        {costRows.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(128,128,128,.08)' }}>
            <span style={{ fontSize: 13.5, color: '#6b6b6f' }}>
              {r.label}
              {r.hint && <span style={{ fontSize: 11, color: '#8a8a90', marginLeft: 6 }}>({r.hint})</span>}
            </span>
            <span style={{ fontWeight: 700 }}>{fmtMoney(r.value)}</span>
          </div>
        ))}
      </div>

      {/* P4 路线与环境（高德） */}
      <RouteEnvBlock from={c.from} to={c.to} />

      {/* 结论 */}
      <div className="card" style={{ background: 'linear-gradient(135deg,#1f2937,#111827)', border: 'none', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>预计总成本</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{fmtMoney(cost.totalCost)}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 10 }}>预计净收益</div>
        <div style={{ fontSize: 38, fontWeight: 900, color: '#4ade80', margin: '2px 0' }}>
          {cost.netIncome >= 0 ? '+' : ''}{fmtMoney(cost.netIncome)}
        </div>
        <div style={{ fontSize: 14, color: '#fb923c', fontWeight: 800 }}>{fmtPerKm(cost.perKm)}</div>
      </div>

      {/* AI 评分与解释 */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ScoreRing score={score.total} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>综合评分 {score.total} 分</div>
          <div style={{ fontSize: 11.5, color: '#8a8a90', marginTop: 4, lineHeight: 1.6 }}>
            收益 {score.income} · 路线 {score.route} · 回程 {score.backhaul} · 车型 {score.vehicle} · 时间 {score.time}
            {state.item.isBackhaul && <span className="tag tag-orange" style={{ marginLeft: 6 }}>🔄 回程</span>}
          </div>
        </div>
      </div>

      {/* P1 货源可信度 */}
      {state.item.credibility && (
        <div className="card" style={{ borderColor: 'rgba(22,163,74,.25)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 800 }}>🛡️ 货源可信度</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: state.item.credibility.level === 'high' ? '#16a34a' : state.item.credibility.level === 'mid' ? '#d97706' : '#dc2626' }}>
              {state.item.credibility.score}
            </span>
            <span style={{ fontSize: 12, color: '#8a8a90' }}>分</span>
            <span className="tag" style={{
              marginLeft: 'auto',
              background: state.item.credibility.level === 'high' ? 'rgba(22,163,74,.12)' : state.item.credibility.level === 'mid' ? 'rgba(217,119,6,.1)' : 'rgba(220,38,38,.1)',
              color: state.item.credibility.level === 'high' ? '#16a34a' : state.item.credibility.level === 'mid' ? '#d97706' : '#dc2626',
              borderColor: state.item.credibility.level === 'high' ? 'rgba(22,163,74,.3)' : state.item.credibility.level === 'mid' ? 'rgba(217,119,6,.3)' : 'rgba(220,38,38,.3)',
            }}>
              {state.item.credibility.level === 'high' ? '信任度较高' : state.item.credibility.level === 'mid' ? '信任度一般' : '信任度较低'}
            </span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {state.item.credibility.evidence.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.6 }}>{e}</div>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#8a8a90' }}>
            ⚠ 可信度=证据支持度，非真实性保证；以平台核实为准
          </div>
        </div>
      )}

      {explain === null ? (
        <div style={{ margin: '0 12px 14px' }}>
          <button className="btn-p" onClick={showExplain} disabled={explainLoading}>
            {explainLoading ? '分析中…' : '为什么推荐这单？'}
          </button>
        </div>
      ) : (
        <div className="card" style={{ borderColor: 'rgba(249,115,22,.4)', background: 'rgba(249,115,22,.04)' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>为什么推荐</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.8, color: '#374151' }}>{explain}</div>
        </div>
      )}

      {/* P1 卡友反馈（结构化） */}
      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>👥 卡友反馈</div>
        {feedbacks.length === 0 ? (
          <div style={{ fontSize: 12, color: '#8a8a90' }}>暂无卡友反馈，等你来第一条</div>
        ) : (
          feedbacks.map(f => (
            <div key={f.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,.08)' }}>
              <div style={{ fontSize: 12.5 }}>
                ⏱ 等 {f.loadWaitHours ?? '—'}h
                {f.loadDifficulty && <span> · 装货 {f.loadDifficulty}</span>}
                {f.unloadDifficulty && <span> · 卸货 {f.unloadDifficulty}</span>}
              </div>
              {(f.entranceTips || f.parkingTips) && (
                <div style={{ fontSize: 11.5, color: '#6b6b6f', marginTop: 2 }}>
                  {f.entranceTips && `🚪 ${f.entranceTips}`}
                  {f.entranceTips && f.parkingTips && ' · '}
                  {f.parkingTips && `🅿️ ${f.parkingTips}`}
                </div>
              )}
            </div>
          ))
        )}
        {/* 提交表单 */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={fbWait} onChange={e => setFbWait(e.target.value as 'lt1' | '1to3' | '3to6' | 'gt6' | '')} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }}>
              <option value="">等待时长?</option>
              <option value="lt1">&lt;1h</option>
              <option value="1to3">1-3h</option>
              <option value="3to6">3-6h</option>
              <option value="gt6">&gt;6h</option>
            </select>
            <select value={fbDiff} onChange={e => setFbDiff(e.target.value as 'easy' | 'medium' | 'hard' | '')} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }}>
              <option value="">装卸难易?</option>
              <option value="easy">容易</option>
              <option value="medium">一般</option>
              <option value="hard">难</option>
            </select>
          </div>
          <input value={fbTips} onChange={e => setFbTips(e.target.value)} placeholder="入口/停车经验（可选）" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #ddd' }} />
          <button className="btn-g" onClick={submitFeedback} disabled={fbSubmitting}>
            {fbSubmitting ? '提交中…' : '提交卡友反馈'}
          </button>
        </div>
      </div>

      {/* P1 平台服务费（虚拟额度，不可提现/转账/兑换） */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(22,163,74,.05)', borderColor: 'rgba(22,163,74,.25)' }}>
        <span style={{ fontSize: 13 }}>🛡️ 平台服务费</span>
        <span style={{ flex: 1, fontSize: 12.5, color: '#4b5563' }}>
          承运需支付约 {fee ? fee.amount : 200} 元（当前虚拟额度 {fee ? fee.balance : '—'} 元）
        </span>
        {fee && fee.balance < fee.amount && (
          <button className="btn-g" style={{ fontSize: 12, padding: '4px 10px' }} onClick={recharge}>
            💳 充值演示
          </button>
        )}
      </div>

      {/* 操作 */}
      <div className="row-actions">
        <button className="btn-g">📞 联系货主</button>
        {accepted ? (
          <button className="btn-p" onClick={() => navigate(`/orders/${accepted}`)}>
            📋 已接单 · 去订单看证据链
          </button>
        ) : (
          <button className="btn-p" onClick={accept} disabled={accepting}>
            {accepting ? '接单中…' : '📋 接单'}
          </button>
        )}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#8a8a90', padding: '0 24px 18px' }}>
        空驶成本为当前估算值（当前位置→装货地），接入真实路线规划后更新；演示环境不产生真实运输。
      </div>
    </div>
  );
}

/**
 * P4+P5 路线与环境区块：路径（高速/国道/平衡）、天气影响、补给点。
 * 策略选择会保存为司机偏好（P5），下次默认使用。
 */
function RouteEnvBlock({ from, to }: { from: string; to: string }) {
  const [strategy, setStrategy] = useState<'highway' | 'balanced' | 'national'>('highway');
  const [env, setEnv] = useState<import('../api/types').RouteEnvironment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comp, setComp] = useState<import('../api/types').RouteCompare | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api
      .getRouteEnvironment(from, to, strategy)
      .then(r => {
        if (alive) setEnv(r);
      })
      .catch(e => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to, strategy]);

  // P：高速 vs 国道 对比
  useEffect(() => {
    let alive = true;
    api
      .getRouteCompare(from, to)
      .then(r => {
        if (alive) setComp(r);
      })
      .catch(() => {
        if (alive) setComp(null);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  // P5：策略选择即记住（写偏好，下次大厅/AI 计算默认用它）
  const chooseStrategy = (s: 'highway' | 'balanced' | 'national') => {
    setStrategy(s);
    api.updatePrefs({ minPerKm: null, minNetIncome: null, maxKm: null, preferredStrategy: s }).catch(() => {});
  };

  const STRS: Array<{ v: 'highway' | 'balanced' | 'national'; label: string }> = [
    { v: 'highway', label: '🛣️ 高速' },
    { v: 'balanced', label: '⚖️ 平衡' },
    { v: 'national', label: '🛤️ 国道' },
  ];

  return (
    <div>
      <div className="sec-hd">🛣️ 路线与环境</div>
      <div className="card">
        {/* 策略切换 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {STRS.map(s => (
            <button
              key={s.v}
              onClick={() => chooseStrategy(s.v)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: strategy === s.v ? '1px solid #f97316' : '1px solid rgba(128,128,128,.25)',
                background: strategy === s.v ? 'rgba(249,115,22,.1)' : '#fff',
                color: strategy === s.v ? '#ea580c' : '#1c1c1e',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {loading && <div style={{ padding: '12px 0', textAlign: 'center', color: '#8a8a90', fontSize: 12.5 }}>正在查询路线与天气…</div>}
        {error && <div style={{ padding: '10px 0', textAlign: 'center', color: '#dc2626', fontSize: 12.5 }}>{error}</div>}

        {env && !loading && (
          <>
            {/* 路径概览 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10, textAlign: 'center' }}>
              <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: '#8a8a90' }}>里程</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{env.plan.distanceKm} km</div>
              </div>
              <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: '#8a8a90' }}>预计时长</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{Math.round(env.plan.durationMin / 60)}h{env.plan.durationMin % 60}m</div>
              </div>
              <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: '#8a8a90' }}>过路费</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtMoney(env.plan.toll)}</div>
              </div>
            </div>

            {/* 高速 vs 国道 对比 */}
            {comp && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🛣 高速还是国道（按你车算）</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { key: 'highway', label: '高速', plan: comp.highway, cheap: comp.cheaper === 'highway' },
                    { key: 'national', label: '国道', plan: comp.national, cheap: comp.cheaper === 'national' },
                  ].map(o => (
                    <div key={o.key} style={{ border: o.cheap ? '1.5px solid #c2410c' : '1px solid rgba(128,128,128,.18)', borderRadius: 10, padding: '9px 10px', background: o.cheap ? 'rgba(194,65,12,.05)' : '#f6f7f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{o.label}</span>
                        {o.cheap && <span style={{ fontSize: 10.5, color: '#c2410c', fontWeight: 700 }}>更划算</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b6b6f', marginTop: 5, lineHeight: 1.6 }}>⏱ {Math.round(o.plan.plan.durationMin / 60)}h{o.plan.plan.durationMin % 60}m</div>
                      <div style={{ fontSize: 12, color: '#6b6b6f', lineHeight: 1.6 }}>🛣 过路费 {fmtMoney(o.plan.plan.toll)}</div>
                      <div style={{ fontSize: 12, color: '#6b6b6f', lineHeight: 1.6 }}>⛽ 油费 {fmtMoney(o.plan.fuel)}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4, color: o.key === 'highway' ? '#c2410c' : '#16a34a' }}>合计 {fmtMoney(o.plan.totalCost)} 元</div>
                    </div>
                  ))}
                </div>
                {!comp.real && <div style={{ fontSize: 11, color: '#8a8a90', marginTop: 5 }}>演示数据（配置高德 Key 后为真实路线）</div>}
              </div>
            )}

            {/* 天气与影响 */}
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(22,163,74,.05)', border: '1px solid rgba(22,163,74,.2)' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                🌤️ {env.from} 天气：{env.fromWeather.weather.weather} {env.fromWeather.weather.temp}℃ 风力{env.fromWeather.weather.windScale}级
              </div>
              <div style={{ fontSize: 12.5, color: '#374151', marginTop: 5, lineHeight: 1.7 }}>{env.fromWeather.impact.advice}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="tag tag-orange">油耗修正 ×{env.fromWeather.impact.fuelFactor}</span>
                {env.fromWeather.impact.tireAdjustBar !== 0 && (
                  <span className="tag tag-gray">
                    胎压建议 {env.fromWeather.impact.tireAdjustBar > 0 ? `+${env.fromWeather.impact.tireAdjustBar}bar（补气）` : `${env.fromWeather.impact.tireAdjustBar}bar（降压）`}
                  </span>
                )}
                {env.fromWeather.impact.slowDown && <span className="tag tag-red">⚠ 建议降速</span>}
              </div>
              <div style={{ fontSize: 11.5, color: '#8a8a90', marginTop: 6 }}>
                🎯 {env.to}：{env.toWeather.weather} {env.toWeather.temp}℃
                {!env.real && ' ｜ 演示数据（配置高德 Key 后为真实路线）'}
              </div>
            </div>

            {/* 沿途补给 */}
            {env.pois.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 5 }}>🍜 沿途补给（{env.from}附近）</div>
                {env.pois.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,.07)', fontSize: 12.5 }}>
                    <span>{p.type.includes('餐') ? '🍚' : '⛽'}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ color: '#8a8a90', fontSize: 11 }}>{p.distance > 1000 ? `${(p.distance / 1000).toFixed(1)}km` : `${p.distance}m`}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
