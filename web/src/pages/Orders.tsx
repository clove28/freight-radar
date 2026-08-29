/**
 * 订单页（P2 真实化）
 * 展示订单列表：路线/货物/状态/证据链进度。点击进入订单详情。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Order } from '../api/types';
import { ORDER_STATUS_LABEL } from '../api/types';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { fmtMoney } from '../utils/format';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; orders: Order[] };

export default function Orders() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const navigate = useNavigate();

  const load = () => {
    setState({ status: 'loading' });
    api
      .listOrders()
      .then(orders => setState({ status: 'ready', orders }))
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  useEffect(load, []);

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">📋</div>
          <div>
            <div className="bname">我的订单</div>
            <div className="bsub">运输记录与证据链</div>
          </div>
        </div>
      </header>

      {state.status === 'loading' && <Loading text="正在读取订单…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
      {state.status === 'ready' && state.orders.length === 0 && (
        <EmptyState
          icon="📋"
          text="暂时没有订单"
          action={
            <button className="btn-g" style={{ maxWidth: 220, margin: '0 auto' }} onClick={() => navigate('/hall')}>
              去货源大厅接单
            </button>
          }
        />
      )}
      {state.status === 'ready' &&
        state.orders.map(o => {
          const doneN = o.steps.filter(s => s.done).length;
          return (
            <div
              key={o.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/orders/${o.id}`)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{o.from} → {o.to}</span>
                <span
                  className="tag"
                  style={{
                    background: o.status === 'finished' ? 'rgba(22,163,74,.1)' : 'rgba(249,115,22,.1)',
                    color: o.status === 'finished' ? '#16a34a' : '#ea580c',
                    border: '1px solid currentColor',
                    fontWeight: 700,
                  }}
                >
                  {ORDER_STATUS_LABEL[o.status]}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#6b6b6f' }}>
                {o.cargo} {o.wt}吨 · {o.truck} · 运费 {fmtMoney(o.price)} · 货主 {o.owner}
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, display: 'flex', gap: 3 }}>
                  {o.steps.map(s => (
                    <span
                      key={s.id}
                      style={{
                        width: 14, height: 14, borderRadius: '50%',
                        background: s.done ? '#f97316' : 'rgba(128,128,128,.2)',
                        display: 'inline-block',
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: '#8a8a90' }}>证据链 {doneN}/8</span>
              </div>
              {o.loss && (
                <div
                  className="tag"
                  style={{
                    marginTop: 8,
                    background: o.loss.overLimit ? 'rgba(220,38,38,.08)' : 'rgba(22,163,74,.08)',
                    color: o.loss.overLimit ? '#dc2626' : '#16a34a',
                    border: '1px solid currentColor',
                  }}
                >
                  {o.loss.verdict}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
