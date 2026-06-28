// ─── Application Identity ─────────────────────────────────────────────────────
// Change APP_NAME here and it propagates everywhere in the app.
export const APP_NAME = 'Filaminto'

// SESSION_KEY is derived so it stays in sync automatically.
// Changing APP_NAME will invalidate existing sessions (users get logged out cleanly).
export const SESSION_KEY = `${APP_NAME.toLowerCase().replace(/\s+/g, '-')}.session`

// ─── Brand Palette (consumed by Ant Design ConfigProvider in main.jsx) ────────
export const BRAND = {
  primaryColor: '#d96f22',
  linkColor: '#0b5e57',
  errorColor: '#ad2b2b',
  successColor: '#0b5e57',
  fontFamily: "'Manrope', sans-serif",
}
