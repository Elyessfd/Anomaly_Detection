import React from 'react';

function Gauge({ value, min, max, warnAt, critAt, label, unit, color, size = 140 }) {
  const clampedValue = Math.min(Math.max(value, min), max);
  const pct = (clampedValue - min) / (max - min);
  const angle = -135 + pct * 270; // -135° to +135°

  const warnPct = (warnAt - min) / (max - min);
  const critPct = (critAt - min) / (max - min);

  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;

  // Arc path helper
  const polarToCartesian = (angle) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (startAngle, endAngle) => {
    const start = polarToCartesian(endAngle);
    const end = polarToCartesian(startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  // Needle endpoint
  const needleEnd = polarToCartesian(angle);

  const isWarn = value >= warnAt && value < critAt;
  const isCrit = value >= critAt;
  const valueColor = isCrit ? 'var(--critical)' : isWarn ? 'var(--warning)' : color;

  return (
    <div className="gauge-container">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.8}`}>
        {/* Background arc */}
        <path d={describeArc(-135, 135)} fill="none" stroke="#1e2d45" strokeWidth={8} strokeLinecap="round" />
        {/* Green zone */}
        <path d={describeArc(-135, -135 + warnPct * 270)} fill="none" stroke="var(--healthy)" strokeWidth={8} strokeLinecap="round" opacity={0.3} />
        {/* Warn zone */}
        <path d={describeArc(-135 + warnPct * 270, -135 + critPct * 270)} fill="none" stroke="var(--warning)" strokeWidth={8} strokeLinecap="round" opacity={0.3} />
        {/* Crit zone */}
        <path d={describeArc(-135 + critPct * 270, 135)} fill="none" stroke="var(--critical)" strokeWidth={8} strokeLinecap="round" opacity={0.3} />

        {/* Value arc */}
        <path d={describeArc(-135, angle)} fill="none" stroke={valueColor} strokeWidth={8} strokeLinecap="round" />

        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y} stroke={valueColor} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill={valueColor} />

        {/* Value text */}
        <text x={cx} y={cy + 22} textAnchor="middle" fill={valueColor}
          style={{ fontSize: 20, fontWeight: 700, fontFamily: "'JetBrains Mono'" }}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </text>
        <text x={cx} y={cy + 36} textAnchor="middle" fill="#4a5568"
          style={{ fontSize: 10, fontFamily: "'JetBrains Mono'" }}>
          {unit}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: -4 }}>
        {label}
      </div>
    </div>
  );
}

export default function GaugeDisplay({ latestData }) {
  if (!latestData) return null;

  return (
    <div className="card animate-in">
      <div className="card-header">
        <div className="card-title">🎯 Live Gauges</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
        <Gauge
          value={latestData.temperature ?? 0}
          min={0} max={100}
          warnAt={60} critAt={80}
          label="Temperature"
          unit="°C"
          color="var(--accent-amber)"
        />
        <Gauge
          value={latestData.vibration ?? 0}
          min={0} max={4095}
          warnAt={2000} critAt={3200}
          label="Vibration"
          unit="ADC"
          color="var(--accent-cyan)"
        />
        <Gauge
          value={latestData.humidity ?? 0}
          min={0} max={100}
          warnAt={80} critAt={95}
          label="Humidity"
          unit="%"
          color="var(--accent-blue)"
        />
      </div>
    </div>
  );
}
