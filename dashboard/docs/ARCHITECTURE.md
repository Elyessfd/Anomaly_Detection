# Machine Health Monitoring — Communication Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        ESP32 NODE                                │
│                                                                  │
│  ┌─────────┐   ┌─────────┐                                      │
│  │  DHT22  │   │ SW-420  │   Sensors                             │
│  │  (Temp) │   │  (Vib)  │                                       │
│  └────┬────┘   └────┬────┘                                       │
│       │              │                                            │
│       ▼              ▼                                            │
│  ┌──────────────────────────┐                                    │
│  │    Sensor Read Layer     │  Every 2 seconds                   │
│  │  (averaging, filtering) │                                     │
│  └────────────┬─────────────┘                                    │
│               │                                                  │
│               ▼                                                  │
│  ┌──────────────────────────┐                                    │
│  │  Edge Anomaly Detection  │  Threshold + Z-Score               │
│  │   HEALTHY → WARNING →    │                                    │
│  │       CRITICAL           │                                    │
│  └────────────┬─────────────┘                                    │
│               │                                                  │
│               ▼                                                  │
│  ┌──────────────────────────┐                                    │
│  │      MQTT Publisher      │  Publishes sensor data, alerts,    │
│  │                          │  heartbeats over WiFi              │
│  └────────────┬─────────────┘                                    │
│               │                                                  │
└───────────────┼──────────────────────────────────────────────────┘
                │  WiFi / MQTT
                ▼
┌──────────────────────────────┐
│       MQTT BROKER            │
│     (Mosquitto / HiveMQ)     │
│                              │
│  Topics:                     │
│   machine/node01/sensors     │
│   machine/node01/anomaly     │
│   machine/node01/health      │
│   machine/node01/heartbeat   │
│   machine/node01/cmd    ◄──  │  (Commands FROM server)
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PYTHON SERVER                                 │
│                                                                  │
│  ┌────────────────────┐    ┌──────────────────────────┐          │
│  │  MQTT Subscriber   │───▶│   In-Memory Data Store   │          │
│  │  (paho-mqtt)       │    │   sensor_history[]       │          │
│  │                    │    │   anomaly_history[]      │          │
│  └────────────────────┘    │   node_status{}          │          │
│                            └──────────┬───────────────┘          │
│                                       │                          │
│                                       ▼                          │
│                          ┌────────────────────────┐              │
│                          │    Flask REST API       │              │
│                          │                         │              │
│                          │  GET  /api/nodes        │              │
│                          │  GET  /api/sensors      │              │
│                          │  GET  /api/anomalies    │              │
│                          │  GET  /api/heartbeats   │              │
│                          │  POST /api/command      │              │
│                          └────────────────────────┘              │
│                                       │                          │
└───────────────────────────────────────┼──────────────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │    Dashboard /   │
                              │    Mobile App    │
                              └──────────────────┘
```

---

## MQTT Topic Structure

| Topic                          | Direction     | QoS | Retained | Description                        |
|-------------------------------|---------------|-----|----------|------------------------------------|
| `machine/node01/sensors`      | ESP32 → Server| 0   | No       | Periodic sensor readings           |
| `machine/node01/anomaly`      | ESP32 → Server| 1   | Yes      | Anomaly detection alerts           |
| `machine/node01/health`       | ESP32 → Server| 1   | Yes      | Online/offline status (LWT)        |
| `machine/node01/heartbeat`    | ESP32 → Server| 0   | No       | Heartbeat with diagnostics         |
| `machine/node01/cmd`          | Server → ESP32| 1   | No       | Remote commands                    |

---

## Message Payloads (JSON)

### Sensor Data (`sensors`)
```json
{
  "node_id": "esp32-machine-node-01",
  "timestamp": 125000,
  "temperature": 45.20,
  "humidity": 62.50,
  "vibration": 1200,
  "state": "HEALTHY",
  "uptime_s": 3600,
  "wifi_rssi": -55
}
```

### Anomaly Alert (`anomaly`)
```json
{
  "node_id": "esp32-machine-node-01",
  "timestamp": 125000,
  "severity": "WARNING",
  "temperature": {
    "anomaly": true,
    "value": 72.5,
    "reason": "THRESHOLD_WARNING"
  },
  "vibration": {
    "anomaly": false,
    "value": 800,
    "reason": ""
  }
}
```

### Heartbeat (`heartbeat`)
```json
{
  "node_id": "esp32-machine-node-01",
  "uptime_s": 7200,
  "free_heap": 180000,
  "wifi_rssi": -62,
  "state": "HEALTHY"
}
```

### Health / LWT (`health`)
```json
{"status": "online"}
```
```json
{"status": "offline"}
```

### Commands (`cmd`) — Server → ESP32
```json
{"set_interval": 2000}
{"request_reading": true}
{"reset_state": true}
{"reboot": true}
```

---

## Anomaly Detection (Edge)

Two-layer detection runs **on the ESP32** every 2 seconds:

### Layer 1: Threshold-Based
| Parameter    | Warning           | Critical          |
|-------------|-------------------|-------------------|
| Temperature | < 10°C or > 60°C | > 80°C            |
| Vibration   | > 2000 (ADC)      | > 3200 (ADC)      |

### Layer 2: Z-Score Statistical
- Sliding window of **50 samples**
- Z-score threshold: **±3.0 σ**
- Detects subtle drift or sudden spikes that may not breach absolute thresholds

### State Machine
```
  HEALTHY ──(warning trigger)──▶ WARNING ──(critical trigger)──▶ CRITICAL
     ▲                              │                               │
     └──────────(reset cmd)─────────┴───────────(reset cmd)─────────┘
```

---

## Wiring Diagram

```
ESP32 DevKit v1
┌─────────────────────┐
│                     │
│  GPIO4  ◄──────────── DHT22 DATA (with 10kΩ pull-up to 3.3V)
│  GPIO34 ◄──────────── SW-420 ANALOG OUT
│  GPIO2  ──────────▶── Built-in LED (WiFi status)
│  GPIO15 ──────────▶── External LED (Anomaly alert)
│  GPIO27 ──────────▶── Buzzer (Critical alert)
│                     │
│  3.3V   ──────────▶── DHT22 VCC, SW-420 VCC
│  GND    ──────────▶── DHT22 GND, SW-420 GND
│                     │
└─────────────────────┘
```

---

## Quick Start

### 1. MQTT Broker (install Mosquitto)
```bash
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### 2. ESP32 Firmware
1. Open `esp32_firmware/main.ino` in Arduino IDE / PlatformIO
2. Install libraries: `PubSubClient`, `DHT sensor library`, `ArduinoJson`
3. Update WiFi and MQTT broker settings
4. Flash to ESP32

### 3. Python Server
```bash
cd server/
pip install -r requirements.txt
python mqtt_subscriber.py
```

### 4. Test Commands
```bash
# Request immediate reading
curl -X POST http://localhost:5000/api/command \
  -H "Content-Type: application/json" \
  -d '{"node_id":"node01","command":{"request_reading":true}}'

# Change sampling rate to 2 seconds
curl -X POST http://localhost:5000/api/command \
  -H "Content-Type: application/json" \
  -d '{"node_id":"node01","command":{"set_interval":2000}}'

# Get latest sensor data
curl http://localhost:5000/api/sensors?node=node01&last=10

# Get anomaly history
curl http://localhost:5000/api/anomalies
```
