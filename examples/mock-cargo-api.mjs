/**
 * 货运雷达 · 演示"真实货源 API"服务
 *
 * 用途：演示 ApiCargoRepository 全链路（P10）。
 * 模拟一个第三方货运数据源：返回与 Cargo 契约一致的真实格式货源，
 * 并支持故障注入（?fail=500 / ?fail=slow / ?fail=empty）以展示
 * 加载/超时/异常/空数据的处理。
 *
 * 运行：node examples/mock-cargo-api.mjs        （默认 4100 端口）
 * 对接：CARGO_SOURCE=api CARGO_API_URL=http://localhost:4100/api/cargos npm run dev
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4100);

// 与种子数据同构的货源（模拟第三方返回）
const CARGOES = [
  { id: 'EXT-1', from: '广州', to: '武汉', km: 1050, cargo: '日用百货', cls: '普货', wt: 28, truck: '13米高栏', price: 7600, pickup: '今天 08:00', owner: '外部货主A', phone: '13900000001', verified: true, pub: Date.now() - 3600e3, status: 'open' },
  { id: 'EXT-2', from: '临沂', to: '临汾', km: 640, cargo: '黄豆粕', cls: '农产品', wt: 30, truck: '13米高栏', price: 6200, pickup: '今天 10:00', owner: '外部货主B', phone: '13900000002', verified: true, pub: Date.now() - 7200e3, status: 'open' },
  { id: 'EXT-3', from: '武汉', to: '成都', km: 1100, cargo: '五金配件', cls: '普货', wt: 22, truck: '9.6米', price: 6900, pickup: '明天 07:30', owner: '外部货主C', phone: '13900000003', verified: false, pub: Date.now() - 5400e3, status: 'open' },
  { id: 'EXT-4', from: '郑州', to: '临汾', km: 370, cargo: '钢材', cls: '建材', wt: 28, truck: '13米高栏', price: 3200, pickup: '今天 14:00', owner: '外部货主D', phone: '13900000004', verified: true, pub: Date.now() - 1800e3, status: 'open' },
];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json');

  // 故障注入
  if (url.searchParams.get('fail') === '500') {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: '上游服务错误' }));
    return;
  }
  if (url.searchParams.get('fail') === 'slow') {
    setTimeout(() => {
      res.end(JSON.stringify({ data: CARGOES }));
    }, 15000); // 超过客户端 8s 超时 → 触发超时提示
    return;
  }
  if (url.searchParams.get('fail') === 'empty') {
    res.end(JSON.stringify({ data: [] }));
    return;
  }

  // 正常：返回 { data: [...] } 包裹（ApiCargoRepository 支持归一化）
  if (url.pathname === '/api/cargos') {
    res.end(JSON.stringify({ data: CARGOES }));
    return;
  }
  // 兼容直接数组
  if (url.pathname === '/api/cargos/raw') {
    res.end(JSON.stringify(CARGOES));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`📡 演示货源 API 已启动: http://localhost:${PORT}/api/cargos`);
  console.log(`   故障注入: ?fail=500 / ?fail=slow / ?fail=empty`);
  console.log(`   对接方式: CARGO_SOURCE=api CARGO_API_URL=http://localhost:${PORT}/api/cargos`);
});
