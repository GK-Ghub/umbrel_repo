import { Outlet, NavLink } from 'react-router-dom';

const NAV = [
  { to: '/',          label: 'Home',      icon: '⌂' },
  { to: '/trips',     label: 'Trips',     icon: '🧳' },
  { to: '/plans',     label: 'Plans',     icon: '🗂' },
  { to: '/items',     label: 'Items',     icon: '📦' },
  { to: '/templates', label: 'Templates', icon: '🧩' },
  { to: '/search',    label: 'Search',    icon: '🔍' },
  { to: '/data',      label: 'Data',      icon: '💾' },
];

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, background: 'var(--bg2)', borderRight: '1px solid var(--border)', padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <div style={{ paddingLeft: 12, marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            Pack<span style={{ color: 'var(--text2)' }}>Tree</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>packing organiser</div>
        </div>
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 'var(--radius)',
              fontSize: 14, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              background: isActive ? 'rgba(110,231,183,0.08)' : 'transparent',
              textDecoration: 'none', transition: 'all .15s',
            })}>
            <span style={{ fontSize: 16 }}>{icon}</span>{label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
