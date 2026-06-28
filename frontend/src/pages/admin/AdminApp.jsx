import { BankOutlined, MenuFoldOutlined, MenuUnfoldOutlined, TeamOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppTopBar from '../../components/AppTopBar'
import CompaniesPage from './CompaniesPage'
import UsersPage from './UsersPage'

function AdminNavItem({ item, active, onClick, collapsed }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ padding: '2px 8px' }}>
      <button onClick={onClick} title={collapsed ? item.label : undefined}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 9,
          width: '100%', height: 36,
          padding: collapsed ? '0' : '0 10px',
          background: active ? 'rgba(255,255,255,0.12)' : hovered ? 'rgba(255,255,255,0.07)' : 'none',
          border: 'none', borderRadius: 6,
          cursor: 'pointer', transition: 'background 0.15s',
          color: active ? '#fff' : 'rgba(255,255,255,0.6)', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: collapsed ? 16 : 15, color: active ? '#fff' : 'rgba(255,255,255,0.45)' }}>{item.icon}</span>
        {!collapsed && <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 400 }}>{item.label}</span>}
      </button>
    </div>
  )
}

const TEAL     = '#0b9e94'
const SIDEBAR_FULL = 220
const SIDEBAR_MINI = 48

const NAV = [
  { key: 'companies', label: 'Companies', icon: <BankOutlined /> },
  { key: 'users',     label: 'Users',     icon: <TeamOutlined /> },
]

const PAGE_TITLES = {
  companies: 'Companies',
  users:     'Users',
}

const KEY_TO_PATH = { companies: '/admin/companies', users: '/admin/users' }
const PATH_TO_KEY = { '/admin/companies': 'companies', '/admin/users': 'users', '/admin': 'companies' }

export default function AdminApp({ session, onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const reactNavigate = useNavigate()
  const location      = useLocation()

  const page     = PATH_TO_KEY[location.pathname] ?? 'companies'
  const sidebarW = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarW, flexShrink: 0,
        background: '#2b3547',
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        transition: 'width 0.2s ease',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Logo row — logo or favicon */}
        <div style={{
          height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: collapsed ? '0' : '0 6px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {collapsed
            ? <img src="/favicon.svg" alt="F" style={{ width: 26, height: 26, objectFit: 'contain', userSelect: 'none' }} />
            : <img src="/logo.svg" alt="Filaminto" style={{ width: '100%', maxHeight: 44, objectFit: 'contain', userSelect: 'none', display: 'block' }} />
          }
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV.map(item => (
            <AdminNavItem key={item.key} item={item} active={page === item.key}
              onClick={() => reactNavigate(KEY_TO_PATH[item.key])} collapsed={collapsed} />
          ))}
        </nav>

        {/* Collapse toggle — bottom-right */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button onClick={() => setCollapsed(o => !o)} title={collapsed ? 'Expand' : 'Collapse'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {collapsed
              ? <MenuUnfoldOutlined style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }} />
              : <MenuFoldOutlined   style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }} />
            }
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <AppTopBar
          pageTitle={PAGE_TITLES[page]}
          session={session}
          onLogout={onLogout}
          roleBadge={{ label: 'Platform Admin', color: 'purple' }}
        />
        <main style={{ flex: 1, overflow: 'hidden', background: '#f4f5f7' }}>
          <div style={{ height: '100%', overflowY: 'auto' }}>
            {page === 'companies' && <CompaniesPage session={session} />}
            {page === 'users'     && <UsersPage session={session} />}
          </div>
        </main>
      </div>
    </div>
  )
}
