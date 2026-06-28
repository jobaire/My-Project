import { BellOutlined, BulbOutlined, CameraOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons'
import { Badge, Button, Modal, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { updateMyProfile } from '../services/auth'

const ROLE_LABELS = {
  admin:              'Admin',
  planner:            'Planner',
  production_manager: 'Production Manager',
  data_entry:         'Data Entry',
  viewer:             'Viewer',
  super_admin:        'Super Admin',
  platform_admin:     'Platform Admin',
}

function getInitials(fullName, email) {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (email || '?').slice(0, 2).toUpperCase()
}

function resizeToBase64(file, size = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d')
        const s = Math.min(img.width, img.height)
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function AvatarCircle({ session, size, initials }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      overflow: 'hidden', flexShrink: 0,
      background: 'var(--c-teal)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.floor(size * 0.37), fontWeight: 700, color: '#fff',
      userSelect: 'none',
    }}>
      {session.avatar
        ? <img src={session.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  )
}

/**
 * Shared top bar used by all three app shells.
 *
 * Props:
 *  pageTitle       — string shown on the left
 *  session         — the auth session object
 *  onLogout        — called when user signs out
 *  onSessionUpdate — optional; enables avatar upload (only AppShell passes this)
 *  roleBadge       — optional { label, color } tag shown next to the page title
 */
export default function AppTopBar({ pageTitle, session, onLogout, onSessionUpdate, roleBadge }) {
  const [profileOpen, setProfileOpen]     = useState(false)
  const [aiModalOpen, setAiModalOpen]     = useState(false)
  const [avatarHover, setAvatarHover]     = useState(false)
  const [uploading, setUploading]         = useState(false)
  const [bellOpen, setBellOpen]           = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const bellRef = useRef(null)

  const profileRef   = useRef(null)
  const fileInputRef = useRef(null)
  const initials     = getInitials(session.full_name, session.email)
  const canUpload    = !!onSessionUpdate

  // Fetch unread notification count (only for company users with a tenant DB)
  useEffect(() => {
    if (!session?.access_token || !session?.tenant_id) return
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
    fetch(`${base}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUnreadCount(d.count))
      .catch(() => {})
  }, [session?.access_token])

  function fetchNotifications() {
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
    fetch(`${base}/notifications/?limit=20`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setNotifications)
      .catch(() => {})
  }

  function openBell() {
    setBellOpen(true)
    fetchNotifications()
    // Mark all read after opening
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
    fetch(`${base}/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(() => setUnreadCount(0)).catch(() => {})
  }

  // Close bell on outside click
  useEffect(() => {
    if (!bellOpen) return
    const h = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [bellOpen])

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return
    const h = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [profileOpen])

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const base64 = await resizeToBase64(file, 200)
      await updateMyProfile(session.access_token, { avatar: base64 })
      onSessionUpdate?.({ avatar: base64 })
    } catch { /* silent */ }
    finally { setUploading(false) }
  }

  // Trial banner logic
  const trialDaysLeft = session.trial_ends_at
    ? Math.ceil((new Date(session.trial_ends_at) - Date.now()) / 86400000)
    : null
  const showTrialBanner = trialDaysLeft !== null && trialDaysLeft <= 5 && trialDaysLeft >= 0

  return (
    <>
    {showTrialBanner && (
      <div style={{
        background: trialDaysLeft <= 1 ? 'var(--c-danger)' : 'var(--c-warning)',
        color: '#fff', textAlign: 'center',
        fontSize: 12, fontWeight: 600, padding: '6px 16px',
        flexShrink: 0,
      }}>
        {trialDaysLeft === 0
          ? 'Your free trial expires today — upgrade to keep access.'
          : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left on your free trial.`}
      </div>
    )}
    <header style={{
      height: 44, flexShrink: 0,
      background: '#343435f2',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px 0 20px',
      gap: 12,
    }}>

      {canUpload && (
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
      )}

      {/* ── Left: page title + optional role badge ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
          {pageTitle}
        </span>
        {roleBadge && (
          <Tag color={roleBadge.color} style={{ borderRadius: 20, margin: 0, fontSize: 11 }}>
            {roleBadge.label}
          </Tag>
        )}
      </div>

      {/* ── Center: search bar ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 380, maxWidth: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <SearchOutlined style={{ position: 'absolute', left: 11, color: 'rgba(255,255,255,0.4)', fontSize: 13, pointerEvents: 'none' }} />
          <input
            readOnly
            placeholder="Search Filaminto..."
            style={{
              width: '100%', height: 28,
              paddingLeft: 32, paddingRight: 52,
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.1)',
              fontSize: 13, color: 'rgba(255,255,255,0.6)',
              outline: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          />
          <span style={{
            position: 'absolute', right: 10,
            fontSize: 10.5, color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, padding: '1px 5px',
            fontFamily: 'monospace', pointerEvents: 'none',
          }}>
            Ctrl+K
          </span>
        </div>
      </div>

      {/* ── Right: AI button + user avatar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

        {/* Bell / notifications — only for company users */}
        {session?.tenant_id && (
          <div ref={bellRef} style={{ position: 'relative' }}>
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
              <button onClick={openBell} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.7)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <BellOutlined style={{ fontSize: 16 }} />
              </button>
            </Badge>

            {bellOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                width: 340, background: '#fff', border: '1px solid #e8eaed',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 2000, overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f0f0f0', fontWeight: 700, fontSize: 13, color: '#111' }}>
                  Notifications
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                    No notifications yet
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid #f5f5f5',
                    background: n.is_read ? '#fff' : '#f0f7ff',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2 }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: 12, color: '#666' }}>{n.message}</div>}
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 3 }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Assistant */}
        <button
          onClick={() => setAiModalOpen(true)}
          style={{
            height: 28, padding: '0 11px',
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6, cursor: 'pointer',
            color: '#fff', fontSize: 13, fontWeight: 500,
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          <BulbOutlined style={{ fontSize: 13 }} />
          AI Assistant
        </button>

        {/* User avatar + dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => canUpload && setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
              onClick={(e) => {
                if (canUpload && avatarHover) {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }
              }}
            >
              <AvatarCircle session={session} size={34} initials={initials} />
              {(avatarHover || uploading) && canUpload && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CameraOutlined style={{ fontSize: 12, color: '#fff' }} />
                </div>
              )}
            </div>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>▼</span>
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              width: 248,
              background: '#fff',
              border: '1px solid #e8eaed',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 2000,
              overflow: 'hidden',
            }}>
              {/* User info header */}
              <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <AvatarCircle session={session} size={36} initials={initials} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.full_name || session.email?.split('@')[0]}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.email}
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                  background: 'rgba(11,158,148,0.1)', border: '1px solid var(--c-teal)',
                  fontSize: 11, fontWeight: 600, color: 'var(--c-teal)',
                }}>
                  {ROLE_LABELS[session.role] || session.role}
                </div>
              </div>

              {/* Department / Designation */}
              {(session.department || session.designation) && (
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
                  {session.department && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#aaa', width: 76, flexShrink: 0 }}>Department</span>
                      <span style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.department}</span>
                    </div>
                  )}
                  {session.designation && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#aaa', width: 76, flexShrink: 0 }}>Title</span>
                      <span style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.designation}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Sign out */}
              <div style={{ padding: '6px 8px' }}>
                <button
                  onClick={() => { setProfileOpen(false); onLogout() }}
                  style={{
                    width: '100%', padding: '8px 10px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderRadius: 6, fontSize: 13, color: 'var(--c-danger)',
                    transition: 'background 0.15s', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220,38,38,0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <LogoutOutlined style={{ fontSize: 13 }} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant modal */}
      <Modal
        title="AI Assistant"
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={<Button onClick={() => setAiModalOpen(false)}>Close</Button>}
      >
        <p style={{ color: '#555', lineHeight: 1.7 }}>
          AI assistant is coming soon. This will allow you to ask questions about your data,
          generate reports, and get insights across your orders, customers, and styles.
        </p>
      </Modal>
    </header>
    </>
  )
}
