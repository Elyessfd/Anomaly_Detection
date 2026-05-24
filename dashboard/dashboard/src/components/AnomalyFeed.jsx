import React from 'react';
import { AlertTriangle, AlertOctagon } from 'lucide-react';

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

function AnomalyItem({ anomaly }) {
  const severity = anomaly.severity || 'WARNING';
  const isCritical = severity === 'CRITICAL';
  const Icon = isCritical ? AlertOctagon : AlertTriangle;
  const color = isCritical ? 'var(--critical)' : 'var(--warning)';

  const tempInfo = anomaly.temperature || {};
  const vibInfo  = anomaly.vibration || {};

  let details = [];
  if (tempInfo.anomaly) {
    details.push(`🌡️ Temp: ${tempInfo.value}°C — ${tempInfo.reason}`);
  }
  if (vibInfo.anomaly) {
    details.push(`📳 Vib: ${vibInfo.value} — ${vibInfo.reason}`);
  }

  return (
    <div className={`alert-item ${severity.toLowerCase()}`}>
      <div className="alert-icon">
        <Icon size={16} color={color} />
      </div>
      <div className="alert-content">
        <div className="alert-title" style={{ color }}>
          {severity} — {anomaly._node_id || anomaly.node_id}
        </div>
        {details.map((d, i) => (
          <div key={i} className="alert-detail">{d}</div>
        ))}
      </div>
      <div className="alert-time">
        {timeAgo(anomaly._received_at)}
      </div>
    </div>
  );
}

export default function AnomalyFeed({ anomalies }) {
  const sorted = [...anomalies].reverse(); // newest first

  return (
    <div className="card animate-in" style={{ gridColumn: 'span 1' }}>
      <div className="card-header">
        <div className="card-title">
          <AlertTriangle size={16} color="var(--accent-amber)" />
          Anomaly Feed
        </div>
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: sorted.length > 0 ? 'var(--warning)' : 'var(--text-muted)',
        }}>
          {sorted.length} alert{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          ✅ No anomalies detected
        </div>
      ) : (
        <div className="alert-list">
          {sorted.slice(0, 50).map((a, i) => (
            <AnomalyItem key={i} anomaly={a} />
          ))}
        </div>
      )}
    </div>
  );
}
