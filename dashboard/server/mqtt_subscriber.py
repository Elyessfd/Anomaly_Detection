"""
============================================================
 Machine Health Monitoring — MQTT Subscriber + Flask Server
============================================================
 Receives sensor data and anomaly alerts from ESP32 via MQTT.
 Stores data and exposes a REST API for the React dashboard.
 Also serves the built React dashboard at / (production mode).
============================================================
"""

import json
import os
import time
import threading
from datetime import datetime, timezone
from collections import deque

import paho.mqtt.client as mqtt
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# ─────────────────────── CONFIG ───────────────────────────────
MQTT_BROKER   = os.environ.get("MQTT_BROKER", "192.168.1.100")
MQTT_PORT     = int(os.environ.get("MQTT_PORT", 1883))
MQTT_USER     = os.environ.get("MQTT_USER", "")
MQTT_PASS     = os.environ.get("MQTT_PASS", "")

# Topics to subscribe
TOPICS = [
    ("machine/+/sensors",   1),
    ("machine/+/anomaly",   1),
    ("machine/+/health",    1),
    ("machine/+/heartbeat", 1),
]

# In-memory storage (replace with DB for production)
MAX_HISTORY = 1000

# Path to React build
REACT_BUILD = os.path.join(os.path.dirname(__file__), '..', 'dashboard', 'build')

# ─────────────────────── DATA STORE ───────────────────────────
sensor_history   = deque(maxlen=MAX_HISTORY)
anomaly_history  = deque(maxlen=MAX_HISTORY)
node_status      = {}        # node_id → latest status
heartbeat_log    = {}        # node_id → last heartbeat


# ══════════════════════════════════════════════════════════════
#                    MQTT CALLBACKS
# ══════════════════════════════════════════════════════════════
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[MQTT] Connected to broker at {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(TOPICS)
        print(f"[MQTT] Subscribed to {len(TOPICS)} topics.")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


def on_message(client, userdata, msg):
    topic   = msg.topic
    payload = msg.payload.decode("utf-8", errors="replace")
    ts      = datetime.now(timezone.utc).isoformat()

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        print(f"[MQTT] Bad JSON on {topic}: {payload}")
        return

    # Extract node_id from topic:  machine/<node_id>/<type>
    parts     = topic.split("/")
    node_id   = parts[1] if len(parts) >= 3 else "unknown"
    msg_type  = parts[2] if len(parts) >= 3 else "unknown"

    data["_received_at"]  = ts
    data["_topic"]        = topic
    data["_node_id"]      = node_id

    # Route by message type
    if msg_type == "sensors":
        sensor_history.append(data)
        node_status[node_id] = {
            "last_data": data,
            "last_seen": ts,
            "online": True,
        }
        state = data.get("state", "UNKNOWN")
        print(f"[DATA] {node_id} | T={data.get('temperature')}°C "
              f"Vib={data.get('vibration')} | State={state}")

    elif msg_type == "anomaly":
        anomaly_history.append(data)
        severity = data.get("severity", "?")
        print(f"[⚠ ANOMALY] {node_id} | Severity={severity} | {json.dumps(data)}")

    elif msg_type == "health":
        status = data.get("status", "unknown")
        node_status.setdefault(node_id, {})
        node_status[node_id]["online"] = (status == "online")
        print(f"[HEALTH] {node_id} → {status}")

    elif msg_type == "heartbeat":
        heartbeat_log[node_id] = data
        print(f"[HEARTBEAT] {node_id} | uptime={data.get('uptime_s')}s "
              f"heap={data.get('free_heap')} rssi={data.get('wifi_rssi')}")


def on_disconnect(client, userdata, rc, properties=None):
    print(f"[MQTT] Disconnected (rc={rc}). Reconnecting...")


# ══════════════════════════════════════════════════════════════
#                    MQTT CLIENT SETUP
# ══════════════════════════════════════════════════════════════
mqtt_client = mqtt.Client(
    client_id="python-monitor-server",
    protocol=mqtt.MQTTv5,
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
)

if MQTT_USER:
    mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)

mqtt_client.on_connect    = on_connect
mqtt_client.on_message    = on_message
mqtt_client.on_disconnect = on_disconnect


def start_mqtt():
    """Run MQTT client loop in a background thread."""
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        mqtt_client.loop_forever()
    except Exception as e:
        print(f"[MQTT] Could not connect to broker: {e}")
        print("[MQTT] Server will run in API-only mode (no live data).")


# ══════════════════════════════════════════════════════════════
#                    FLASK REST API
# ══════════════════════════════════════════════════════════════
app = Flask(__name__, static_folder=REACT_BUILD, static_url_path='')
CORS(app)


# ── Serve React Dashboard ────────────────────────────────────
@app.route('/')
def serve_react():
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(404)
def not_found(e):
    # SPA fallback: serve index.html for client-side routing
    if request.path.startswith('/api'):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(app.static_folder, 'index.html')


# ── API Endpoints ─────────────────────────────────────────────
@app.route("/api/nodes")
def get_nodes():
    """Return all known nodes and their latest status."""
    return jsonify(node_status)


@app.route("/api/sensors")
def get_sensor_data():
    """Return recent sensor readings. Optional filters: node, last (count)."""
    node  = request.args.get("node")
    last  = int(request.args.get("last", 100))

    data = list(sensor_history)
    if node:
        data = [d for d in data if d.get("_node_id") == node]
    return jsonify(data[-last:])


@app.route("/api/anomalies")
def get_anomalies():
    """Return recent anomaly alerts."""
    node  = request.args.get("node")
    last  = int(request.args.get("last", 50))

    data = list(anomaly_history)
    if node:
        data = [d for d in data if d.get("_node_id") == node]
    return jsonify(data[-last:])


@app.route("/api/heartbeats")
def get_heartbeats():
    """Return latest heartbeat per node."""
    return jsonify(heartbeat_log)


@app.route("/api/command", methods=["POST"])
def send_command():
    """
    Send a command to an ESP32 node via MQTT.

    POST JSON body:
    {
      "node_id": "node01",
      "command": { "set_interval": 2000 }
    }

    Supported commands:
      - {"set_interval": <ms>}      — Change publish interval (1000-60000)
      - {"request_reading": true}   — Request immediate sensor reading
      - {"reset_state": true}       — Reset anomaly state to HEALTHY
      - {"reboot": true}            — Reboot the ESP32
    """
    body = request.get_json()
    if not body or "node_id" not in body or "command" not in body:
        return jsonify({"error": "Provide node_id and command"}), 400

    node_id = body["node_id"]
    command = body["command"]
    topic   = f"machine/{node_id}/cmd"

    payload = json.dumps(command)
    result  = mqtt_client.publish(topic, payload, qos=1)

    return jsonify({
        "status":  "sent",
        "topic":   topic,
        "payload": command,
        "mqtt_rc": result.rc,
    })


# ══════════════════════════════════════════════════════════════
#                       MAIN
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    # Start MQTT in background
    mqtt_thread = threading.Thread(target=start_mqtt, daemon=True)
    mqtt_thread.start()
    print("[SERVER] MQTT thread started.")

    # Start Flask
    port = int(os.environ.get("PORT", 5000))
    print(f"[SERVER] Starting on port {port}...")
    print(f"[SERVER] Dashboard: http://localhost:{port}")
    print(f"[SERVER] API:       http://localhost:{port}/api/nodes")
    app.run(host="0.0.0.0", port=port, debug=False)
