/**
 * API 客户端
 *
 * 前端唯一的网络出口：所有页面通过这里的函数请求后端，
 * 不在组件里直接写 fetch，也不在页面里复制任何计算公式。
 */
import type {
  AssistantRequest,
  AuthResponse,
  CargoQuery,
  Credit,
  DashboardView,
  DriverAccount,
  DriverListResponse,
  DriverPrefs,
  EvidencePackResponse,
  ExplainResponse,
  HistoryInsights,
  Order,
  Recommendation,
  RouteEnvironment,
  RouteCompare,
  RouteStrategy,
  ScoredCargoView,
  StatsView,
  PagedCargos,
  ServiceFeeBalance,
  CargoFeedback,
  Vehicle,
} from './types';

const BASE = '/api';
/** 请求超时（毫秒）：防止接口挂起时页面一直 Loading */
const TIMEOUT_MS = 10_000;

/** 带超时与错误归一化的 fetch 封装（P8：自动附加登录 token） */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  // 自动带 Authorization（除登录/注册接口）
  const token = localStorage.getItem('fr_token');
  const isAuthEndpoint = path.startsWith('/auth/');
  const headers = new Headers(init?.headers);
  if (token && !isAuthEndpoint) headers.set('Authorization', `Bearer ${token}`);
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') throw new Error('请求超时，请检查网络后重试');
    throw new Error(`网络错误：${(e as Error).message}`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败(${res.status})`);
  }
  return res.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const api = {
  getDashboard: () => get<DashboardView>('/dashboard'),

  listCargos: (q: CargoQuery = {}) => {
    const p = new URLSearchParams();
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.cargo) p.set('cargo', q.cargo);
    if (q.truck) p.set('truck', q.truck);
    if (q.maxKm !== undefined) p.set('maxKm', String(q.maxKm));
    if (q.minPerKm !== undefined) p.set('minPerKm', String(q.minPerKm));
    if (q.minNetIncome !== undefined) p.set('minNetIncome', String(q.minNetIncome));
    if (q.backhaulOnly) p.set('backhaulOnly', '1');
    if (q.topN !== undefined) p.set('topN', String(q.topN));
    if (q.page !== undefined) p.set('page', String(q.page));
    if (q.limit !== undefined) p.set('limit', String(q.limit));
    p.set('sort', q.sort ?? 'ai');
    // 带分页参数时返回分页对象，否则数组（兼容）
    return get<ScoredCargoView[] | PagedCargos>(`/cargos?${p.toString()}`);
  },

  getCargo: (id: string) => get<ScoredCargoView>(`/cargos/${id}`),

  /** P17 手动发单 */
  addCargo: (c: Partial<import('./types').Cargo>) => post<import('./types').Cargo>('/cargos', c),

  getCargoExplain: (id: string) => get<ExplainResponse>(`/cargos/${id}/explain`),

  askAssistant: (req: AssistantRequest) => post<Recommendation>('/assistant', req),

  getVehicle: () => get<Vehicle>('/vehicle'),

  updateVehicle: (v: Vehicle) => put<Vehicle>('/vehicle', v),

  // P2 订单
  listOrders: () => get<Order[]>('/orders'),
  getOrder: (id: string) => get<Order>(`/orders/${id}`),
  acceptLoad: (loadId: string) => post<Order>('/orders', { loadId }),
  completeStep: (id: string, stepId: string) => post<Order>(`/orders/${id}/steps/${stepId}`, {}),
  doLoss: (id: string, loadTons: number, unloadTons: number) =>
    post<Order>(`/orders/${id}/loss`, { loadTons, unloadTons }),
  getEvidencePack: (id: string) => get<EvidencePackResponse>(`/orders/${id}/pack`),

  // P2 底线偏好
  getPrefs: () => get<DriverPrefs>('/prefs'),
  updatePrefs: (p: DriverPrefs) => put<DriverPrefs>('/prefs', p),

  // P3 货主信用
  listCredits: () => get<Record<string, Credit>>('/credits'),
  rateOwner: (owner: string, level: 'good' | 'medium' | 'bad', tags?: string[], comment?: string) =>
    post<Credit>('/credits/rate', { owner, level, tags, comment }),
  unblacklistOwner: (owner: string) => post<Credit>(`/credits/${encodeURIComponent(owner)}/unblacklist`, {}),

  // P3 历史画像
  getHistory: () => get<HistoryInsights>('/history'),

  // P10 数据统计
  getStats: () => get<StatsView>('/stats'),

  // P11 记账与导出
  listBooks: () => get<import('./types').BookEntry[]>('/books'),
  addBook: (b: Omit<import('./types').BookEntry, 'id' | 'ts'>) =>
    post<import('./types').BookEntry>('/books', b),
  updateBook: (id: string, patch: Partial<import('./types').BookEntry>) =>
    request<import('./types').BookEntry>(`/books/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  updateBookFull: (id: string, b: Omit<import('./types').BookEntry, 'id' | 'ts'>) =>
    request<import('./types').BookEntry>(`/books/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    }),
  deleteBook: (id: string) =>
    request<{ ok: boolean }>(`/books/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** 导出 CSV：直接触发浏览器下载 */
  exportBooksCsv: () => {
    const a = document.createElement('a');
    a.href = `${BASE}/export/books.csv`;
    a.download = 'freight-radar-books.csv';
    a.click();
  },
  /** P15 导出 HTML 报表（浏览器打开可打印/存 PDF） */
  exportBooksHtml: () => {
    const a = document.createElement('a');
    a.href = `${BASE}/export/books.html`;
    a.download = 'freight-radar-report.html';
    a.click();
  },

  // P4 路线环境
  getRouteEnvironment: (from: string, to: string, strategy: RouteStrategy = 'highway') =>
    get<RouteEnvironment>(`/route/environment?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&strategy=${strategy}`),
  getRouteCompare: (from: string, to: string) =>
    get<RouteCompare>(`/route/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // P6 多司机
  listDrivers: () => get<DriverListResponse>('/drivers'),
  createDriver: (name: string) => post<DriverAccount>('/drivers', { name }),
  switchDriver: (id: string) => post<DriverAccount>(`/drivers/${encodeURIComponent(id)}/switch`, {}),

  // P7 登录鉴权
  register: (name: string, password: string) => post<AuthResponse>('/auth/register', { name, password }),
  login: (name: string, password: string) => post<AuthResponse>('/auth/login', { name, password }),
  me: (token: string) =>
    request<{ driver: DriverAccount }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) =>
    request<{ ok: boolean }>('/auth/logout', { headers: { Authorization: `Bearer ${token}` } }),

  // P8 手机号登录
  sendSmsCode: (phone: string) => post<{ ok: boolean; devCode: string; note?: string }>('/auth/sms/send', { phone }),
  smsLogin: (phone: string, code: string) => post<AuthResponse>('/auth/sms/login', { phone, code }),

  // P9 扫码登录
  scanCreate: () => post<{ qrId: string; ttlSeconds: number }>('/auth/scan/create', {}),
  scanStatus: (qrId: string) =>
    get<{ status: 'pending' | 'approved' | 'expired'; token: string | null; driver: DriverAccount | null }>(
      `/auth/scan/status?qrId=${encodeURIComponent(qrId)}`,
    ),
  scanApprove: (qrId: string) => post<{ status: string; token: string | null }>('/auth/scan/approve', { qrId }),

  // P7 行情
  getQuote: (cls: string, km: number) =>
    get<{ cls: string; km: number; quote: { low: number; high: number; note: string } }>(
      `/quote?cls=${encodeURIComponent(cls)}&km=${km}`,
    ),

  // P8 多端同步
  syncUpload: (payload: { orders?: unknown[]; credits?: Record<string, unknown>; books?: unknown[] }) =>
    post<{ ok: boolean; saved: number }>('/sync/upload', payload),
  syncDownload: () => get<Record<string, unknown>>('/sync/download'),

  // P1 平台服务费（虚拟额度）
  getServiceFeeBalance: () => get<ServiceFeeBalance>('/service-fee/balance'),
  rechargeServiceFee: () => post<ServiceFeeBalance>('/service-fee/recharge', {}),

  // P1 结构化卡友反馈
  listCargoFeedback: (id: string) => get<CargoFeedback[]>(`/cargos/${encodeURIComponent(id)}/feedback`),
  submitCargoFeedback: (id: string, input: Partial<CargoFeedback>) =>
    post<CargoFeedback>(`/cargos/${encodeURIComponent(id)}/feedback`, input),
};
