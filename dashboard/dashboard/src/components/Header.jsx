import React from 'react';
import { Activity, Wifi, WifiOff, FlaskConical } from 'lucide-react';

export default function Header({ connected, demoMode, nodeCount, alertCount }) {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <Activity size={20} color="#0a0e17" />
          </div>
          <div>
            <div className="header-title">Machine Health Monitor</div>
            <div className="header-subtitle">
              {nodeCount} node{nodeCount !== 1 ? 's' : ''} registered
              {demoMode && ' • DEMO MODE'}
            </div>
          </div>
        </div>

        <div className="header-right">
          {demoMode && (
            <span style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-amber)',
              background: 'var(--warning-bg)',
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid rgba(255,171,0,0.3)',
            }}>
              <FlaskConical size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
              Demo Mode — No backend connected
            </span>
          )}

          <div className="connection-status">
            <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? (
              <><Wifi size={14} /> API Connected</>
            ) : (
              <><WifiOff size={14} /> Disconnected</>
            )}
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}>
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>
    </>
  );
}
