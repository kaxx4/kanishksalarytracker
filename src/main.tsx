import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

/*
 * Register the service worker in production only.
 *
 * In dev it would sit in front of Vite's module graph and serve yesterday's
 * code back after an edit, which costs more debugging time than the offline
 * shell is worth on a machine that is already running the server.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Unsupported or blocked — the app works, just without an offline shell. */
    })
  })
}
