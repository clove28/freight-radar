/**
 * AI 货运助手
 *
 * 不是聊天页面，是"任务式"决策助手：
 *   输入自然语言 → 后端解析条件 → 过滤 → 成本计算 → 评分 → TopN → AI 解释
 * 前端只提交文本、展示后端返回的推荐结果。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Recommendation } from '../api/types';
import { CargoCard, ErrorState, Loading } from '../components/ui';

const QUICK = [
  '帮我找明天回武汉的货',
  '哪一单最赚钱？',
  '帮我找回程货',
  '这单值得跑吗？',
];

type State =
  | { status: 'idle' }
  | { status: 'loading'; text: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: Recommendation; asked: string };

export default function Assistant() {
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const navigate = useNavigate();

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setInput(t);
    setState({ status: 'loading', text: t });
    api
      .askAssistant({ text: t })
      .then(result => setState({ status: 'ready', result, asked: t }))
      .catch(e => setState({ status: 'error', message: (e as Error).message }));
  };

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">🤖</div>
          <div>
            <div className="bname">AI 货运助手</div>
            <div className="bsub">说人话，我帮你算哪单值得跑</div>
          </div>
        </div>
      </header>

      {/* 快捷问题 */}
      <div className="sec-hd">快捷提问</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 12px 14px' }}>
        {QUICK.map(q => (
          <button
            key={q}
            onClick={() => ask(q)}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12,
              border: '1px solid rgba(249,115,22,.3)', background: 'rgba(249,115,22,.05)',
              color: '#1c1c1e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            💬 {q}
          </button>
        ))}
      </div>

      {/* 输入区 */}
      <div style={{ margin: '0 12px 14px' }}>
        <textarea
          className="inp"
          rows={2}
          placeholder="例如：我明天从广州回武汉，13米高栏，至少赚3000"
          value={input}
          onChange={e => setInput(e.target.value)}
          style={{ resize: 'none' }}
        />
        <button className="btn-p" style={{ marginTop: 8 }} onClick={() => ask(input)} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'AI 正在计算…' : '🤖 帮我找'}
        </button>
      </div>

      {/* 结果区 */}
      {state.status === 'loading' && <Loading text={`正在分析：${state.text}`} />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={() => ask(input)} />}

      {state.status === 'ready' && (
        <>
          <div className="sec-hd">
            🤖 AI 推荐<span className="sec-n">条件：{state.result.raw}</span>
          </div>

          {/* AI 解释 */}
          <div className="card" style={{ borderColor: 'rgba(249,115,22,.4)', background: 'rgba(249,115,22,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800 }}>AI 怎么说</span>
              {state.result.engine === 'deepseek' ? (
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
                    background: 'rgba(22,163,74,.12)', color: '#16a34a', border: '1px solid rgba(22,163,74,.3)',
                  }}
                >
                  🔴 DeepSeek·V4
                </span>
              ) : (
                <span
                  className="tag tag-gray"
                  style={{ fontSize: 10.5 }}
                >
                  ⚪ 规则引擎
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.8, color: '#374151' }}>{state.result.explanation}</div>
          </div>

          {/* 推荐列表 */}
          {state.result.scored.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: '#8a8a90', padding: 28 }}>
              暂时没有符合条件的货源
              <br />
              <button
                className="btn-g" style={{ marginTop: 12, width: 200, display: 'inline-block' }}
                onClick={() => navigate('/hall')}
              >
                调整筛选条件
              </button>
            </div>
          ) : (
            <div style={{ paddingTop: 2 }}>
              {state.result.scored.map(item => (
                <CargoCard key={item.cargo.id} item={item} onClick={() => navigate(`/cargos/${item.cargo.id}`)} />
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 11, color: '#8a8a90', padding: '0 24px 16px' }}>
            数字均由后端按你的车辆档案与油价计算，AI 不虚构货源和金额。
          </div>
        </>
      )}

      {/* P9 行情参考 */}
      <QuoteTable />
    </div>
  );
}

/**
 * P9 行情参考：各货类 × 里程 参考区间表
 * 数据全部来自后端 /api/quote（QuoteProvider），前端不复制任何行情计算。
 */
const QUOTE_CLASSES = ['农产品', '冷藏', '建材', '重货', '普货', '危化', '快递', '其他'] as const;
const QUOTE_KMS = [300, 800, 1500] as const;

function QuoteTable() {
  const [rows, setRows] = useState<Record<string, { low: number; high: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all(
      QUOTE_CLASSES.flatMap(cls =>
        QUOTE_KMS.map(async km => {
          const r = await api.getQuote(cls, km);
          return { key: `${cls}@${km}`, low: r.quote.low, high: r.quote.high };
        }),
      ),
    )
      .then(list => {
        if (!alive) return;
        const map: Record<string, { low: number; high: number }> = {};
        for (const item of list) map[item.key] = { low: item.low, high: item.high };
        setRows(map);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ marginTop: 4 }}>
      <div className="sec-hd">📊 行情参考（元/公里）</div>
      <div className="card" style={{ overflowX: 'auto', padding: '10px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8a8a90', fontSize: 12, padding: 10 }}>加载行情…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#8a8a90', textAlign: 'left' }}>
                <th style={{ padding: '5px 8px' }}>货类</th>
                {QUOTE_KMS.map(km => (
                  <th key={km} style={{ padding: '5px 8px', textAlign: 'right' }}>{km}km</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUOTE_CLASSES.map(cls => (
                <tr key={cls} style={{ borderTop: '1px solid rgba(128,128,128,.1)' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 700 }}>{cls}</td>
                  {QUOTE_KMS.map(km => {
                    const v = rows[`${cls}@${km}`];
                    return (
                      <td key={km} style={{ padding: '7px 8px', textAlign: 'right', color: '#6b6b6f' }}>
                        {v ? `${v.low}–${v.high}` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8, fontSize: 10.5, color: '#8a8a90' }}>
          规则估算区间，接真实货运价格指数后自动更新。
        </div>
      </div>
    </div>
  );
}
