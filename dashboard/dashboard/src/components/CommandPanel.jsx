import React, { useState } from 'react';
import {
  Send, RefreshCw, RotateCcw, Power, Clock, Terminal,
} from 'lucide-react';
import { sendCommand } from '../utils/api';

export default function CommandPanel({ selectedNode, demoMode }) {
  const [interval, setInterval] = useState(5000);
  const [log, setLog] = useState([]);

  const addLog = (msg, type = 'info') => {
    setLog(prev => [
      { time: new Date().toLocaleTimeString(), msg, type },
      ...prev.slice(0, 19),
    ]);
  };

  const send = async (command, label) => {
    if (!selectedNode) {
      addLog('No node selected', 'error');
      return;
    }
    if (demoMode) {
      addLog(`[DEMO] ${label} → ${selectedNode}`, 'warn');
      return;
    }
    try {
      const res = await sendCommand(selectedNode, command);
      addLog(`${label} → ${selectedNode} (rc=${res.mqtt_rc})`, 'success');
    } catch (err) {
      addLog(`Failed: ${err.message}`, 'error');
    }
  };

  const logColors = {
    info: 'var(--text-secondary)',
    success: 'var(--healthy)',
    warn: 'var(--warning)',
    error: 'var(--critical)',
  };

  return (
    <div className="card animate-in">
      <div className="card-header">
        <div className="card-title">
          <Terminal size={16} color="var(--accent-cyan)" />
          Remote Control
        </div>
        {selectedNode && (
          <span className="status-badge healthy" style={{ fontSize: 10 }}>
            Target: {selectedNode}
          </span>
        )}
      </div>

      {!selectedNode ? (
        <div style={{
          textAlign: 'center',
          padding: '30px',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          Click a node card above to select a target
        </div>
      ) : (
        <div className="command-panel">
          <div className="command-row">
            <button
              className="command-btn"
              onClick={() => send({ request_reading: true }, 'Request Reading')}
            >
              <RefreshCw size={14} /> Request Reading
            </button>
            <button
              className="command-btn"
              onClick={() => send({ reset_state: true }, 'Reset State')}
            >
              <RotateCcw size={14} /> Reset State
            </button>
            <button
              className="command-btn danger"
              onClick={() => {
                if (window.confirm(`Reboot ${selectedNode}?`)) {
                  send({ reboot: true }, 'Reboot');
                }
              }}
            >
              <Power size={14} /> Reboot
            </button>
          </div>

          <div className="command-row">
            <Clock size={14} color="var(--text-muted)" />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 100 }}>
              Publish interval:
            </span>
            <input
              type="number"
              className="command-input"
              value={interval}
              onChange={e => setInterval(Number(e.target.value))}
              min={1000}
              max={60000}
              step={1000}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ms</span>
            <button
              className="command-btn"
              onClick={() => send({ set_interval: interval }, `Set Interval ${interval}ms`)}
            >
              <Send size={14} /> Apply
            </button>
          </div>

          {log.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Command Log
              </div>
              <div className="log-list" style={{ maxHeight: 150 }}>
                {log.map((entry, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">{entry.time}</span>
                    <span className="log-msg" style={{ color: logColors[entry.type] }}>
                      {entry.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
