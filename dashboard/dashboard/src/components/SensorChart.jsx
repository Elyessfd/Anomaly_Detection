import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts';

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1a2235',
      border: '1px solid #2a3f66',
      borderRadius: 6,
      padding: '10px 14px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
    }}>
      <div style={{ color: '#8892a4', marginBottom: 6 }}>{formatTime(label)}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default function SensorChart({ data, type }) {
  const chartData = useMemo(() => {
    const sliced = data.slice(-120); // Last 120 points
    return sliced.map(d => ({
      time: d.timestamp || d._received_at,
      temperature: d.temperature,
      vibration: d.vibration,
      humidity: d.humidity,
    }));
  }, [data]);

  if (type === 'temperature') {
    return (
      <div className="card animate-in">
        <div className="card-header">
          <div className="card-title">🌡️ Temperature Over Time</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Last {chartData.length} readings
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffab00" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ffab00" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#4a5568"
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono'" }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#4a5568"
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono'" }}
              domain={['dataMin - 5', 'dataMax + 5']}
              unit="°C"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={60} stroke="#ffab00" strokeDasharray="6 4" label={{ value: 'WARN 60°C', fill: '#ffab00', fontSize: 10, position: 'right' }} />
            <ReferenceLine y={80} stroke="#ff1744" strokeDasharray="6 4" label={{ value: 'CRIT 80°C', fill: '#ff1744', fontSize: 10, position: 'right' }} />
            <Area
              type="monotone"
              dataKey="temperature"
              stroke="#ffab00"
              strokeWidth={2}
              fill="url(#tempGrad)"
              name="Temperature (°C)"
              dot={false}
              activeDot={{ r: 4, fill: '#ffab00' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'vibration') {
    return (
      <div className="card animate-in">
        <div className="card-header">
          <div className="card-title">📳 Vibration Over Time</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Last {chartData.length} readings
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="vibGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#4a5568"
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono'" }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#4a5568"
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono'" }}
              domain={[0, 'dataMax + 200']}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={2000} stroke="#ffab00" strokeDasharray="6 4" label={{ value: 'WARN', fill: '#ffab00', fontSize: 10, position: 'right' }} />
            <ReferenceLine y={3200} stroke="#ff1744" strokeDasharray="6 4" label={{ value: 'CRIT', fill: '#ff1744', fontSize: 10, position: 'right' }} />
            <Area
              type="monotone"
              dataKey="vibration"
              stroke="#00e5ff"
              strokeWidth={2}
              fill="url(#vibGrad)"
              name="Vibration (ADC)"
              dot={false}
              activeDot={{ r: 4, fill: '#00e5ff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Dual chart
  return (
    <div className="card animate-in">
      <div className="card-header">
        <div className="card-title">📊 Combined View</div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
          <XAxis dataKey="time" tickFormatter={formatTime} stroke="#4a5568" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="temp" stroke="#ffab00" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="vib" orientation="right" stroke="#00e5ff" tick={{ fontSize: 10 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'JetBrains Mono'" }} />
          <Area yAxisId="temp" type="monotone" dataKey="temperature" stroke="#ffab00" fill="none" strokeWidth={2} name="Temp °C" dot={false} />
          <Area yAxisId="vib" type="monotone" dataKey="vibration" stroke="#00e5ff" fill="none" strokeWidth={2} name="Vibration" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
