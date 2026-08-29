/**
 * 收益账本（P12）
 *
 * 月度汇总（单数/运费/成本/净赚/绿通省钱）+ 记一笔表单（含 km 里程）+
 * 明细列表（倒序，km 缺失可补录，可删除）。
 * 数据全部来自后端 /api/books 与 /api/stats，页面不做业务计算。
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { BookEntry, StatsView } from '../api/types';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { fmtMoney, fmtNum } from '../utils/format';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; books: BookEntry[] };

/** 记账表单草稿 */
interface Draft {
  from: string;
  to: string;
  km: string;
  fee: string;
  fuel: string;
  toll: string;
  other: string;
  greenSave: string;
  note: string;
}

const EMPTY_DRAFT: Draft = { from: '', to: '', km: '', fee: '', fuel: '', toll: '', other: '', greenSave: '', note: '' };

export default function Books() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [stats, setStats] = useState<StatsView | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  // km 补录状态：{ 账目id: 输入值 }
  const [kmDraft, setKmDraft] = useState<Record<string, string>>({});

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .listBooks()
      .then(books => {
        setState({ status: 'ready', books });
        api.getStats().then(setStats).catch(() => setStats(null));
      })
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  }, []);

  useEffect(load, [load]);

  const patchDraft = (k: keyof Draft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  /** P13：进入编辑模式（表单填充） */
  const startEdit = (b: BookEntry) => {
    setDraft({
      from: b.from,
      to: b.to,
      km: b.km ? String(b.km) : '',
      fee: String(b.fee),
      fuel: String(b.fuel),
      toll: String(b.toll),
      other: String(b.other),
      greenSave: String(b.greenSave),
      note: b.note,
    });
    setEditingId(b.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!draft.from.trim() || !draft.to.trim()) {
      flash('请填写出发与目的城市');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        from: draft.from.trim(),
        to: draft.to.trim(),
        km: draft.km ? Number(draft.km) : undefined,
        fee: Number(draft.fee) || 0,
        fuel: Number(draft.fuel) || 0,
        toll: Number(draft.toll) || 0,
        other: Number(draft.other) || 0,
        greenSave: Number(draft.greenSave) || 0,
        note: draft.note.trim(),
      };
      if (editingId) {
        await api.updateBookFull(editingId, payload);
        flash('账目已更新');
      } else {
        await api.addBook(payload);
        flash('已记入账本');
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      load();
    } catch (e) {
      flash(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveKm = async (id: string) => {
    const km = Number(kmDraft[id]);
    if (!(km > 0)) {
      flash('请输入有效的里程');
      return;
    }
    try {
      await api.updateBook(id, { km });
      flash('里程已更新');
      load();
    } catch (e) {
      flash(`更新失败：${(e as Error).message}`);
    }
  };

  const del = async (id: string) => {
    try {
      await api.deleteBook(id);
      flash('已删除');
      load();
    } catch (e) {
      flash(`删除失败：${(e as Error).message}`);
    }
  };

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">💰</div>
          <div>
            <div className="bname">收益账本</div>
            <div className="bsub">每趟挣多少，一目了然</div>
          </div>
        </div>
      </header>

      {toast && (
        <div style={{ margin: '10px 12px 0', padding: 10, borderRadius: 10, background: 'rgba(249,115,22,.08)', color: '#ea580c', fontSize: 13, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* 月度汇总（P13：真实运费/成本/里程） */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '10px 12px 0' }}>
          {[
            { label: '本月单数', value: String(stats.monthly[stats.monthly.length - 1]?.orders ?? 0) },
            { label: '本月净赚', value: fmtNum(stats.monthIncome), color: stats.monthIncome >= 0 ? '#16a34a' : '#dc2626' },
            { label: '本月运费', value: fmtNum(stats.monthFee) },
            { label: '本月成本', value: fmtNum(stats.monthCost), color: '#6b6b6f' },
          ].map(s => (
            <div key={s.label} className="card" style={{ margin: 0, padding: '9px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#8a8a90' }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.color ?? '#1c1c1e' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
      {stats && stats.monthKm > 0 && (
        <div style={{ margin: '6px 12px 0', fontSize: 11, color: '#8a8a90', textAlign: 'center' }}>
          本月里程 {fmtNum(stats.monthKm)} km ｜ 平均每公里 {fmtNum(stats.avgPerKmAll)} 元
        </div>
      )}

      {/* 记一笔 / 打印导出 */}
      <div style={{ margin: '12px 12px 0', display: 'flex', gap: 8 }}>
        <button className="btn-p" style={{ flex: 1 }} onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); setShowForm(v => !v); }}>
          {showForm ? '✕ 收起' : '➕ 记一笔'}
        </button>
        <button className="btn-g" style={{ flex: 1 }} onClick={() => window.print()}>
          🖨️ 打印/存PDF
        </button>
      </div>
      {/* P15 导出报表 */}
      <div style={{ margin: '8px 12px 0', display: 'flex', gap: 8 }}>
        <button className="btn-g" style={{ flex: 1 }} onClick={() => api.exportBooksHtml()}>
          📄 导出HTML报表
        </button>
        <button className="btn-g" style={{ flex: 1 }} onClick={() => api.exportBooksCsv()}>
          📊 导出CSV
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginTop: 10, background: '#eceef1' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{editingId ? '✏️ 编辑账目' : '➕ 记一笔'}</div>
          <div className="two">
            <input className="inp" placeholder="出发城市" value={draft.from} onChange={e => patchDraft('from', e.target.value)} />
            <input className="inp" placeholder="目的城市" value={draft.to} onChange={e => patchDraft('to', e.target.value)} />
          </div>
          <div className="two">
            <input className="inp" type="number" placeholder="里程(km)" value={draft.km} onChange={e => patchDraft('km', e.target.value)} />
            <input className="inp" type="number" placeholder="运费(元)" value={draft.fee} onChange={e => patchDraft('fee', e.target.value)} />
          </div>
          <div className="two">
            <input className="inp" type="number" placeholder="油费(元)" value={draft.fuel} onChange={e => patchDraft('fuel', e.target.value)} />
            <input className="inp" type="number" placeholder="过路费(元)" value={draft.toll} onChange={e => patchDraft('toll', e.target.value)} />
          </div>
          <div className="two">
            <input className="inp" type="number" placeholder="食宿其他(元)" value={draft.other} onChange={e => patchDraft('other', e.target.value)} />
            <input className="inp" type="number" placeholder="绿通省钱(元)" value={draft.greenSave} onChange={e => patchDraft('greenSave', e.target.value)} />
          </div>
          <input className="inp" placeholder="备注（选填）" value={draft.note} onChange={e => patchDraft('note', e.target.value)} />
          <div style={{ marginTop: 8, fontSize: 11, color: '#8a8a90' }}>
            净赚 = 运费 −（油费+过路费+食宿其他）；填写里程后每公里收益才准确
          </div>
          <button className="btn-p" style={{ marginTop: 8 }} onClick={submit} disabled={busy}>
            {busy ? '保存中…' : editingId ? '💾 更新账目' : '💾 保存'}
          </button>
        </div>
      )}

      {/* 明细 */}
      <div className="sec-hd">明细<span className="sec-n">{state.status === 'ready' ? `${state.books.length} 笔` : ''}</span></div>

      {state.status === 'loading' && <Loading text="正在读取账本…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
      {state.status === 'ready' && state.books.length === 0 && (
        <EmptyState icon="💰" text="还没有记账" action={<div style={{ fontSize: 12, color: '#8a8a90' }}>点"记一笔"开始</div>} />
      )}
      {state.status === 'ready' &&
        state.books.map(b => {
          const income = b.fee - b.fuel - b.toll - b.other;
          return (
            <div key={b.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800 }}>{b.from} → {b.to}</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={`money ${income >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 16 }}>
                    {income >= 0 ? '+' : ''}{fmtMoney(income)}
                  </span>
                  <button
                    onClick={() => startEdit(b)}
                    style={{ background: 'none', border: 'none', color: '#f97316', fontSize: 14, cursor: 'pointer' }}
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => del(b.id)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 16, cursor: 'pointer' }}
                    title="删除"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: '#6b6b6f' }}>
                运费 {fmtNum(b.fee)} ｜ 油 {fmtNum(b.fuel)} ｜ 过路费 {fmtNum(b.toll)} ｜ 其他 {fmtNum(b.other)}
                {b.greenSave > 0 && <span style={{ color: '#16a34a' }}> ｜ 🌿省 {fmtNum(b.greenSave)}</span>}
              </div>
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#8a8a90' }}>
                {b.km ? (
                  <span>📏 {b.km}km{b.km > 0 && income !== 0 ? `（${fmtNum(income / b.km)} 元/km）` : ''}</span>
                ) : (
                  <>
                    <span>📏 里程未填</span>
                    <input
                      className="inp" type="number" placeholder="补录km"
                      style={{ width: 90, padding: '3px 8px', fontSize: 12 }}
                      value={kmDraft[b.id] ?? ''}
                      onChange={e => setKmDraft(d => ({ ...d, [b.id]: e.target.value }))}
                    />
                    <button className="btn-g" style={{ width: 'auto', padding: '3px 10px', fontSize: 11.5 }} onClick={() => saveKm(b.id)}>
                      保存
                    </button>
                  </>
                )}
                {b.note && <span>｜ {b.note}</span>}
              </div>
            </div>
          );
        })}
    </div>
  );
}
