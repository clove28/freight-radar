/**
 * 手动发单（P17 车队互助货源池）
 *
 * 车队/亲友手动录货源 → 后端 POST /api/cargos → 进入货源大厅，
 * 与其他货源一样走全套 成本/净收益/每公里/评分/回程标记/AI 推荐。
 * 零成本解决"没有真实货源 API"：大家互相发单，形成小圈子货源池。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const CLS_OPTIONS = ['普货', '农产品', '冷藏', '建材', '重货', '危化', '快递', '其他'] as const;
const TRUCKS = ['不限', '13米高栏', '13米平板', '9.6米', '6.8米', '4.2米', '17.5米平板', '厢式车'];

interface Draft {
  from: string;
  to: string;
  km: string;
  cargo: string;
  cls: string;
  wt: string;
  truck: string;
  price: string;
  pickup: string;
  owner: string;
  phone: string;
}

const EMPTY: Draft = { from: '', to: '', km: '', cargo: '', cls: '普货', wt: '', truck: '不限', price: '', pickup: '', owner: '', phone: '' };

export default function PostCargo() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const navigate = useNavigate();

  const patch = (k: keyof Draft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft.from.trim() || !draft.to.trim() || !draft.cargo.trim() || !draft.price) {
      setToast('请填写出发/目的/货物/运费');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setBusy(true);
    try {
      await api.addCargo({
        from: draft.from.trim(),
        to: draft.to.trim(),
        km: draft.km ? Number(draft.km) : undefined,
        cargo: draft.cargo.trim(),
        cls: draft.cls as never,
        wt: draft.wt ? Number(draft.wt) : undefined,
        truck: draft.truck,
        price: Number(draft.price),
        pickup: draft.pickup.trim() || undefined,
        owner: draft.owner.trim() || undefined,
        phone: draft.phone.trim() || undefined,
      });
      setToast('发货成功！该货源已在货源大厅接单池');
      setDraft(EMPTY);
      setTimeout(() => { setToast(''); navigate('/hall'); }, 1500);
    } catch (e) {
      setToast(`发货失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="topbar">
        <div className="brand">
          <div className="logo">📢</div>
          <div>
            <div className="bname">发单（车队互助）</div>
            <div className="bsub">有货就发进来，全套决策能力自动算</div>
          </div>
        </div>
      </header>

      {toast && (
        <div style={{ margin: '10px 12px 0', padding: 10, borderRadius: 10, background: 'rgba(22,163,74,.08)', color: '#16a34a', fontSize: 13, textAlign: 'center' }}>
          {toast}
        </div>
      )}

      <div className="sec-hd">线路与货物</div>
      <div className="card" style={{ background: '#eceef1' }}>
        <div className="two">
          <input className="inp" placeholder="出发城市" value={draft.from} onChange={e => patch('from', e.target.value)} />
          <input className="inp" placeholder="目的城市" value={draft.to} onChange={e => patch('to', e.target.value)} />
        </div>
        <div className="two">
          <input className="inp" type="number" placeholder="里程(km，可空)" value={draft.km} onChange={e => patch('km', e.target.value)} />
          <input className="inp" placeholder="货物名称（如 黄豆粕）" value={draft.cargo} onChange={e => patch('cargo', e.target.value)} />
        </div>
        <div className="two">
          <select className="inp" value={draft.cls} onChange={e => patch('cls', e.target.value)}>
            {CLS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="inp" type="number" placeholder="重量(吨)" value={draft.wt} onChange={e => patch('wt', e.target.value)} />
        </div>
      </div>

      <div className="sec-hd">车型与费用</div>
      <div className="card" style={{ background: '#eceef1' }}>
        <select className="inp" value={draft.truck} onChange={e => patch('truck', e.target.value)}>
          {TRUCKS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ marginTop: 8 }} />
        <input className="inp" type="number" placeholder="运费(元/趟) *" value={draft.price} onChange={e => patch('price', e.target.value)} />
        <div style={{ marginTop: 8 }} />
        <input className="inp" placeholder="装货时间（如 今天 15:00，可空=面议）" value={draft.pickup} onChange={e => patch('pickup', e.target.value)} />
      </div>

      <div className="sec-hd">货主信息（可空）</div>
      <div className="card" style={{ background: '#eceef1' }}>
        <div className="two">
          <input className="inp" placeholder="货主（默认 车队货主）" value={draft.owner} onChange={e => patch('owner', e.target.value)} />
          <input className="inp" placeholder="联系电话" value={draft.phone} onChange={e => patch('phone', e.target.value)} />
        </div>
      </div>

      <div style={{ margin: '0 12px 20px' }}>
        <button className="btn-p" onClick={submit} disabled={busy}>
          {busy ? '发送中…' : '📢 发布货源'}
        </button>
        <div style={{ marginTop: 10, fontSize: 11, color: '#8a8a90', textAlign: 'center', lineHeight: 1.7 }}>
          发布后自动进行成本/净收益/每公里/评分计算，并在货源大厅按 AI 推荐排序。
          <br />
          零成本：亲戚朋友谁有货就发，形成你们的车队货源池。
        </div>
      </div>
    </div>
  );
}
