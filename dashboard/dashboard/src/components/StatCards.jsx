import React from 'react';
import {
  Thermometer, Activity, Droplets, Cpu, AlertTriangle, CheckCircle,
} from 'lucide-react';

function StatCard({ icon: Icon, iconColor, label, value, unit, subtext, glow }) {
  return (
    <div className="card" style={glow ? { boxShadow: glow } : {}}>
      <div className="card-header">
        <div className="card-title">
          <Icon size={16} color={iconColor} />
          {label}
        </div>
      </div>
      <div className="card-value" style={{ color: iconColor }}>
        {value}
        <span className="card-unit"> {unit}</span>
      </div>
      {subtext && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

export default function StatCards({ latestData, anomalyCount, nodeCount, totalNodes }) {
  if (!latestData) return null;

  const { temperature, humidity, vibration, state, wifi_rssi } = latestData;

  const stateColor = state === 'HEALTHY' ? 'var(--healthy)' :
                     state === 'WARNING' ? 'var(--warning)' : 'var(--critical)';
  const stateIcon  = state === 'HEALTHY' ? CheckCircle : AlertTriangle;
  const stateGlow  = state === 'CRITICAL' ? 'var(--shadow-glow-red)' :
                     state === 'WARNING'  ? '0 0 20px rgba(255,171,0,0.15)' : undefined;

  return (
    <div className="stats-grid animate-in">
      <StatCard
        icon={Thermometer}
        iconColor="var(--accent-amber)"
        label="Temperature"
        value={temperature?.toFixed(1) ?? '--'}
        unit="°C"
        subtext={`Threshold: 60°C warn / 80°C crit`}
      />
      <StatCard
        icon={Activity}
        iconColor="var(--accent-cyan)"
        label="Vibration"
        value={vibration ?? '--'}
        unit="raw"
        subtext={`Threshold: 2000 warn / 3200 crit`}
      />
      <StatCard
        icon={Droplets}
        iconColor="var(--accent-blue)"
        label="Humidity"
        value={humidity?.toFixed(1) ?? '--'}
        unit="%"
        subtext={`WiFi RSSI: ${wifi_rssi ?? '--'} dBm`}
      />
      <StatCard
        icon={stateIcon}
        iconColor={stateColor}
        label="Machine State"
        value={state ?? 'UNKNOWN'}
        unit=""
        subtext={`${anomalyCount} anomalies detected`}
        glow={stateGlow}
      />
      <StatCard
        icon={Cpu}
        iconColor="var(--accent-purple)"
        label="Active Nodes"
        value={`${nodeCount}/${totalNodes}`}
        unit=""
        subtext="Online / Total"
      />
    </div>
  );
}
