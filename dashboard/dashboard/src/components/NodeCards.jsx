import React from 'react';
import { Cpu, Wifi, Clock, Thermometer, Activity } from 'lucide-react';

function formatUptime(seconds) {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function NodeCard({ nodeId, data, heartbeat, isSelected, onClick }) {
  const info = data?.last_data || {};
  const online = data?.online !== false;
  const state = online ? (info.state || 'UNKNOWN') : 'OFFLINE';
  const stateClass = state.toLowerCase();

  return (
    <div
      className={`node-card ${stateClass} ${isSelected ? 'selected' : ''}`}
      onClick={() => onClick(nodeId)}
      style={isSelected ? { borderColor: 'var(--accent-cyan)', borderWidth: 2 } : {}}
    >
      <div className="node-card-header">
        <div>
          <div className="node-name">
            <Cpu size={14} style={{ marginRight: 6, verticalAlign: -2, color: 'var(--accent-cyan)' }} />
            {info.node_id || nodeId}
          </div>
          <div className="node-id">{nodeId}</div>
        </div>
        <span className={`status-badge ${stateClass}`}>
          <span className={`status-dot ${stateClass}`} />
          {state}
        </span>
      </div>

      <div className="node-metrics">
        <div className="node-metric">
          <span className="node-metric-label">
            <Thermometer size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
            Temperature
          </span>
          <span className="node-metric-value temp">
            {info.temperature?.toFixed(1) ?? '--'}°C
          </span>
        </div>

        <div className="node-metric">
          <span className="node-metric-label">
            <Activity size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
            Vibration
          </span>
          <span className="node-metric-value vib">
            {info.vibration ?? '--'}
          </span>
        </div>

        <div className="node-metric">
          <span className="node-metric-label">Humidity</span>
          <span className="node-metric-value hum">
            {info.humidity?.toFixed(1) ?? '--'}%
          </span>
        </div>

        <div className="node-metric">
          <span className="node-metric-label">
            <Wifi size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
            RSSI
          </span>
          <span className="node-metric-value rssi">
            {info.wifi_rssi ?? '--'} dBm
          </span>
        </div>
      </div>

      <div className="node-footer">
        <span>
          <Clock size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
          Uptime: {formatUptime(info.uptime_s)}
        </span>
        <span>
          Heap: {heartbeat?.free_heap ? `${(heartbeat.free_heap / 1024).toFixed(0)}KB` : '--'}
        </span>
        <span>
          Last: {data?.last_seen
            ? new Date(data.last_seen).toLocaleTimeString()
            : '--'}
        </span>
      </div>
    </div>
  );
}

export default function NodeCards({ nodes, heartbeats, selectedNode, onSelectNode }) {
  const nodeIds = Object.keys(nodes);

  if (nodeIds.length === 0) {
    return (
      <div className="empty-state">
        <Cpu size={48} className="empty-state-icon" />
        <div className="empty-state-title">No Nodes Detected</div>
        <div className="empty-state-desc">
          Waiting for ESP32 nodes to connect via MQTT...
        </div>
      </div>
    );
  }

  return (
    <div className="nodes-grid animate-in">
      {nodeIds.map(id => (
        <NodeCard
          key={id}
          nodeId={id}
          data={nodes[id]}
          heartbeat={heartbeats[id]}
          isSelected={selectedNode === id}
          onClick={onSelectNode}
        />
      ))}
    </div>
  );
}
