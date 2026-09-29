/**
 * 登录 / 注册页（P7+P8+P9）
 * 支持：账号密码登录 / 手机号验证码登录（P8）/ 扫码登录（P9，模拟微信扫码流程）。
 * 需要 PERSIST=sqlite 模式。登录后 token 存 localStorage。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function useAuthToken() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('fr_token') ?? '');
  const save = (t: string) => {
    if (t) localStorage.setItem('fr_token', t);
    else localStorage.removeItem('fr_token');
    setToken(t);
  };
  return { token, save };
}

/** 简单"二维码"占位图（用 qrId 生成网格图案，仅演示视觉，非可扫真码） */
function QrGlyph({ qrId }: { qrId: string }) {
  const cells: boolean[] = [];
  for (let i = 0; i < 121; i++) {
    const c = qrId.charCodeAt(i % qrId.length) ?? 0;
    cells.push(((c >> (i % 8)) & 1) === 1);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 2, width: 168, height: 168, padding: 10, background: '#fff', borderRadius: 10 }}>
      {cells.map((on, i) => (
        <div key={i} style={{ background: on ? '#111' : '#fff', borderRadius: 1 }} />
      ))}
    </div>
  );
}

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register' | 'sms' | 'scan'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { save } = useAuthToken();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'sms') {
        if (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
          setError('请输入正确手机号和 6 位验证码');
          return;
        }
        const r = await api.smsLogin(phone, code);
        save(r.token);
        navigate('/');
        return;
      }
      if (!name.trim() || password.length < 6 || !/\d/.test(password)) {
        setError('请填写姓名；密码至少 6 位且需包含数字');
        return;
      }
      const r = mode === 'login'
        ? await api.login(name.trim(), password)
        : await api.register(name.trim(), password);
      if (mode === 'register') {
        // 注册成功后自动登录
        const lr = await api.login(name.trim(), password);
        save(lr.token);
        navigate('/');
        return;
      }
      save(r.token);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendSms = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确手机号');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.sendSmsCode(phone);
      setDevCode(r.devCode);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // P9 扫码状态
  const [qrId, setQrId] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'pending' | 'approved' | 'expired'>('idle');
  const [scanHint, setScanHint] = useState('');

  const startScan = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.scanCreate();
      setQrId(r.qrId);
      setScanStatus('pending');
      setScanHint('请用"手机端"扫码确认（演示：点下方按钮模拟手机确认）');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (mode !== 'scan' || scanStatus !== 'pending' || !qrId) return;
    const timer = setInterval(async () => {
      try {
        const s = await api.scanStatus(qrId);
        if (s.status === 'approved' && s.token) {
          setScanStatus('approved');
          setScanHint('扫码成功，正在登录…');
          save(s.token);
          navigate('/');
          return;
        }
        if (s.status === 'expired') {
          setScanStatus('expired');
          setScanHint('二维码已过期，请刷新');
        }
      } catch {
        /* 轮询失败忽略，下轮重试 */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [mode, scanStatus, qrId, save, navigate]);

  const simulateApprove = async () => {
    if (!qrId) return;
    try {
      const r = await api.scanApprove(qrId);
      if (r.status === 'approved') setScanHint('已确认，等待页面登录…');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div
      style={{
        minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 28px', background: 'linear-gradient(160deg,#1f2937,#111827)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🚛</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>货运雷达</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>
          帮你判断哪一单值得跑
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 18, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
        {/* 模式切换 */}
        <div style={{ display: 'flex', background: '#eceef1', borderRadius: 12, padding: 4, marginBottom: 18 }}>
          {([
            ['login', '密码登录'],
            ['sms', '手机号'],
            ['scan', '扫码'],
            ['register', '注册'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); setDevCode(''); setScanStatus('idle'); }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer',
                border: 'none', background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#ea580c' : '#6b6b6f', boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,.1)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'scan' ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              {scanStatus === 'idle' ? (
                <>
                  <div style={{ fontSize: 13.5, color: '#6b6b6f', marginBottom: 14 }}>
                    用手机 App / 微信扫码登录
                  </div>
                  <button className="btn-p" onClick={startScan} disabled={busy}>
                    📱 生成登录二维码
                  </button>
                  <div style={{ marginTop: 10, fontSize: 11, color: '#8a8a90' }}>
                    演示环境：二维码为占位图案，流程与真实扫码一致
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <QrGlyph qrId={qrId} />
                  </div>
                  <div style={{ fontSize: 13.5, color: '#1c1c1e', marginBottom: 12 }}>{scanHint}</div>
                  {scanStatus === 'pending' && (
                    <>
                      <button className="btn-g" onClick={simulateApprove} style={{ marginBottom: 8 }}>
                        📲 模拟手机端确认登录
                      </button>
                      <button
                        onClick={startScan}
                        style={{ background: 'none', border: 'none', color: '#8a8a90', fontSize: 12, cursor: 'pointer' }}
                      >
                        🔄 刷新二维码
                      </button>
                    </>
                  )}
                  {scanStatus === 'expired' && (
                    <button className="btn-p" onClick={startScan}>🔄 重新生成</button>
                  )}
                </>
              )}
            </div>
          ) : mode === 'sms' ? (
            <>
              <input
                className="inp" placeholder="手机号（如 13800000000）"
                value={phone} onChange={e => setPhone(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="inp" placeholder="6 位验证码"
                  value={code} onChange={e => setCode(e.target.value)}
                />
                <button
                  className="btn-g" style={{ width: 'auto', padding: '0 16px', fontSize: 13 }}
                  onClick={sendSms} disabled={busy}
                >
                  获取验证码
                </button>
              </div>
              {devCode && (
                <div style={{ padding: 9, borderRadius: 8, background: 'rgba(22,163,74,.08)', color: '#16a34a', fontSize: 12.5, textAlign: 'center' }}>
                  演示环境验证码：<b>{devCode}</b>（生产环境通过短信发送，不在此显示）
                </div>
              )}
            </>
          ) : (
            <>
              <input
                className="inp" placeholder="司机姓名（如：老爸）"
                value={name} onChange={e => setName(e.target.value)}
              />
              <input
                className="inp" type="password" placeholder="密码（至少 6 位，含数字）"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
            </>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 9, borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 12.5, textAlign: 'center' }}>
            {error}
          </div>
        )}

        {mode !== 'scan' && (
          <button className="btn-p" style={{ marginTop: 16 }} onClick={submit} disabled={busy}>
            {busy ? '处理中…' : mode === 'sms' ? '📱 验证码登录' : mode === 'login' ? '🚛 登录' : '🚛 注册并登录'}
          </button>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: '#8a8a90', textAlign: 'center', lineHeight: 1.7 }}>
          首次使用请先"注册"或手机号登录，创建自己的司机账号。
          <br />
          每个账号的车辆档案、回程城市、收益记录相互独立。
        </div>
      </div>

      {/* 免登录演示入口 */}
      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: 16, background: 'transparent', border: '1px solid rgba(255,255,255,.25)',
          color: 'rgba(255,255,255,.75)', borderRadius: 12, padding: '11px 0', fontSize: 13.5, cursor: 'pointer',
        }}
      >
        跳过登录，先用演示数据看看 →
      </button>
    </div>
  );
}

