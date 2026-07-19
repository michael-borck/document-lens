import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { installDesktopBridge } from './lib/desktop-bridge'

// Under Tauri, provide window.electron via the Tauri bridge before the app
// reads it. No-op under Electron (preload already set it). See desktop-bridge.ts.
installDesktopBridge()

// Use HashRouter for Electron compatibility (file:// protocol)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
