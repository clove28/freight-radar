/**
 * Dashboard 首页
 *
 * 视觉优先级：
 *   1. AI 最推荐单的"预计净收益"（最大数字，绿色）
 *   2. 每公里收益
 *   3. 当前车辆 / 当前地点 / 推荐数 / 待处理订单
 *   4. AI 推荐卡片（运费小、净收益大）
 *
 * 全部数据来自 GET /api/dashboard，页面不做任何计算。
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { DashboardView, HistoryInsights, StatsView } from '../api/types';
import { Loading, ErrorState, ScoreRing } from '../components/ui';
import { fmtMoney, fmtNum, fmtPerKm } from '../utils/format';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: DashboardView };

export default function Dashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [history, setHistory] = useState<HistoryInsights | null>(null);
  const [stats, setStats] = useState<StatsView | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setState({ status: 'loading' });
    api
      .getDashboard()
      .then(data => {
        setState({ status: 'ready', data });
        api.getHistory().then(setHistory).catch(() => setHistory(null));
        api.getStats().then(setStats).catch(() => setStats(null));
      })
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  useEffect(load, []);

  if (state.status === 'loading') return <Loading text="正在汇总今日收益…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const d = state.data;
  const top = d.topLoad;
  const net = top?.cost.netIncome ?? 0;

  return (
    <div>
      {/* 顶栏 */}
      <header className="topbar">
        <div className="brand">
          <div className="logo">🚛</div>
          <div>
            <div className="bname">货运雷达</div>
            <div className="bsub">帮你判断哪一单值得跑</div>
          </div>
        </div>
      </header>

      {/* 车辆与地点 */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#8a8a90' }}>当前车辆</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>🚛 {d.vehicle.truck} · {d.vehicle.maxLoad}吨</div>
          <div style={{ fontSize: 11, color: '#8a8a90', marginTop: 4 }}>车牌 {d.vehicle.plate}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#8a8a90' }}>当前地点</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>📍 {d.currentCity}</div>
        </div>
      </div>

      {/* 核心指标：净收益最大最突出 */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg,#1f2937,#111827)',
          border: 'none', color: '#fff', textAlign: 'center', padding: '20px 14px',
        }}
      >
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>♨️ 最值得跑的一单 · 预计净收益</div>
        <div style={{ fontSize: 42, fontWeight: 900, color: '#4ade80', margin: '6px 0 2px', letterSpacing: 1 }}>
          {net >= 0 ? '+' : ''}{fmtMoney(net)}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
          预计每公里收益 <b style={{ color: '#fb923c' }}>{top ? fmtPerKm(top.cost.perKm) : '—'}</b>
          <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
          推荐货源 <b>{d.openCount}</b> 条
          <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
          待处理订单 <b>{d.activeOrders}</b> 条
        </div>
      </div>

      {/* 最值得跑卡片 */}
      {top ? (
        <div className="sec-hd">♨️ 最值得跑</div>
      ) : (
        <div className="sec-hd">♨️ 最值得跑</div>
      )}
      {top ? (
        <div className="card" style={{ position: 'relative' }}>
          {top.isBackhaul && (
            <span style={{ position: 'absolute', top: -9, left: 12, background: 'linear-gradient(135deg,#f97316,#fb923c)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 10 }}>
              🔄 回程货
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 900 }}>
                {top.cargo.from} <span style={{ color: '#f97316' }}>→</span> {top.cargo.to}
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <span className="tag tag-orange">{top.cargo.cargo}</span>
                <span className="tag tag-gray">{top.cargo.wt}吨</span>
                <span className="tag tag-gray">{top.cargo.truck}</span>
                <span className="tag tag-gray">{top.cargo.km}km</span>
              </div>

              {/* 费用拆解：运费小 / 成本小 / 净收益大 */}
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#8a8a90' }}>运费</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(top.cargo.price)}</div>
                </div>
                <div style={{ background: '#f6f7f9', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#8a8a90' }}>预计成本</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6b6b6f' }}>{fmtMoney(top.cost.totalCost)}</div>
                </div>
                <div style={{ background: 'rgba(22,163,74,.08)', borderRadius: 10, padding: '8px 10px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, color: '#8a8a90' }}>预计净收益（关键）</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="money positive" style={{ fontSize: 24 }}>
                      {net >= 0 ? '+' : ''}{fmtMoney(net)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>{fmtPerKm(top.cost.perKm)}</span>
                  </div>
                </div>
              </div>
            </div>
            <ScoreRing score={top.score.total} size={58} />
          </div>
          <div className="row-actions" style={{ margin: '12px 0 0' }}>
            <button className="btn-g" onClick={() => navigate(`/cargos/${top.cargo.id}`)}>查看详情</button>
            <button className="btn-p" onClick={() => navigate(`/cargos/${top.cargo.id}`)}>为什么推荐</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', color: '#8a8a90' }}>
          暂时没有符合条件的货源
          <br />
          <Link className="btn-g" to="/hall" style={{ marginTop: 12, display: 'inline-block', width: 200 }}>
            去货源大厅看看
          </Link>
        </div>
      )}

      {/* 本月概览 */}
      <div className="sec-hd">
        本月账本
        <button
          onClick={() => api.exportBooksCsv()}
          style={{
            marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            border: '1px solid rgba(249,115,22,.4)', background: 'rgba(249,115,22,.08)',
            color: '#ea580c', borderRadius: 8, padding: '4px 10px',
          }}
        >
          ⬇️ 导出对账 CSV
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 12px 14px' }}>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 11, color: '#8a8a90' }}>本月净收益</div>
          <div className={`money ${d.monthIncome >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 20 }}>
            {d.monthIncome >= 0 ? '+' : ''}{fmtMoney(d.monthIncome)}
          </div>
          <div style={{ fontSize: 11, color: '#8a8a90', marginTop: 2 }}>{d.monthOrders} 单 · 平均 {fmtPerKm(d.avgPerKm)}</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div style={{ fontSize: 11, color: '#8a8a90' }}>回程货在线</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f97316' }}>{d.backhaulOpen} 条</div>
          <div style={{ fontSize: 11, color: '#8a8a90', marginTop: 2 }}>本月总里程 {fmtNum(d.monthKm)} km</div>
        </div>
      </div>

      {/* P10 收益趋势可视化 */}
      {stats && (
        <>
          <div className="sec-hd">📈 近 {stats.monthly.length} 月收益趋势<span className="sec-n">平均 {fmtPerKm(stats.avgPerKmAll)}</span></div>
          <div className="card" style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '4px 2px' }}>
              {stats.monthly.map(m => {
                const max = Math.max(...stats.monthly.map(x => Math.abs(x.income)), 1);
                const barH = Math.max(4, (Math.abs(m.income) / max) * 96);
                const positive = m.income >= 0;
                return (
                  <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: '#6b6b6f', fontWeight: 700 }}>{fmtNum(m.income)}</div>
                    <div
                      style={{
                        width: '70%', height: barH, borderRadius: '6px 6px 2px 2px',
                        background: positive ? 'linear-gradient(180deg,#22c55e,#16a34a)' : 'linear-gradient(180deg,#f87171,#dc2626)',
                        opacity: 0.9,
                      }}
                    />
                    <div style={{ fontSize: 9.5, color: '#8a8a90' }}>{m.label.slice(5)}</div>
                  </div>
                );
              })}
            </div>
            {stats.routes.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#8a8a90', marginBottom: 5 }}>常跑线路收益（元）</div>
                {stats.routes.map(r => {
                  const max = Math.max(...stats.routes.map(x => x.totalIncome), 1);
                  return (
                    <div key={`${r.from}-${r.to}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                      <span style={{ fontSize: 11, width: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.from}→{r.to}
                      </span>
                      <div style={{ flex: 1, background: 'rgba(249,115,22,.12)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.totalIncome / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f97316,#fb923c)', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, width: 64, textAlign: 'right' }}>{fmtNum(r.totalIncome)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 推荐列表（Top3 精简） */}
      <div className="sec-hd">值得跑的货源 Top 3</div>
      <div style={{ margin: '0 12px 20px' }}>
        {d.topLoads.map((item, i) => (
          <div
            key={item.cargo.id}
            className="card"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => navigate(`/cargos/${item.cargo.id}`)}
          >
            <span style={{ fontSize: 22, fontWeight: 900, color: '#f97316', width: 30, textAlign: 'center' }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{item.cargo.from} → {item.cargo.to}</div>
              <div style={{ fontSize: 11, color: '#8a8a90', marginTop: 2 }}>
                {item.cargo.cargo} · {item.cargo.wt}吨 · {item.cargo.km}km
                {'creditBadge' in item && item.creditBadge === 'good' && <span className="tag tag-green" style={{ marginLeft: 6 }}>👍靠谱</span>}
                {'creditBadge' in item && item.creditBadge === 'bad' && <span className="tag tag-red" style={{ marginLeft: 6 }}>⚠黑名单</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`money ${item.cost.netIncome >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 16 }}>
                {item.cost.netIncome >= 0 ? '+' : ''}{fmtMoney(item.cost.netIncome)}
              </div>
              <div style={{ fontSize: 11, color: '#f97316', fontWeight: 700 }}>{fmtPerKm(item.cost.perKm)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 我的画像（P3 历史个性化） */}
      {history && history.finishedCount > 0 && (
        <>
          <div className="sec-hd">🧠 我的画像（历史沉淀）</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8a8a90' }}>累计净收益（估算）</div>
                <div className="money positive" style={{ fontSize: 18 }}>{fmtMoney(history.totalNetIncome)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8a8a90' }}>平均每公里净收益</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f97316' }}>{fmtPerKm(history.avgPerKm)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8a8a90' }}>完成率</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{Math.round(history.completionRate * 100)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8a8a90' }}>超损率（有对比的单）</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: history.lossOverRate > 0.3 ? '#dc2626' : '#16a34a' }}>
                  {Math.round(history.lossOverRate * 100)}%
                </div>
              </div>
            </div>
            {history.topRoutes.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#8a8a90', marginBottom: 5 }}>常跑线路</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {history.topRoutes.map(r => (
                    <span key={`${r.from}-${r.to}`} className="tag tag-orange">🛤️ {r.from}→{r.to} ×{r.count}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
