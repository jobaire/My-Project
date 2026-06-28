import {
  ShoppingCartOutlined,
  TagOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Spin } from 'antd'
import { useEffect, useState } from 'react'
import { fetchDashboardStats } from '../../../services/dashboard'

const BRAND = '#0b5e57'

const ACTION_COLOR = { create: '#16a34a', update: '#2563eb', delete: '#dc2626', reorder: '#d97706' }
const ACTION_PAST  = { create: 'created', update: 'updated', delete: 'deleted', reorder: 'reordered' }
const ENTITY_LABEL = {
  customers:           'customer',
  products:            'style',
  style_versions:      'version',
  style_version_steps: 'routing step',
  brands:              'brand',
  product_color_sizes: 'color-size',
  processes:           'process',
  colors:              'color',
  sizes:               'size',
  orders:              'order',
  order_lines:         'order line',
}

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24)    return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function StatCard({ label, value, icon, color, loading, note }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '24px 26px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ color, fontSize: 20, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 36, fontWeight: 800, color: '#111', lineHeight: 1 }}>
        {loading ? <span style={{ color: '#ddd' }}>—</span> : (value ?? 0)}
      </div>
      <div style={{ fontSize: 13, color: '#666', fontWeight: 500, marginTop: 8 }}>{label}</div>
      {note && <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>{note}</div>}
    </div>
  )
}

export default function DashboardApp({ session }) {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats(session.access_token)
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session.access_token])

  const activity = stats?.recent_activity ?? []

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>
          Dashboard
        </div>
        <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
          Good {greeting()}, {session.full_name?.split(' ')[0] || session.email?.split('@')[0]}
          <span style={{ marginLeft: 8, color: '#ccc' }}>·</span>
          <span style={{ marginLeft: 8, color: '#aaa' }}>{session.tenant_name}</span>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 28 }}>
        <StatCard
          label="Customers"
          value={stats?.customers}
          icon={<TeamOutlined />}
          color={BRAND}
          loading={loading}
        />
        <StatCard
          label="Active Styles"
          value={stats?.products}
          icon={<TagOutlined />}
          color="#7c3aed"
          loading={loading}
        />
        <StatCard
          label="Open Orders"
          value={stats?.orders ?? '—'}
          icon={<ShoppingCartOutlined />}
          color="#d97706"
          loading={loading}
        />
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>

        {/* Recent Activity */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '22px 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 18 }}>
            Recent Activity
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}><Spin size="small" /></div>
          ) : !activity.length ? (
            <div style={{ fontSize: 13, color: '#aaa', padding: '12px 0' }}>No activity yet.</div>
          ) : activity.map((entry, i) => {
            const entity = ENTITY_LABEL[entry.table_name] || entry.table_name
            const verb   = ACTION_PAST[entry.action]  || entry.action
            const actor  = entry.actor_email?.split('@')[0] || 'system'
            const dot    = ACTION_COLOR[entry.action]  || '#999'
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 0',
                borderBottom: i < activity.length - 1 ? '1px solid #f5f5f5' : 'none',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: dot, flexShrink: 0,
                }} />
                <div style={{ flex: 1, fontSize: 13, color: '#333', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>{actor}</span>
                  {' '}{verb} {'aeiou'.includes(entity[0]) ? 'an' : 'a'} {entity}
                  {entry.record_name && (
                    <span style={{ color: '#888' }}> · {entry.record_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>
                  {timeAgo(entry.changed_at)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '22px 24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 18 }}>
            Quick Links
          </div>
          {[
            { label: 'Customers',    color: BRAND,     desc: 'Manage customers & brands' },
            { label: 'Styles',       color: '#7c3aed', desc: 'Products & routing steps' },
            { label: 'Setup',        color: '#64748b', desc: 'Colors, sizes, processes' },
          ].map((link) => (
            <div key={link.label} style={{
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 8,
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              cursor: 'default',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: link.color }}>{link.label}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{link.desc}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
