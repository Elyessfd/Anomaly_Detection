/**
 * API utility — communicates with the Flask backend.
 * Also generates mock data when the backend is unreachable (demo mode).
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// ── Real API calls ──────────────────────────────────────────

async function fetchJSON(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchNodes() {
  return fetchJSON('/api/nodes');
}

export async function fetchSensors(nodeId, last = 100) {
  const q = nodeId ? `?node=${nodeId}&last=${last}` : `?last=${last}`;
  return fetchJSON(`/api/sensors${q}`);
}

export async function fetchAnomalies(nodeId, last = 50) {
  const q = nodeId ? `?node=${nodeId}&last=${last}` : `?last=${last}`;
  return fetchJSON(`/api/anomalies${q}`);
}

export async function fetchHeartbeats() {
  return fetchJSON('/api/heartbeats');
}

export async function sendCommand(nodeId, command) {
  const res = await fetch(`${API_BASE}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ node_id: nodeId, command }),
  });
  return res.json();
}

// ── Mock Data Generator (demo mode) ────────────────────────

let mockTime = Date.now() - 300 * 5000; // Start 25 min ago
let mockHistory = [];
let mockAnomalies = [];
let mockBaseTemp = 42;
let mockBaseVib = 800;

function advanceMock() {
  mockTime += 5000;
  const now = mockTime;

  // Simulate slow drift + noise
  mockBaseTemp += (Math.random() - 0.48) * 0.5;
  mockBaseVib  += (Math.random() - 0.48) * 30;
  mockBaseTemp = Math.max(20, Math.min(90, mockBaseTemp));
  mockBaseVib  = Math.max(100, Math.min(4000, mockBaseVib));

  // Occasional spike
  const tempSpike = Math.random() > 0.95 ? (Math.random() * 20) : 0;
  const vibSpike  = Math.random() > 0.93 ? (Math.random() * 1500) : 0;

  const temp = +(mockBaseTemp + tempSpike + (Math.random() - 0.5) * 2).toFixed(1);
  const vib  = Math.round(mockBaseVib + vibSpike + (Math.random() - 0.5) * 100);
  const hum  = +(55 + Math.random() * 15).toFixed(1);

  let state = 'HEALTHY';
  if (temp > 60 || vib > 2000) state = 'WARNING';
  if (temp > 80 || vib > 3200) state = 'CRITICAL';

  const entry = {
    node_id: 'esp32-machine-node-01',
    _node_id: 'node01',
    timestamp: now,
    temperature: temp,
    humidity: hum,
    vibration: vib,
    state,
    uptime_s: Math.round((now - (mockTime - 300 * 5000)) / 1000),
    wifi_rssi: -45 - Math.floor(Math.random() * 25),
    _received_at: new Date(now).toISOString(),
  };

  mockHistory.push(entry);
  if (mockHistory.length > 500) mockHistory.shift();

  // Generate anomaly
  if (state !== 'HEALTHY') {
    mockAnomalies.push({
      node_id: 'esp32-machine-node-01',
      _node_id: 'node01',
      timestamp: now,
      severity: state,
      temperature: {
        anomaly: temp > 60,
        value: temp,
        reason: temp > 80 ? 'CRITICAL_OVERHEAT' : temp > 60 ? 'THRESHOLD_WARNING' : '',
      },
      vibration: {
        anomaly: vib > 2000,
        value: vib,
        reason: vib > 3200 ? 'CRITICAL_VIBRATION' : vib > 2000 ? 'THRESHOLD_WARNING' : '',
      },
      _received_at: new Date(now).toISOString(),
    });
    if (mockAnomalies.length > 200) mockAnomalies.shift();
  }

  return entry;
}

// Pre-fill history
for (let i = 0; i < 300; i++) advanceMock();

// Second node (pump)
function getMockNode02Data() {
  const temp = +(35 + Math.random() * 5).toFixed(1);
  const vib  = Math.round(400 + Math.random() * 200);
  return {
    node_id: 'esp32-machine-node-02',
    _node_id: 'node02',
    timestamp: Date.now(),
    temperature: temp,
    humidity: +(60 + Math.random() * 10).toFixed(1),
    vibration: vib,
    state: 'HEALTHY',
    uptime_s: 86400 + Math.floor(Math.random() * 3600),
    wifi_rssi: -38 - Math.floor(Math.random() * 15),
    _received_at: new Date().toISOString(),
  };
}

export function getMockNodes() {
  const latest01 = mockHistory[mockHistory.length - 1];
  const latest02 = getMockNode02Data();
  return {
    node01: {
      last_data: latest01,
      last_seen: latest01._received_at,
      online: true,
    },
    node02: {
      last_data: latest02,
      last_seen: latest02._received_at,
      online: true,
    },
  };
}

export function getMockSensors(nodeId) {
  if (nodeId === 'node02') return [getMockNode02Data()];
  advanceMock();
  return [...mockHistory];
}

export function getMockAnomalies() {
  return [...mockAnomalies];
}

export function getMockHeartbeats() {
  return {
    node01: {
      node_id: 'esp32-machine-node-01',
      uptime_s: mockHistory[mockHistory.length - 1]?.uptime_s || 0,
      free_heap: 162000 + Math.floor(Math.random() * 20000),
      wifi_rssi: -50 - Math.floor(Math.random() * 20),
      state: mockHistory[mockHistory.length - 1]?.state || 'HEALTHY',
    },
    node02: {
      node_id: 'esp32-machine-node-02',
      uptime_s: 90000,
      free_heap: 185000,
      wifi_rssi: -42,
      state: 'HEALTHY',
    },
  };
}
