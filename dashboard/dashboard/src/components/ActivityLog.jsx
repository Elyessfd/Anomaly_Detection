import React, { useMemo } from 'react';
import { ScrollText } from 'lucide-react';

export default function ActivityLog({ sensorData, anomalies }) {
  const entries = useMemo(() => {
    const logs = [];

    // Last 20 sensor readings
    sensorData.slice(-20).forEach(d => {
      logs.push({
        time: d._received_at || new Date(d.timestamp).toISOString(),
        type: 'DATA',
        msg: `T=${d.temperature?.toFixed(1)}°C  Vib=${d.vibration}  State=${d.state}`,
        color: 'var(--accent-cyan)',
      });
    });

    // Last 20 anomalies
    anomalies.slice(-20).forEach(a => {
      const severity = a.severity || 'WARNING';
      const details = [];
      if (a.temperature?.anomaly) details.push(`Temp=${a.temperature.value}°C`);
      if (a.vibration?.anomaly) details.push(`Vib=${a.vibration.value}`);
      logs.push({
        time: a._received_at || new Date(a.timestamp).toISOString(),
        type: severity,
        msg: details.join(' | ') + ` — ${a.temperature?.reason || a.vibration?.reason || ''}`,
        color: severity === 'CRITICAL' ? 'var(--critical)' : 'var(--warning)',
      });
    });

    // Sort by time, newest first
    logs.sort((a, b) => new Date(b.time) - new Date(a.time));
    return logs.slice(0, 40);
  }, [sensorData, anomalies]);

  return (
    <div className="card animate-in">
      <div className="card-header">
        <div className="card-title">
          <ScrollText size={16} color="var(--accent-purple)" />
          Activity Log
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {entries.length} entries
        </span>
      </div>
      <div className="log-list">
        {entries.map((e, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">
              {new Date(e.time).toLocaleTimeString()}
            </span>
            <span className="log-type" style={{ color: e.color }}>
              [{e.type}]
            </span>
            <span className="log-msg">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
