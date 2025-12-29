import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 10,
        },
      }}
    >
      <HashRouter>
    <App />
      </HashRouter>
    </ConfigProvider>
  </StrictMode>,
)
