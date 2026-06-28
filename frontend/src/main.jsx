import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { App as AntApp, ConfigProvider } from 'antd'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.2,
    environment: import.meta.env.MODE,
  })
}
import './index.css'
import App from './App.jsx'
import { BRAND } from './config/constants'

const theme = {
  token: {
    colorPrimary: BRAND.primaryColor,
    colorLink: BRAND.linkColor,
    colorSuccess: BRAND.successColor,
    colorError: BRAND.errorColor,
    fontFamily: BRAND.fontFamily,
    borderRadius: 12,
    borderRadiusLG: 16,
    colorBgContainer: 'rgba(255, 251, 245, 0.85)',
    colorBorder: 'rgba(31, 41, 51, 0.14)',
    colorText: '#1f2933',
    colorTextPlaceholder: '#9baab5',
  },
  components: {
    Button: {
      defaultBorderColor: 'rgba(31, 41, 51, 0.12)',
      defaultColor: '#24313b',
    },
    Input: {
      activeBorderColor: '#d96f22',
      activeShadow: '0 0 0 4px rgba(217, 111, 34, 0.14)',
    },
    Layout: {
      colorBgLayout: '#f5efe4',
      headerBg: 'transparent',
      siderBg: '#0d1b2a',
    },
    Menu: {
      darkItemBg: '#0d1b2a',
      darkItemSelectedBg: 'rgba(217, 111, 34, 0.16)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.04)',
    },
    Select: {
      optionActiveBg: 'rgba(217, 111, 34, 0.08)',
      optionSelectedBg: 'rgba(217, 111, 34, 0.12)',
    },
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider theme={theme}>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
)
