/**
 * 我的车辆（车型档案）
 *
 * 展示并允许编辑：车型/长度/载重/百公里油耗/油价/当前地点/回程基地/常跑路线/最低接受收益。
 * 保存后调用 PUT /api/vehicle，后续所有计算用新档案。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { DriverAccount, DriverPrefs, SavedRoute, Vehicle } from '../api/types';
import { ErrorState, Loading } from '../components/ui';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; v: Vehicle };

const EMPTY_PREFS: DriverPrefs = { minPerKm: null, minNetIncome: null, maxKm: null, preferredStrategy: null };

export default function VehiclePage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const navigate = useNavigate();
  // 登录态（P7）
  const [token, setToken] = useState<string>(() => localStorage.getItem('fr_token') ?? '');
  const [loggedIn, setLoggedIn] = useState<DriverAccount | null>(null);
  // 新增常跑路线的草稿
  const [rtFrom, setRtFrom] = useState('');
  const [rtTo, setRtTo] = useState('');
  // 回程城市草稿（逗号分隔）
  const [homeDraft, setHomeDraft] = useState('');
  // 底线偏好（P2）
  const [prefs, setPrefs] = useState<DriverPrefs>(EMPTY_PREFS);
  // 多司机（P6）
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [currentDriver, setCurrentDriver] = useState<DriverAccount | null>(null);
  const [driverErr, setDriverErr] = useState('');
  const [newDriverName, setNewDriverName] = useState('');

  const load = () => {
    setState({ status: 'loading' });
    api
      .getVehicle()
      .then(v => {
        setState({ status: 'ready', v });
        setHomeDraft(v.homeCities.join('、'));
      })
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
    api
      .getPrefs()
      .then(p => setPrefs(p))
      .catch(() => setPrefs(EMPTY_PREFS));
    api
      .listDrivers()
      .then(r => {
        setDrivers(r.drivers);
        setCurrentDriver(r.current);
        if (r.error) setDriverErr(r.error);
      })
      .catch(() => setDriverErr('司机账号需 SQLite 模式（PERSIST=sqlite）'));
    // P7：校验本地 token 是否仍有效
    if (token) {
      api
        .me(token)
        .then(r => setLoggedIn(r.driver))
        .catch(() => {
          localStorage.removeItem('fr_token');
          setToken('');
          setLoggedIn(null);
        });
    }
  };

  // P7 登录 / 登出
  const doLogout = () => {
    if (token) api.logout(token).catch(() => {});
    localStorage.removeItem('fr_token');
    setToken('');
    setLoggedIn(null);
    setToast('已退出登录');
    setTimeout(() => setToast(''), 2500);
  };

  // P6 多司机
  const createDriver = () => {
    const name = newDriverName.trim();
    if (!name) return;
    api
      .createDriver(name)
      .then(d => {
        setDrivers(prev => [...prev, d]);
        setNewDriverName('');
        setToast(`已创建司机「${d.name}」`);
        setTimeout(() => setToast(''), 2500);
      })
      .catch(e => setToast(`创建失败：${(e as Error).message}`));
  };

  const switchDriver = (id: string) => {
    api
      .switchDriver(id)
      .then(d => {
        setCurrentDriver(d);
        setToast(`已切换到「${d.name}」，车辆档案与偏好已隔离`);
        setTimeout(() => setToast(''), 2500);
        // 重新加载当前司机的车辆与偏好
        load();
      })
      .catch(e => setToast(`切换失败：${(e as Error).message}`));
  };

  useEffect(load, []);

  const patch = (p: Partial<Vehicle>) => {
    if (state.status !== 'ready') return;
    setState({ status: 'ready', v: { ...state.v, ...p } });
  };

  const addRoute = () => {
    if (state.status !== 'ready') return;
    const a = rtFrom.trim();
    const b = rtTo.trim();
    if (!a || !b) return;
    const route: SavedRoute = { id: `r${Date.now() % 100000}`, from: a, to: b };
    patch({ routes: [...state.v.routes, route] });
    setRtFrom('');
    setRtTo('');
  };

  const delRoute = (id: string) => {
    if (state.status !== 'ready') return;
    patch({ routes: state.v.routes.filter(r => r.id !== id) });
  };

  const save = () => {
    if (state.status !== 'ready') return;
    setSaving(true);
    Promise.all([
      api.updateVehicle({
        ...state.v,
        homeCities: homeDraft
          .split(/[、,，]/)
          .map(s => s.trim())
          .filter(Boolean),
      }),
      api.updatePrefs(prefs),
    ])
      .then(([v]) => {
        setState({ status: 'ready', v });
        setHomeDraft(v.homeCities.join('、'));
        setToast('已保存，后续计算将使用新档案与底线');
        setTimeout(() => setToast(''), 2500);
      })
      .catch(e => setToast(`保存失败：${(e as Error).message}`))
      .finally(() => setSaving(false));
  };

  if (state.status === 'loading') return <Loading text="正在读取车辆档案…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const v = state.v;

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">🚛</div>
          <div>
            <div className="bname">我的车辆</div>
            <div className="bsub">{v.plate} · 所有成本按此计算</div>
          </div>
        </div>
      </header>

      {/* P6 多司机账号 */}
      <div className="sec-hd">👥 司机账号{currentDriver ? `（当前：${currentDriver.name}）` : ''}</div>
      <div className="card">
        {/* P7 登录态 */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, marginBottom: 12,
            background: loggedIn ? 'rgba(22,163,74,.07)' : 'rgba(249,115,22,.07)',
            border: `1px solid ${loggedIn ? 'rgba(22,163,74,.3)' : 'rgba(249,115,22,.3)'}`,
          }}
        >
          <span style={{ fontSize: 18 }}>{loggedIn ? '🔓' : '🔒'}</span>
          <div style={{ flex: 1, fontSize: 13 }}>
            {loggedIn ? (
              <>已登录：<b>{loggedIn.name}</b>（数据归属该账号）</>
            ) : (
              <>未登录。登录后司机账号才带密码保护</>
            )}
          </div>
          {loggedIn ? (
            <button className="btn-g" style={{ width: 'auto', padding: '5px 14px', fontSize: 12 }} onClick={doLogout}>
              退出
            </button>
          ) : (
            <button className="btn-p" style={{ width: 'auto', padding: '5px 16px', fontSize: 12 }} onClick={() => navigate('/login')}>
              去登录
            </button>
          )}
        </div>
        {driverErr && (
          <div style={{ fontSize: 12, color: '#8a8a90', marginBottom: 8 }}>{driverErr}</div>
        )}
        {drivers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {drivers.map(d => (
              <button
                key={d.id}
                onClick={() => switchDriver(d.id)}
                disabled={currentDriver?.id === d.id}
                style={{
                  padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: currentDriver?.id === d.id ? '2px solid #f97316' : '1px solid rgba(128,128,128,.3)',
                  background: currentDriver?.id === d.id ? 'rgba(249,115,22,.1)' : '#fff',
                  color: currentDriver?.id === d.id ? '#ea580c' : '#1c1c1e',
                }}
              >
                {currentDriver?.id === d.id ? '✅ ' : ''}{d.name}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="inp" placeholder="新司机姓名（如：二哥）"
            value={newDriverName}
            onChange={e => setNewDriverName(e.target.value)}
          />
          <button className="btn-p" style={{ width: 'auto', padding: '0 18px' }} onClick={createDriver}>
            + 创建
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#8a8a90' }}>
          每个司机的车辆档案、回程城市、底线偏好相互独立（需 SQLite 模式）。
        </div>
      </div>

      {/* P16 货主信用入口 */}
      <div className="sec-hd">🛠 货主信用</div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>货主信用管理</div>
          <div style={{ fontSize: 11.5, color: '#8a8a90', marginTop: 2 }}>
            评价靠谱货主、识别黑名单、管理避坑
          </div>
        </div>
        <button className="btn-p" style={{ width: 'auto', padding: '9px 18px', fontSize: 13 }} onClick={() => navigate('/credits')}>
          查看
        </button>
      </div>

      {/* 车辆参数 */}
      <div className="sec-hd">车辆参数</div>
      <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>车型</span>
          <input className="inp" value={v.truck} onChange={e => patch({ truck: e.target.value })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>核定载重（吨）</span>
          <input className="inp" type="number" value={v.maxLoad} onChange={e => patch({ maxLoad: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>百公里油耗（升）</span>
          <input className="inp" type="number" value={v.fuelPer100km} onChange={e => patch({ fuelPer100km: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>当前油价（元/升）</span>
          <input className="inp" type="number" step="0.1" value={v.fuelPrice} onChange={e => patch({ fuelPrice: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>高速费系数（元/km）</span>
          <input className="inp" type="number" step="0.1" value={v.tollPerKm} onChange={e => patch({ tollPerKm: Number(e.target.value) || 0 })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>其他杂费（元/趟）</span>
          <input className="inp" type="number" value={v.otherCostPerTrip} onChange={e => patch({ otherCostPerTrip: Number(e.target.value) || 0 })} />
        </label>
      </div>

      {/* 当前位置与回程基地 */}
      <div className="sec-hd">位置</div>
      <div className="card">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>当前所在城市</span>
          <input className="inp" value={v.currentCity} onChange={e => patch({ currentCity: e.target.value })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>回程基地城市（用顿号分隔，多选）</span>
          <input className="inp" value={homeDraft} onChange={e => setHomeDraft(e.target.value)} />
        </label>
      </div>

      {/* 常跑路线 */}
      <div className="sec-hd">常跑路线</div>
      <div className="card">
        {v.routes.length === 0 && (
          <div style={{ fontSize: 12, color: '#8a8a90', marginBottom: 8 }}>还没有常跑路线，加上后 AI 推荐会更懂你</div>
        )}
        {v.routes.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,.08)' }}>
            <span style={{ flex: 1, fontWeight: 700 }}>🛤️ {r.from} → {r.to}</span>
            <button className="btn-g" style={{ width: 'auto', padding: '5px 14px', fontSize: 12 }} onClick={() => delRoute(r.id)}>删除</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input className="inp" placeholder="出发城市" value={rtFrom} onChange={e => setRtFrom(e.target.value)} />
          <input className="inp" placeholder="目的城市" value={rtTo} onChange={e => setRtTo(e.target.value)} />
          <button className="btn-p" style={{ width: 'auto', padding: '0 16px' }} onClick={addRoute}>+</button>
        </div>
      </div>

      {/* 我的底线（P2：AI 助手/大厅默认过滤） */}
      <div className="sec-hd">我的底线</div>
      <div className="card">
        <div className="two">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8a8a90' }}>每公里最低净收益（元）</span>
            <input
              className="inp" type="number" step="0.1" placeholder="如 3"
              value={prefs.minPerKm ?? ''}
              onChange={e => setPrefs({ ...prefs, minPerKm: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8a8a90' }}>单趟最低净收益（元）</span>
            <input
              className="inp" type="number" placeholder="如 3000"
              value={prefs.minNetIncome ?? ''}
              onChange={e => setPrefs({ ...prefs, minNetIncome: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#8a8a90' }}>最多运距（公里，留空不限）</span>
          <input
            className="inp" type="number" placeholder="如 1500"
            value={prefs.maxKm ?? ''}
            onChange={e => setPrefs({ ...prefs, maxKm: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <div style={{ marginTop: 8, fontSize: 11, color: '#8a8a90' }}>
          低于底线的单会在货源大厅与 AI 助手中自动过滤。
        </div>
      </div>

      {toast && (
        <div style={{ margin: '0 12px 10px', padding: 10, borderRadius: 10, background: 'rgba(22,163,74,.1)', color: '#16a34a', fontSize: 13, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      <div style={{ margin: '0 12px 20px' }}>
        <button className="btn-p" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '💾 保存车辆档案'}
        </button>
      </div>
    </div>
  );
}
