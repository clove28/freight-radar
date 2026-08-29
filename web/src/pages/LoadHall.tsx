/**
 * 货源大厅
 *
 * 筛选：出发地 / 目的地 / 车型 / 货物 / 重量 / 最低收益 / 每公里收益 / 装货时间
 * 排序：AI 推荐 / 净收益最高 / 每公里收益最高 / 距离最近
 *
 * 全部筛选与排序参数交给后端，页面不复制任何计算。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { CargoQuery, LoadSort, PagedCargos, ScoredCargoView } from '../api/types';
import { CargoCard, EmptyState, ErrorState, Loading } from '../components/ui';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; list: ScoredCargoView[]; total: number; page: number };

const SORTS: Array<{ v: LoadSort; label: string }> = [
  { v: 'ai', label: '🤖 AI推荐' },
  { v: 'netIncome', label: '💰 净收益' },
  { v: 'perKm', label: '📈 每公里' },
  { v: 'distance', label: '📍 距离' },
];

const TRUCKS = ['全部', '13米高栏', '13米平板', '9.6米', '6.8米', '4.2米', '17.5米平板', '厢式车'];

export default function LoadHall() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [q, setQ] = useState<CargoQuery>({ sort: 'ai', topN: 50 });
  const [showFilter, setShowFilter] = useState(false);
  const navigate = useNavigate();

  const load = (query: CargoQuery) => {
    setState({ status: 'loading' });
    api
      .listCargos(query)
      .then(res => {
        // 兼容数组与分页对象
        if (Array.isArray(res)) {
          setState({ status: 'ready', list: res, total: res.length, page: 1 });
        } else {
          const p = res as PagedCargos;
          setState({ status: 'ready', list: p.items, total: p.total, page: p.page });
        }
      })
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  useEffect(() => {
    load(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<CargoQuery>) => {
    const next = { ...q, ...p };
    setQ(next);
    load(next);
  };

  const reset = () => {
    const next: CargoQuery = { sort: 'ai', topN: 50 };
    setQ(next);
    setShowFilter(false);
    load(next);
  };

  const activeFilters = useMemo(() => {
    let n = 0;
    if (q.from) n++;
    if (q.to) n++;
    if (q.truck) n++;
    if (q.cargo) n++;
    if (q.maxKm !== undefined) n++;
    if (q.minPerKm !== undefined) n++;
    if (q.backhaulOnly) n++;
    return n;
  }, [q]);

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">🚛</div>
          <div>
            <div className="bname">货源大厅</div>
            <div className="bsub">每单都算好净收益和每公里，再决定跑不跑</div>
          </div>
        </div>
      </header>

      {/* 排序 */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 12px 0', flexWrap: 'wrap' }}>
        {SORTS.map(s => (
          <button
            key={s.v}
            onClick={() => patch({ sort: s.v })}
            style={{
              flex: 1, minWidth: 88, padding: '8px 4px', borderRadius: 10, fontSize: 12.5,
              fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(128,128,128,.25)',
              background: q.sort === s.v ? 'linear-gradient(135deg,#f97316,#fb923c)' : '#fff',
              color: q.sort === s.v ? '#fff' : '#1c1c1e',
            }}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setShowFilter(v => !v)}
          style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: showFilter ? '1px solid #f97316' : '1px solid rgba(128,128,128,.25)',
            background: showFilter ? 'rgba(249,115,22,.08)' : '#fff',
            color: showFilter ? '#ea580c' : '#1c1c1e',
          }}
        >
          ⚙️ 筛选{activeFilters ? `(${activeFilters})` : ''}
        </button>
        <button
          onClick={() => navigate('/post')}
          style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            border: '1px solid rgba(249,115,22,.5)', background: 'linear-gradient(135deg,#f97316,#fb923c)', color: '#fff',
          }}
        >
          📢 发单
        </button>
      </div>

      {/* 筛选面板 */}
      {showFilter && (
        <div className="card" style={{ background: '#eceef1' }}>
          <div className="two">
            <input className="inp" placeholder="出发地（如 广州）" value={q.from ?? ''} onChange={e => patch({ from: e.target.value || undefined })} />
            <input className="inp" placeholder="目的地（如 武汉）" value={q.to ?? ''} onChange={e => patch({ to: e.target.value || undefined })} />
          </div>
          <div className="two">
            <input className="inp" placeholder="货物（如 黄豆粕）" value={q.cargo ?? ''} onChange={e => patch({ cargo: e.target.value || undefined })} />
            <select
              className="inp"
              value={q.truck ?? '全部'}
              onChange={e => patch({ truck: e.target.value === '全部' ? undefined : e.target.value })}
            >
              {TRUCKS.map(t => (
                <option key={t} value={t}>{t === '全部' ? '车型：全部' : t}</option>
              ))}
            </select>
          </div>
          <div className="two">
            <input
              className="inp" type="number" placeholder="最低净收益（元）"
              value={q.minPerKm !== undefined ? String(q.minPerKm) : ''}
              onChange={e => patch({ minPerKm: e.target.value ? Number(e.target.value) : undefined })}
            />
            <input
              className="inp" type="number" placeholder="最大运距（km）"
              value={q.maxKm !== undefined ? String(q.maxKm) : ''}
              onChange={e => patch({ maxKm: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingTop: 8 }}>
            <input
              type="checkbox" checked={!!q.backhaulOnly}
              onChange={e => patch({ backhaulOnly: e.target.checked || undefined })}
              style={{ width: 18, height: 18 }}
            />
            🔄 只看回程货（目的地为回程基地）
          </label>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="btn-g" style={{ width: 140, display: 'inline-block' }} onClick={reset}>重置筛选</button>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div style={{ paddingTop: 10 }}>
        {state.status === 'loading' && <Loading text="正在计算每单净收益…" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={() => load(q)} />}
        {state.status === 'ready' && state.list.length === 0 && (
          <EmptyState
            icon="🔍"
            text="暂时没有符合条件的货源"
            action={
              <button className="btn-g" style={{ maxWidth: 220, margin: '0 auto' }} onClick={reset}>
                调整筛选条件
              </button>
            }
          />
        )}
        {state.status === 'ready' &&
          state.list.map(item => (
            <CargoCard key={item.cargo.id} item={item} onClick={() => navigate(`/cargos/${item.cargo.id}`)} />
          ))}
        {state.status === 'ready' && state.list.length > 0 && (
          <div style={{ textAlign: 'center', color: '#8a8a90', fontSize: 12, padding: '4px 0 14px' }}>
            共 {state.total} 条 · 空驶成本按当前位置→装货地估算，接真实路线服务后更新
          </div>
        )}
      </div>
    </div>
  );
}
