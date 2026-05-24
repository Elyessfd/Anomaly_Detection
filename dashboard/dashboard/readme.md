# 🖥️ Machine Health Monitoring Dashboard

Real-time industrial monitoring dashboard for ESP32 sensor nodes. Built with React and Recharts, featuring a dark industrial theme, live gauges, streaming charts, anomaly alerts, and remote node control via MQTT.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-2.x-8884d8)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📸 Dashboard Views

| Overview | Charts | Alerts | Control |
|----------|--------|--------|---------|
| Node cards, stat cards, gauges, live charts, activity log | Full-screen temperature & vibration charts with threshold lines | Anomaly feed with severity, reasons, timestamps | Select node → send MQTT commands |

---

## ✨ Features

- **🔴 Live Monitoring** — Polls every 3 seconds, real-time chart updates
- **📊 Streaming Charts** — Temperature & vibration area charts with warning/critical threshold lines
- **🎯 SVG Gauges** — Animated arc gauges with green/yellow/red zones for temp, vibration, humidity
- **🗂️ Multi-Node Overview** — Grid of node cards showing health, metrics, uptime, RSSI at a glance
- **🔔 Anomaly Feed** — Scrollable alert list with severity badges, detection reasons, time-ago labels
- **🎮 Remote Control** — Change sampling rate, request immediate readings, reset state, reboot nodes
- **📋 Activity Log** — Merged timeline of sensor data + anomaly events
- **🌗 Dark Industrial Theme** — JetBrains Mono font, neon cyan/amber accents, pulsing glow on critical nodes
- **📱 Fully Responsive** — Works on desktop, tablet, and mobile
- **⚡ Demo Mode** — Works instantly without any backend (auto-generates simulated data)

---

## 🚀 Quick Start

### Demo Mode (no backend needed)

```bash
cd dashboard
npm install
npm start
```

Opens at **http://localhost:3000** with simulated sensor data. No MQTT broker, no Flask server, no ESP32 required — the dashboard generates realistic mock data including temperature drift, vibration spikes, and anomaly events so you can explore every feature immediately.

> **What you'll see in Demo Mode:**
> - Two simulated nodes (node01 + node02) with live-updating metrics
> - Temperature and vibration charts with data history
> - Periodic anomaly alerts when values cross thresholds
> - All 4 tabs fully functional (commands show `[DEMO]` prefix in the log)
> - A yellow **"Demo Mode — No backend connected"** banner in the header

### Live Mode (with backend)

You need 3 services running — an MQTT broker, the Flask backend, and a data source (real ESP32 or the included simulator).

**Terminal 1 — MQTT Broker:**
```bash
# Install Mosquitto: https://mosquitto.org/download/
mosquitto -v

# Or with Docker:
docker run -d -p 1883:1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
```

**Terminal 2 — Flask Backend:**
```bash
cd server
pip install paho-mqtt flask flask-cors
python mqtt_subscriber.py
```

**Terminal 3 — Data Source (pick one):**
```bash
# Option A: ESP32 simulator (no hardware)
cd server
python test_publisher.py

# Option B: Real ESP32
# Flash esp32_firmware/main.ino with your WiFi + broker IP
```

**Open the dashboard:**
```
http://localhost:5000        ← Production (served by Flask)
http://localhost:3000        ← Development (npm start, hot reload)
```

The dashboard auto-detects the backend — when Flask is reachable, it switches from Demo Mode to Live Mode automatically. No configuration needed.

---

## 🗂️ Project Structure

```
dashboard/
├── public/
│   └── index.html                  # HTML shell (dark background)
├── src/
│   ├── index.js                    # Entry point
│   ├── App.jsx                     # Main app — 4 tab layout + state
│   ├── styles/
│   │   └── global.css              # Full dark industrial theme
│   ├── hooks/
│   │   └── useMonitorData.js       # Polling hook — real API or demo mock
│   ├── utils/
│   │   └── api.js                  # API client + mock data generator
│   └── components/
│       ├── Header.jsx              # Top bar — logo, connection status, demo badge
│       ├── StatCards.jsx           # 5 metric cards — temp, vib, humidity, state, nodes
│       ├── NodeCards.jsx           # Multi-node grid — health, metrics, uptime, RSSI
│       ├── SensorChart.jsx        # Real-time area charts (Recharts) with thresholds
│       ├── GaugeDisplay.jsx       # SVG arc gauges — temp, vibration, humidity
│       ├── AnomalyFeed.jsx        # Alert feed — severity, reasons, timestamps
│       ├── CommandPanel.jsx       # Remote control — interval, read, reset, reboot
│       └── ActivityLog.jsx        # Live log — sensor reads + anomaly events merged
├── build/                          # Production build (ready to deploy)
├── package.json
└── README.md                       # ← You are here
```

---

## 🧭 Dashboard Tabs

### 1. Overview
The main dashboard. Everything at a glance:
- **Stat cards** — Current temperature, vibration, humidity, machine state, active node count
- **Node cards** — Click to select a node; border color reflects health state (green/amber/red/gray)
- **Live gauges** — SVG arc gauges with color zones matching your anomaly thresholds
- **Streaming charts** — Temperature and vibration over time with WARN/CRIT reference lines
- **Anomaly feed** — Latest alerts with severity, sensor values, detection reasons
- **Activity log** — Merged timeline of all events

### 2. Charts
Dedicated charting view:
- Live gauges at the top
- Full-width temperature chart
- Full-width vibration chart
- Combined dual-axis overlay chart (temp + vibration on same timeline)

### 3. Alerts
Focused anomaly view:
- Full scrollable list of all detected anomalies
- Each alert shows: severity badge, node ID, affected sensor, value, detection reason, time-ago
- Alerts are sorted newest-first

### 4. Control
Remote node management:
- Node card grid — click to select target
- **Request Reading** — Force an immediate sensor publish
- **Reset State** — Clear WARNING/CRITICAL, return to HEALTHY
- **Set Interval** — Change the publish rate (1000ms – 60000ms)
- **Reboot** — Restart the ESP32 (with confirmation dialog)
- Command log shows sent commands with MQTT return codes

---

## 🔌 API Endpoints

The dashboard consumes these REST endpoints from the Flask backend:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/nodes` | All nodes with latest status |
| `GET` | `/api/sensors?node=node01&last=100` | Recent sensor readings |
| `GET` | `/api/anomalies?node=node01&last=50` | Recent anomaly alerts |
| `GET` | `/api/heartbeats` | Latest heartbeat per node |
| `POST` | `/api/command` | Send command to a node |

### Command Payload Example
```json
POST /api/command
{
  "node_id": "node01",
  "command": { "set_interval": 2000 }
}
```

---

## ⚙️ Configuration

### API URL

By default the dashboard connects to `http://localhost:5000`. To change:

```bash
# Development
REACT_APP_API_URL=http://192.168.1.100:5000 npm start

# Production build
REACT_APP_API_URL=https://your-server.com npx react-scripts build
```

When served by Flask (production mode), the API URL is automatically the same origin — no configuration needed.

### Polling Interval

The dashboard polls every 3 seconds. To change, edit `src/hooks/useMonitorData.js`:

```js
const POLL_INTERVAL = 3000;  // milliseconds
```

### Anomaly Thresholds (chart reference lines)

Chart threshold lines are defined in `src/components/SensorChart.jsx`:

```jsx
// Temperature
<ReferenceLine y={60} />   // Warning line
<ReferenceLine y={80} />   // Critical line

// Vibration
<ReferenceLine y={2000} /> // Warning line
<ReferenceLine y={3200} /> // Critical line
```

These should match the thresholds in your ESP32 firmware (`main.ino`).

---

## 📦 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 18.x | UI framework |
| `recharts` | 2.x | Charting library (area charts, tooltips, reference lines) |
| `lucide-react` | latest | Icon set (Thermometer, Activity, AlertTriangle, etc.) |

No UI framework (Material UI, Tailwind, etc.) — all styles are custom CSS in `global.css` for full control and zero bloat.

---

## 🎨 Theme Customization

All colors, fonts, and spacing are CSS custom properties in `src/styles/global.css`:

```css
:root {
  /* Change the whole color scheme here */
  --bg-primary:     #0a0e17;      /* Main background */
  --bg-card:        #1a2235;      /* Card background */
  --accent-cyan:    #00e5ff;      /* Primary accent */
  --accent-amber:   #ffab00;      /* Temperature color */
  --healthy:        #00e676;      /* Healthy state */
  --warning:        #ffab00;      /* Warning state */
  --critical:       #ff1744;      /* Critical state */
  --font-sans:      'Inter';      /* UI font */
  --font-mono:      'JetBrains Mono';  /* Data font */
}
```

---

## 🔀 Demo Mode vs Live Mode

| Aspect | Demo Mode | Live Mode |
|--------|-----------|-----------|
| **Activation** | Automatic when Flask API is unreachable | Automatic when Flask API responds |
| **Data source** | `src/utils/api.js` mock generator | Flask REST API → MQTT → ESP32 |
| **Nodes** | 2 simulated nodes (node01 + node02) | Real nodes from MQTT |
| **Anomalies** | Random spikes trigger alerts | Real threshold + z-score detection on ESP32 |
| **Commands** | Logged with `[DEMO]` prefix, not sent | Sent via MQTT to the target ESP32 |
| **Charts** | Pre-filled with 25 min of history | Builds up from live data |
| **Indicator** | Yellow banner: "Demo Mode — No backend connected" | Green dot: "API Connected" |
| **Switching** | Instant — no restart needed | Instant — checks every 3s poll cycle |

Both modes use **identical UI code** — the only difference is the data source. This means:
- You can design and test UI changes without any hardware or backend
- The dashboard gracefully degrades if the backend goes down mid-session
- Stakeholders can preview the dashboard before the hardware is ready

---

## 🏗️ Build for Production

```bash
cd dashboard
npm run build
```

The `build/` folder contains static files ready to deploy. The Flask server (`server/mqtt_subscriber.py`) is already configured to serve them:

```python
# In mqtt_subscriber.py — already set up
app = Flask(__name__, static_folder='../dashboard/build', static_url_path='')
```

So in production, you just run:
```bash
python server/mqtt_subscriber.py
# → Dashboard + API both at http://localhost:5000
```

No separate web server (Nginx, Apache) needed for simple deployments.

---

## 🐛 Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dashboard shows "Demo Mode" | Flask backend not running or wrong URL | Start Flask: `python mqtt_subscriber.py` |
| Charts are empty in Live Mode | No sensor data received yet | Wait for ESP32/simulator to publish, or check Flask terminal for `[DATA]` logs |
| Commands say "Failed" | Flask can't reach MQTT broker | Ensure Mosquitto is running on the same machine |
| "Demo Mode" flickers on/off | Network instability to Flask | Check `REACT_APP_API_URL` or CORS settings |
| Blank page after `npm start` | Missing dependencies | Run `npm install` first |
| `react-scripts` not found | `node_modules` not installed | Run `npm install` |
| Build fails | Old Node.js version | Requires Node.js 16+ (`node -v` to check) |


