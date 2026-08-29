/**
 * 订单详情（P2）
 * 证据链 8 步进度 + 损耗对比（装/卸重量 → 后端计算）+ 证据包查看。
 * 拍照/签字为真机能力，P2 用"标记完成"模拟；界面保留完整流程。
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Order } from '../api/types';
import { ORDER_STATUS_LABEL } from '../api/types';
import { ErrorState, Loading } from '../components/ui';
import { fmtMoney } from '../utils/format';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; order: Order };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [loadTons, setLoadTons] = useState('');
  const [unloadTons, setUnloadTons] = useState('');
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    if (!id) return;
    setState({ status: 'loading' });
    api
      .getOrder(id)
      .then(order => setState({ status: 'ready', order }))
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  useEffect(load, [id]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const markStep = async (stepId: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const order = await api.completeStep(id, stepId);
      setState({ status: 'ready', order });
      flash(`已完成：${order.steps.find(s => s.id === stepId)?.label ?? stepId}`);
    } catch (e) {
      flash(`操作失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const submitLoss = async () => {
    if (!id) return;
    const lt = Number(loadTons);
    const ut = Number(unloadTons);
    if (!(lt > 0) || !(ut > 0)) {
      flash('请填写装货与卸货重量');
      return;
    }
    setBusy(true);
    try {
      const order = await api.doLoss(id, lt, ut);
      setState({ status: 'ready', order });
      flash(order.loss?.verdict ?? '损耗对比完成');
    } catch (e) {
      flash(`损耗对比失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const showPack = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const r = await api.getEvidencePack(id);
      setPack(r.pack);
      load();
    } catch (e) {
      flash(`生成证据包失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const copyPack = async () => {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack);
      flash('证据包已复制');
    } catch {
      flash('复制失败，请长按手动复制');
    }
  };

  if (state.status === 'loading') return <Loading text="正在加载订单…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const o = state.order;
  const doneN = o.steps.filter(s => s.done).length;

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">📋</div>
          <div>
            <div className="bname">{o.from} → {o.to}</div>
            <div className="bsub">{o.cargo} {o.wt}吨 · {ORDER_STATUS_LABEL[o.status]}</div>
          </div>
        </div>
      </header>

      {toast && (
        <div style={{ margin: '10px 12px 0', padding: 10, borderRadius: 10, background: 'rgba(249,115,22,.08)', color: '#ea580c', fontSize: 13, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* 基本信息 */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span className="tag tag-orange">{o.cargo}</span>
        <span className="tag tag-gray">{o.wt}吨</span>
        <span className="tag tag-gray">{o.truck}</span>
        <span className="tag tag-gray">{o.km}km</span>
        <span className="tag tag-gray">运费 {fmtMoney(o.price)}</span>
        <span className="tag tag-gray">货主 {o.owner}</span>
      </div>

      {/* 证据链 */}
      <div className="sec-hd">证据链（{doneN}/8）<span className="sec-n">拍照/签字为真机能力，此处模拟标记</span></div>
      <div className="card" style={{ padding: '6px 14px' }}>
        {o.steps.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(128,128,128,.06)' }}>
            <span style={{ fontSize: 16 }}>{s.icon}</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: s.done ? 700 : 400, color: s.done ? '#16a34a' : '#1c1c1e' }}>
              {s.label} {s.done ? '✓' : ''}
            </span>
            {!s.done && (
              <button className="btn-p" style={{ width: 'auto', padding: '5px 14px', fontSize: 12.5 }} onClick={() => markStep(s.id)} disabled={busy}>
                标记完成
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 损耗对比 */}
      <div className="sec-hd">损耗对比</div>
      <div className="card">
        {o.loss ? (
          <div
            style={{
              padding: 10, borderRadius: 10,
              background: o.loss.overLimit ? 'rgba(220,38,38,.06)' : 'rgba(22,163,74,.06)',
              color: o.loss.overLimit ? '#dc2626' : '#16a34a',
              fontSize: 13.5, fontWeight: 700, lineHeight: 1.6,
            }}
          >
            {o.loss.verdict}
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 400, color: '#6b6b6f' }}>
              装货 {o.loss.loadTons} 吨 → 卸货 {o.loss.unloadTons} 吨 ｜ 损耗 {o.loss.lossKg}kg（{o.loss.ratePerMille}‰）｜ 行业参考 ≤{o.loss.stdPerMille}‰
            </div>
          </div>
        ) : (
          <>
            <div className="two">
              <input className="inp" type="number" placeholder="装货重量（吨）" value={loadTons} onChange={e => setLoadTons(e.target.value)} />
              <input className="inp" type="number" placeholder="卸货重量（吨）" value={unloadTons} onChange={e => setUnloadTons(e.target.value)} />
            </div>
            <button className="btn-p" onClick={submitLoss} disabled={busy}>
              计算损耗
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: '#8a8a90' }}>
              参考标准：{o.cls} ≤ {o.cls === '农产品' ? 5 : o.cls === '冷藏' ? 10 : 2}‰（自然损耗司机无责）
            </div>
          </>
        )}
      </div>

      {/* 证据包 */}
      {o.loss && (
        <div style={{ margin: '0 12px 14px' }}>
          <button className="btn-p" onClick={showPack} disabled={busy}>
            {o.steps.find(s => s.id === 'w8')?.done ? '📁 查看证据包' : '📁 生成证据包'}
          </button>
        </div>
      )}

      {/* 证据包弹层 */}
      {pack && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 420, width: '100%', maxHeight: '78vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontWeight: 800, borderBottom: '1px solid rgba(128,128,128,.15)' }}>📁 运输证据包</div>
            <pre style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#1c1c1e' }}>{pack}</pre>
            <div style={{ display: 'flex', gap: 10, padding: 12 }}>
              <button className="btn-g" onClick={copyPack}>复制</button>
              <button className="btn-p" onClick={() => setPack(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
