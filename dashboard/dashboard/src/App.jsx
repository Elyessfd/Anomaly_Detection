import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard, LineChart, AlertTriangle, Terminal, Radio,
} from 'lucide-react';

import Header from './components/Header';
import StatCards from './components/StatCards';
import NodeCards from './components/NodeCards';
import SensorChart from './components/SensorChart';
import GaugeDisplay from './components/GaugeDisplay';
import AnomalyFeed from './components/AnomalyFeed';
import CommandPanel from './components/CommandPanel';
import ActivityLog from './components/ActivityLog';
import useMonitorData from './hooks/useMonitorData';

const TABS = [
  { id: 'overview',  label: 'Overview',   icon: LayoutDashboard },
  { id: 'charts',    label: 'Charts',     icon: LineChart },
  { id: 'alerts',    label: 'Alerts',     icon: AlertTriangle },
  { id: 'control',   label: 'Control',    icon: Terminal },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

  const {
    nodes, sensorData, anomalies, heartbeats,
    connected, demoMode, loading,
    selectedNode, setSelectedNode,
  } = useMonitorData();

  const nodeIds = Object.keys(nodes);
  const onlineCount = nodeIds.filter(id => nodes[id]?.online !== false).length;

  // Latest data from selected node or first node
  const latestData = useMemo(() => {
    const targetNode = selectedNode || nodeIds[0];
    if (!targetNode || !nodes[targetNode]) return null;
    return nodes[targetNode]?.last_data || null;
  }, [nodes, selectedNode, nodeIds]);

  // Filter sensor data for selected node
  const filteredSensors = useMemo(() => {
    if (!selectedNode) return sensorData;
    return sensorData.filter(d =>
      d._node_id === selectedNode || d.node_id === selectedNode
    );
  }, [sensorData, selectedNode]);

  const filteredAnomalies = useMemo(() => {
    if (!selectedNode) return anomalies;
    return anomalies.filter(a =>
      a._node_id === selectedNode || a.node_id === selectedNode
    );
  }, [anomalies, selectedNode]);

  const unreadAlerts = anomalies.filter(a => {
    const t = new Date(a._received_at).getTime();
    return Date.now() - t < 300000; // Last 5 min
  }).length;

  if (loading) {
    return (
      <div className="app-container">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}>
          <Radio size={48} color="var(--accent-cyan)" style={{ animation: 'pulse 1.5s infinite' }} />
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
            Connecting to monitoring system...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header
        connected={connected}
        demoMode={demoMode}
        nodeCount={nodeIds.length}
        alertCount={unreadAlerts}
      />

      {/* Navigation */}
      <nav className="nav-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={15} />
            {tab.label}
            {tab.id === 'alerts' && unreadAlerts > 0 && (
              <span className="badge">{unreadAlerts}</span>
            )}
          </button>
        ))}

        {/* Node filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Node:
          </span>
          <select
            value={selectedNode || ''}
            onChange={e => setSelectedNode(e.target.value || null)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '4px 8px',
              borderRadius: 4,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All Nodes</option>
            {nodeIds.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      </nav>

      <main className="main-content">
        {/* ─── OVERVIEW TAB ──────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <StatCards
              latestData={latestData}
              anomalyCount={anomalies.length}
              nodeCount={onlineCount}
              totalNodes={nodeIds.length}
            />

            <NodeCards
              nodes={nodes}
              heartbeats={heartbeats}
              selectedNode={selectedNode}
              onSelectNode={id => setSelectedNode(id === selectedNode ? null : id)}
            />

            <GaugeDisplay latestData={latestData} />

            <div style={{ marginTop: 24 }}>
              <div className="charts-grid">
                <SensorChart data={filteredSensors} type="temperature" />
                <SensorChart data={filteredSensors} type="vibration" />
              </div>
            </div>

            <div className="bottom-grid" style={{ marginTop: 8 }}>
              <AnomalyFeed anomalies={filteredAnomalies} />
              <ActivityLog sensorData={filteredSensors} anomalies={filteredAnomalies} />
            </div>
          </>
        )}

        {/* ─── CHARTS TAB ────────────────────────────────── */}
        {activeTab === 'charts' && (
          <>
            <GaugeDisplay latestData={latestData} />
            <div className="charts-grid" style={{ marginTop: 16 }}>
              <SensorChart data={filteredSensors} type="temperature" />
              <SensorChart data={filteredSensors} type="vibration" />
            </div>
            <div style={{ marginTop: 16 }}>
              <SensorChart data={filteredSensors} type="combined" />
            </div>
          </>
        )}

        {/* ─── ALERTS TAB ────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <div style={{ maxWidth: 800 }}>
            <AnomalyFeed anomalies={filteredAnomalies} />
          </div>
        )}

        {/* ─── CONTROL TAB ───────────────────────────────── */}
        {activeTab === 'control' && (
          <>
            <NodeCards
              nodes={nodes}
              heartbeats={heartbeats}
              selectedNode={selectedNode}
              onSelectNode={id => setSelectedNode(id === selectedNode ? null : id)}
            />
            <div className="bottom-grid" style={{ marginTop: 16 }}>
              <CommandPanel selectedNode={selectedNode} demoMode={demoMode} />
              <ActivityLog sensorData={filteredSensors} anomalies={filteredAnomalies} />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '12px 24px',
        borderTop: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>Machine Health Monitor v1.0</span>
        <span>
          {demoMode ? '⚡ Demo Mode' : `📡 Connected to ${connected ? 'API' : '...'}`}
          {' • '}
          Polling every 3s
        </span>
      </footer>
    </div>
  );
}
