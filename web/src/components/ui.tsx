/**
 * 通用展示组件：加载 / 空 / 错误 / 评分环 / 货源卡片
 * 只做展示，不包含业务计算。
 */
import type { ReactNode } from 'react';
import type { ScoredCargo, ScoredCargoView } from '../api/types';
import { fmtMoney, fmtPerKm } from '../utils/format';

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="state-box">
      <div className="spinner" />
      <div className="t">{text}</div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box">
      <div className="ic">⚠️</div>
      <div className="t">{message}</div>
      {onRetry && (
        <button className="btn-g" style={{ maxWidth: 220, margin: '0 auto' }} onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = '🔍', text, action }: { icon?: string; text: string; action?: ReactNode }) {
  return (
    <div className="state-box">
      <div className="ic">{icon}</div>
      <div className="t">{text}</div>
      {action}
    </div>
  );
}

/** AI 综合评分环（纯展示） */
export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f97316' : '#dc2626';
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(${color} ${score * 3.6}deg, rgba(128,128,128,0.15) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size - 10, height: size - 10, borderRadius: '50%', background: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size / 3.2, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: size / 8, color: '#8a8a90' }}>分</span>
      </div>
    </div>
  );
}

/**
 * 货源卡片：净收益/每公里/AI 评分突出展示
 * 只渲染后端算好的字段，不做任何计算。
 */
export function CargoCard({
  item,
  onClick,
}: {
  item: ScoredCargo | ScoredCargoView;
  onClick?: () => void;
}) {
  const { cargo: c, cost, score } = item;
  const netColor = cost.netIncome >= 0 ? 'positive' : 'negative';
  const priceFlag = 'priceFlag' in item ? item.priceFlag : 'normal';
  const quoteNote = 'quoteNote' in item ? item.quoteNote : '';
  const badge = 'creditBadge' in item ? item.creditBadge : 'none';
  const blacklisted = 'blacklisted' in item ? item.blacklisted : false;
  return (
    <div
      className={`card ${item.isBackhaul ? 'ret' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', position: 'relative' }}
    >
      {item.isBackhaul && (
        <span
          style={{
            position: 'absolute', top: -9, left: 12,
            background: 'linear-gradient(135deg,#f97316,#fb923c)', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 10,
            boxShadow: '0 2px 6px rgba(249,115,22,.4)',
          }}
        >
          🔄 回程
        </span>
      )}
      {blacklisted && (
        <span
          style={{
            position: 'absolute', top: -9, right: 12,
            background: '#dc2626', color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 10,
          }}
        >
          ⚠ 黑名单货主
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 路线 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 900 }}>{c.from}</span>
            <span style={{ flex: 1, height: 2, borderTop: '2px dashed rgba(249,115,22,.5)', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)' }}>🚛</span>
            </span>
            <span style={{ fontSize: 17, fontWeight: 900 }}>{c.to}</span>
          </div>
          {/* 货物信息 */}
          <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span className="tag tag-orange">{c.cargo}</span>
            <span className="tag tag-gray">{c.wt}吨</span>
            <span className="tag tag-gray">{c.truck}</span>
            <span className="tag tag-gray">{c.km}km</span>
            <span className="tag tag-gray">装货 {c.pickup}</span>
            {badge === 'good' && <span className="tag tag-green">👍 靠谱</span>}
            {badge === 'mid' && <span className="tag" style={{ background: 'rgba(217,119,6,.1)', color: '#d97706', borderColor: 'rgba(217,119,6,.3)' }}>🟡 一般</span>}
            {badge === 'bad' && <span className="tag tag-red">⚠ 黑名单</span>}
            {priceFlag === 'low' && <span className="tag tag-red">⚠ 价格偏低</span>}
            {priceFlag === 'high' && <span className="tag tag-red">⚠ 价格异常高</span>}
          </div>
          {/* 费用三行：运费小、净收益大 */}
          <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: '1fr 1fr auto', alignItems: 'end', gap: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: '#8a8a90' }}>运费</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(c.price)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8a8a90' }}>预计成本</div>
              <div style={{ fontSize: 13, color: '#6b6b6f' }}>{fmtMoney(cost.totalCost)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#8a8a90', textAlign: 'right' }}>每公里</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', textAlign: 'right' }}>{fmtPerKm(cost.perKm)}</div>
            </div>
          </div>
          <div style={{ marginTop: 5, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#8a8a90' }}>预计净收益</span>
            <span className={`money ${netColor}`} style={{ fontSize: 21 }}>
              {cost.netIncome >= 0 ? '+' : ''}{fmtMoney(cost.netIncome)}
            </span>
          </div>
          {quoteNote && (
            <div style={{ marginTop: 4, fontSize: 10.5, color: '#8a8a90' }}>📊 {quoteNote}</div>
          )}
        </div>
        <ScoreRing score={score.total} />
      </div>
    </div>
  );
}
