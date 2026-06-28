import {
  ApartmentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppTopBar     from '../components/AppTopBar'
import ErrorBoundary from '../components/ErrorBoundary'

const CustomersApp       = lazy(() => import('./desktop/apps/CustomersApp'))
const DashboardApp       = lazy(() => import('./desktop/apps/DashboardApp'))
const GeneralSetupApp    = lazy(() => import('./desktop/apps/GeneralSetupApp'))
const OrdersApp          = lazy(() => import('./desktop/apps/OrdersApp'))
const PlaceholderApp     = lazy(() => import('./desktop/apps/PlaceholderApp'))
const PlanningBoardApp   = lazy(() => import('./desktop/apps/PlanningBoardApp'))
const ProcessesApp       = lazy(() => import('./desktop/apps/ProcessesApp'))
const ProductsApp        = lazy(() => import('./desktop/apps/ProductsApp'))
const UserManagementApp  = lazy(() => import('./desktop/apps/UserManagementApp'))

// ── Constants ──────────────────────────────────────────────────────────────────
const SIDEBAR_FULL = 220
const SIDEBAR_MINI = 48
const TEAL         = '#0b9e94'
const TEAL_DIM     = 'rgba(11,158,148,0.15)'

// ── Module registry ────────────────────────────────────────────────────────────
const MODULES = {
  dashboard:         (p) => <DashboardApp {...p} />,
  customers:         (p) => <CustomersApp {...p} />,
  styles:            (p) => <ProductsApp {...p} />,
  orders:            (p) => <OrdersApp {...p} />,
  planning:          (p) => <PlanningBoardApp {...p} />,
  'setup-general':   (p) => <GeneralSetupApp {...p} />,
  'setup-processes': (p) => <ProcessesApp {...p} />,
  'setup-routes':    (p) => <PlaceholderApp {...p} title="Routes" />,
  'setup-locations': (p) => <PlaceholderApp {...p} title="Locations" />,
  'setup-users':     (p) => <UserManagementApp {...p} />,
}

const PAGE_TITLE = {
  dashboard:         'Dashboard',
  customers:         'Customers',
  styles:            'Styles',
  orders:            'Orders',
  planning:          'Planning Board',
  'setup-general':   'Setup — General',
  'setup-processes': 'Setup — Processes',
  'setup-routes':    'Setup — Routes',
  'setup-locations': 'Setup — Locations',
  'setup-users':     'Setup — User Management',
}

// ── Path ↔ key maps ────────────────────────────────────────────────────────────
const KEY_TO_PATH = {
  dashboard:         '/dashboard',
  customers:         '/customers',
  styles:            '/styles',
  orders:            '/orders',
  planning:          '/planning',
  'setup-general':   '/setup/general',
  'setup-processes': '/setup/processes',
  'setup-routes':    '/setup/routes',
  'setup-locations': '/setup/locations',
  'setup-users':     '/setup/users',
}
const PATH_TO_KEY = Object.fromEntries(Object.entries(KEY_TO_PATH).map(([k, v]) => [v, k]))

// ── Nav structure ──────────────────────────────────────────────────────────────
const NAV_MAIN = [
  { key: 'dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
]
const NAV_CORE = [
  { key: 'customers', label: 'Customers', icon: <TeamOutlined /> },
  { key: 'styles',    label: 'Styles',    icon: <TagOutlined /> },
  { key: 'orders',    label: 'Orders',    icon: <ShoppingCartOutlined /> },
  { key: 'planning',  label: 'Planning',  icon: <CalendarOutlined /> },
]
const NAV_SETUP = [
  { key: 'setup-general',   label: 'General',         icon: <AppstoreOutlined /> },
  { key: 'setup-processes', label: 'Processes',       icon: <SettingOutlined /> },
  { key: 'setup-routes',    label: 'Routes',          icon: <ApartmentOutlined /> },
  { key: 'setup-locations', label: 'Locations',       icon: <EnvironmentOutlined /> },
  { key: 'setup-users',     label: 'User Management', icon: <UsergroupAddOutlined /> },
]

// ── Permission helpers ─────────────────────────────────────────────────────────

// Maps nav key → module_permissions key used in session.perms
const MODULE_PERM = {
  customers:         'customers',
  styles:            'products',
  orders:            'orders',
  planning:          'planning',
  'setup-general':   'setup',
  'setup-processes': 'setup',
  'setup-routes':    'setup',
  'setup-locations': 'setup',
}

// Returns true if the user can READ the given nav key
// Admins always have full access. Dashboard is always visible.
function hasReadAccess(key, perms, isAdmin) {
  if (isAdmin) return true
  if (key === 'setup-users') return false        // admin only
  const mod = MODULE_PERM[key]
  if (!mod) return true                          // dashboard — always visible
  return (perms?.[mod] || '').includes('r')
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export default function AppShell({ session, onLogout, onSessionUpdate }) {
  const [collapsed, setCollapsed] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const reactNavigate = useNavigate()
  const location      = useLocation()

  // Derive active key from current URL path
  const activeKey  = PATH_TO_KEY[location.pathname] ?? 'dashboard'
  const ActiveComp = MODULES[activeKey]
  const sidebarW   = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL
  const isAdmin    = session.roles?.includes('admin') || session.role === 'admin'
  const perms      = session.perms || {}

  // Visible nav items filtered by permission
  const visibleCoreItems  = NAV_CORE.filter(item => hasReadAccess(item.key, perms, isAdmin))
  const visibleSetupItems = NAV_SETUP.filter(
    item => hasReadAccess(item.key, perms, isAdmin) && (item.key !== 'setup-users' || isAdmin)
  )

  // Whether Setup section should be shown at all
  const hasAnySetupAccess = isAdmin || NAV_SETUP.some(
    item => item.key !== 'setup-users' && hasReadAccess(item.key, perms, isAdmin)
  )

  // Redirect bare / to /dashboard; also redirect if user lacks access to current route
  useEffect(() => {
    if (location.pathname === '/') {
      reactNavigate('/dashboard', { replace: true })
      return
    }
    if (activeKey !== 'dashboard' && !hasReadAccess(activeKey, perms, isAdmin)) {
      reactNavigate('/dashboard', { replace: true })
    }
  }, [location.pathname]) // eslint-disable-line

  // Auto-open setup accordion when on a setup route
  useEffect(() => {
    if (activeKey.startsWith('setup-')) setSetupOpen(true)
  }, [activeKey])

  function navigate(key) {
    reactNavigate(KEY_TO_PATH[key] ?? '/dashboard')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarW, flexShrink: 0,
        background: '#343435f2',
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        transition: 'width 0.2s ease',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>

        {/* Logo row — logo when expanded, favicon when collapsed */}
        <div style={{
          height: 44, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: collapsed ? '0' : '0 6px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {collapsed ? (
            <img src="/favicon.svg" alt="F"
              style={{ width: 26, height: 26, objectFit: 'contain', userSelect: 'none' }} />
          ) : (
            <img src="/logo.svg" alt="Filaminto"
              style={{ width: '100%', maxHeight: 60, objectFit: 'contain', userSelect: 'none', display: 'block' }} />
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '4px 0', overflowY: 'auto', overflowX: 'hidden' }}>

          {NAV_MAIN.map(item => (
            <NavItem key={item.key} item={item}
              active={activeKey === item.key}
              onClick={() => navigate(item.key)}
              collapsed={collapsed}
            />
          ))}

          {visibleCoreItems.length > 0 && (
            collapsed ? <Spacer /> : <SectionLabel>Core Data</SectionLabel>
          )}
          {visibleCoreItems.map(item => (
            <NavItem key={item.key} item={item}
              active={activeKey === item.key}
              onClick={() => navigate(item.key)}
              collapsed={collapsed}
            />
          ))}

          {hasAnySetupAccess && (collapsed ? <Spacer /> : <SectionLabel>Setup</SectionLabel>)}

          {hasAnySetupAccess && collapsed ? (
            <NavItem
              item={{ key: 'setup', label: 'Setup', icon: <SettingOutlined /> }}
              active={activeKey.startsWith('setup-')}
              onClick={() => { setCollapsed(false); setSetupOpen(true) }}
              collapsed
            />
          ) : hasAnySetupAccess ? (
            <>
              <div style={{ padding: '2px 8px' }}>
              <button
                onClick={() => setSetupOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 10px',
                  background: activeKey.startsWith('setup-') ? 'rgba(255,255,255,0.12)' : 'none',
                  border: 'none', borderRadius: 6,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.15s',
                  color: activeKey.startsWith('setup-') ? '#fff' : 'rgba(255,255,255,0.6)',
                }}
                onMouseEnter={(e) => { if (!activeKey.startsWith('setup-')) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={(e) => { if (!activeKey.startsWith('setup-')) e.currentTarget.style.background = 'none' }}
              >
                <SettingOutlined style={{ fontSize: 15, color: activeKey.startsWith('setup-') ? '#fff' : 'rgba(255,255,255,0.45)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: activeKey.startsWith('setup-') ? 600 : 400 }}>Setup</span>
                <span style={{
                  fontSize: 12, color: 'rgba(255,255,255,0.3)',
                  transform: setupOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1,
                }}>›</span>
              </button>
              </div>
              {setupOpen && visibleSetupItems.map(item => (
                <NavItem key={item.key} item={item}
                  active={activeKey === item.key}
                  onClick={() => navigate(item.key)}
                  indent
                />
              ))}
            </>
          ) : null}

        </nav>

        {/* Collapse toggle — bottom-right corner */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          padding: '6px 8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setCollapsed(o => !o)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={sideIconBtn}
          >
            {collapsed
              ? <MenuUnfoldOutlined style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }} />
              : <MenuFoldOutlined   style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }} />
            }
          </button>
        </div>

      </aside>

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        <AppTopBar
          pageTitle={PAGE_TITLE[activeKey] || 'Dashboard'}
          session={session}
          onLogout={onLogout}
          onSessionUpdate={onSessionUpdate}
        />

        {/* Content area — full page, no overlay */}
        <main style={{ flex: 1, overflow: 'hidden', background: '#f4f5f7' }}>
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <ErrorBoundary key={activeKey}>
              <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#aaa', fontSize: 13 }}>
                  Loading...
                </div>
              }>
                {ActiveComp && <ActiveComp session={session} onLogout={onLogout} onSessionUpdate={onSessionUpdate} />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function NavItem({ item, active, onClick, indent = false, collapsed = false }) {
  const [hovered, setHovered] = useState(false)

  if (collapsed) {
    return (
      <div style={{ padding: '1px 6px' }}>
        <button
          onClick={onClick}
          title={item.label}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: 34,
            background: active ? 'rgba(255,255,255,0.12)' : hovered ? 'rgba(255,255,255,0.07)' : 'none',
            border: 'none', borderRadius: 6,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <span style={{ fontSize: 16, color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}>
            {item.icon}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '1px 8px' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', padding: indent ? '6px 10px 6px 28px' : '6px 10px',
          background: active ? 'rgba(255,255,255,0.12)' : hovered ? 'rgba(255,255,255,0.07)' : 'none',
          border: 'none', borderRadius: 6,
          cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s',
          color: active ? '#fff' : 'rgba(255,255,255,0.6)',
        }}
      >
        <span style={{ fontSize: 15, color: active ? '#fff' : 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
          {item.icon}
        </span>
        <span style={{ fontSize: indent ? 12.5 : 13.5, fontWeight: active ? 600 : 400 }}>
          {item.label}
        </span>
      </button>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      padding: '10px 16px 2px',
      fontSize: 10.5, fontWeight: 700,
      color: 'rgba(255,255,255,0.35)',
      letterSpacing: 0.9, textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function Spacer() {
  return <div style={{ height: 6 }} />
}

// ── Styles ─────────────────────────────────────────────────────────────────────


const sideIconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  width: 32, height: 32, borderRadius: 6,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s',
  flexShrink: 0,
}

