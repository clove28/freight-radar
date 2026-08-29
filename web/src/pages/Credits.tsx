/**
 * 货主信用管理（P16）
 *
 * 列出全部货主信用档案（评分/好中差/黑名单/标签/备注），
 * 支持：为货主评价（👍 靠谱 +1 / 😐 一般 0 / 👎 不靠谱 −3 + 标签 + 备注）、移出黑名单。
 * 数据来自后端 /api/credits 与 /api/credits/rate、/api/credits/:owner/unblacklist。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Credit } from '../api/types';
import { EmptyState, ErrorState, Loading } from '../components/ui';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; credits: Credit[] };

const TAGS = ['按时装货', '运费准时结', '货好装', '装卸快', '临时改价', '货损扯皮', '装卸拖沓', '态度差', '压价', '找借口'];

/** 按评分排序 + 黑名单置顶 */
function sortCredits(credits: Credit[]): Credit[] {
  return [...credits].sort((a, b) => {
    if (a.blacklisted !== b.blacklisted) return a.blacklisted ? -1 : 1;
    return a.score - b.score;
  });
}

export default function Credits() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const navigate = useNavigate();
  // 评价弹窗
  const [rateOwner, setRateOwner] = useState('');
  const [rateLevel, setRateLevel] = useState<'good' | 'medium' | 'bad'>('good');
  const [rateTags, setRateTags] = useState<string[]>([]);
  const [rateComment, setRateComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api
      .listCredits()
      .then(credits => setState({ status: 'ready', credits: sortCredits(Object.values(credits)) }))
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  }, []);

  useEffect(load, [load]);

  const openRate = (owner: string) => {
    setRateOwner(owner);
    setRateLevel('good');
    setRateTags([]);
    setRateComment('');
  };

  const toggleTag = (t: string) => {
    setRateTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));
  };

  const submitRate = async () => {
    setBusy(true);
    try {
      await api.rateOwner(rateOwner, rateLevel, rateTags, rateComment.trim());
      flash(`已评价「${rateOwner}」`);
      setRateOwner('');
      load();
    } catch (e) {
      flash(`评价失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const unblack = async (owner: string) => {
    try {
      await api.unblacklistOwner(owner);
      flash(`已将「${owner}」移出黑名单`);
      load();
    } catch (e) {
      flash(`操作失败：${(e as Error).message}`);
    }
  };

  const badge = (c: Credit) =>
    c.blacklisted ? 'bad' : c.score >= 3 ? 'good' : c.total > 0 ? 'mid' : 'none';

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">🚫</div>
          <div>
            <div className="bname">货主信用</div>
            <div className="bsub">靠谱货主优先接，黑名单避坑</div>
          </div>
        </div>
      </header>

      {toast && (
        <div style={{ margin: '10px 12px 0', padding: 10, borderRadius: 10, background: 'rgba(249,115,22,.08)', color: '#ea580c', fontSize: 13, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      <div className="sec-hd">
        全部货主<span className="sec-n">{state.status === 'ready' ? `${state.credits.length} 位` : ''}</span>
        <button
          className="btn-g" style={{ marginLeft: 'auto', width: 'auto', padding: '5px 12px', fontSize: 12 }}
          onClick={() => navigate('/hall')}
        >
          去货源大厅
        </button>
      </div>

      {state.status === 'loading' && <Loading text="正在读取货主信用…" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
      {state.status === 'ready' && state.credits.length === 0 && (
        <EmptyState icon="🚫" text="还没有货主评价记录" action={<div style={{ fontSize: 12, color: '#8a8a90' }}>接单后可评价货主</div>} />
      )}
      {state.status === 'ready' &&
        state.credits.map(c => {
          const b = badge(c);
          return (
            <div
              key={c.owner}
              className="card"
              style={{
                borderColor: c.blacklisted ? 'rgba(220,38,38,.4)' : undefined,
                background: c.blacklisted ? 'rgba(220,38,38,.04)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{c.owner}</span>
                  {b === 'good' && <span className="tag tag-green">👍 靠谱</span>}
                  {b === 'mid' && <span className="tag" style={{ background: 'rgba(217,119,6,.1)', color: '#d97706' }}>🟡 一般</span>}
                  {b === 'bad' && <span className="tag tag-red">⚠ 黑名单</span>}
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: c.score >= 0 ? '#16a34a' : '#dc2626' }}>
                  {c.score}
                </div>
              </div>
              <div style={{ marginTop: 5, fontSize: 11.5, color: '#6b6b6f' }}>
                👍{c.good} · 😐{c.medium} · 👎{c.bad}（共 {c.total} 次）{c.total === 0 && '—— 暂无评价'}
              </div>
              {Object.keys(c.tags).length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(c.tags).slice(0, 6).map(([t, n]) => (
                    <span key={t} className="tag tag-gray">{t}×{n}</span>
                  ))}
                </div>
              )}
              {c.comments.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#8a8a90', lineHeight: 1.6 }}>
                  💬 {c.comments[c.comments.length - 1]}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn-g" style={{ flex: 1, width: 'auto', padding: '7px 0', fontSize: 12.5 }} onClick={() => openRate(c.owner)}>
                  ✍️ 评价
                </button>
                {c.blacklisted && (
                  <button className="btn-p" style={{ flex: 1, width: 'auto', padding: '7px 0', fontSize: 12.5 }} onClick={() => unblack(c.owner)}>
                    ✅ 移出黑名单
                  </button>
                )}
              </div>
            </div>
          );
        })}

      {/* 评价弹窗 */}
      {rateOwner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 400, width: '100%', padding: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>✍️ 评价「{rateOwner}」</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {([
                ['good', '👍 靠谱', '#16a34a'],
                ['medium', '😐 一般', '#d97706'],
                ['bad', '👎 不靠谱', '#dc2626'],
              ] as const).map(([lv, label, color]) => (
                <button
                  key={lv}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: rateLevel === lv ? `2px solid ${color}` : '1px solid rgba(128,128,128,.25)',
                    background: rateLevel === lv ? `${color}14` : '#fff', color: rateLevel === lv ? color : '#1c1c1e',
                  }}
                  onClick={() => setRateLevel(lv)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {TAGS.map(t => (
                <button
                  key={t}
                  className="tag-chip"
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: rateTags.includes(t) ? '1px solid #f97316' : '1px solid rgba(128,128,128,.25)',
                    background: rateTags.includes(t) ? 'rgba(249,115,22,.08)' : '#fff',
                    color: rateTags.includes(t) ? '#ea580c' : '#6b6b6f',
                  }}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <input className="inp" placeholder="备注（选填，如：少算120kg）" value={rateComment} onChange={e => setRateComment(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn-g" onClick={() => setRateOwner('')}>取消</button>
              <button className="btn-p" onClick={submitRate} disabled={busy}>
                {busy ? '提交中…' : '提交评价'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
