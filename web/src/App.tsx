/**
 * 应用骨架：路由 + 底部导航
 * 移动端底部导航：首页 / 找货 / 账本 / AI助手 / 订单 / 我的
 */
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LoadHall from './pages/LoadHall';
import LoadDetail from './pages/LoadDetail';
import Assistant from './pages/Assistant';
import Books from './pages/Books';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import VehiclePage from './pages/VehiclePage';
import Credits from './pages/Credits';
import PostCargo from './pages/PostCargo';
import Login from './pages/Login';

const NAV = [
  { to: '/', label: '首页', ic: '🏠', end: true },
  { to: '/hall', label: '找货', ic: '🚛', end: false },
  { to: '/books', label: '账本', ic: '💰', end: false },
  { to: '/assistant', label: '问一问', ic: '🔍', end: false },
  { to: '/orders', label: '订单', ic: '📋', end: false },
  { to: '/me', label: '我的', ic: '👤', end: false },
];

export default function App() {
  return (
    <div className="app-shell">
      <div className="page">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/hall" element={<LoadHall />} />
          <Route path="/cargos/:id" element={<LoadDetail />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/books" element={<Books />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/me" element={<VehiclePage />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/post" element={<PostCargo />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
      <nav className="bottom-nav">
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item ${isActive ? 'on' : ''}`}
          >
            <span className="ic">{n.ic}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
