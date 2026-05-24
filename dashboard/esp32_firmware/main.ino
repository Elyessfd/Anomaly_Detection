/*
 * ============================================================
 *  Machine Health Monitoring Node — ESP32 Firmware
 * ============================================================
 *  Sensors : DHT22 (temperature) + SW-420 (vibration)
 *  Protocol: MQTT (TLS optional)
 *  Models  : Edge anomaly detection (threshold + z-score)
 *  Broker  : Configurable (Mosquitto / HiveMQ / cloud)
 * ============================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <math.h>

// ─────────────────────── PIN CONFIGURATION ───────────────────
#define DHT_PIN          4        // GPIO4 — DHT22 data pin
#define DHT_TYPE         DHT22
#define VIBRATION_PIN    34       // GPIO34 — SW-420 analog out
#define LED_STATUS_PIN   2        // Built-in LED for status
#define LED_ALERT_PIN    15       // External LED for anomaly alert
#define BUZZER_PIN       27       // Optional buzzer for critical alerts

// ─────────────────────── WIFI CONFIG ─────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ─────────────────────── MQTT CONFIG ─────────────────────────
const char* MQTT_BROKER   = "192.168.1.100";   // Broker IP or hostname
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "";                 // Leave empty if no auth
const char* MQTT_PASS     = "";
const char* MQTT_CLIENT   = "esp32-machine-node-01";

// ─────── MQTT TOPICS ────────
const char* TOPIC_SENSOR_DATA    = "machine/node01/sensors";
const char* TOPIC_ANOMALY_ALERT  = "machine/node01/anomaly";
const char* TOPIC_HEALTH_STATUS  = "machine/node01/health";
const char* TOPIC_HEARTBEAT      = "machine/node01/heartbeat";
const char* TOPIC_CMD            = "machine/node01/cmd";        // Incoming commands

// ─────────────────────── TIMING CONFIG ───────────────────────
#define SENSOR_READ_INTERVAL   2000    // Read sensors every 2 s
#define MQTT_PUBLISH_INTERVAL  5000    // Publish data every 5 s
#define HEARTBEAT_INTERVAL     30000   // Heartbeat every 30 s
#define RECONNECT_INTERVAL     5000    // Reconnect attempt every 5 s

// ─────────────────────── ANOMALY DETECTION CONFIG ────────────
// --- Temperature thresholds ---
#define TEMP_MIN_WARN      10.0    // °C — low warning
#define TEMP_MAX_WARN      60.0    // °C — high warning
#define TEMP_MAX_CRITICAL   80.0   // °C — critical / shutdown level

// --- Vibration thresholds (raw ADC 0-4095) ---
#define VIB_WARN_THRESHOLD     2000
#define VIB_CRITICAL_THRESHOLD 3200

// --- Z-score anomaly detection window ---
#define ZSCORE_WINDOW       50     // Sliding window size
#define ZSCORE_THRESHOLD    3.0    // Standard deviations

// ─────────────────────── OBJECTS ──────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─────────────────────── STATE VARIABLES ─────────────────────
unsigned long lastSensorRead   = 0;
unsigned long lastMqttPublish  = 0;
unsigned long lastHeartbeat    = 0;
unsigned long lastReconnect    = 0;
unsigned long uptimeStart      = 0;

float currentTemp       = 0.0;
float currentHumidity   = 0.0;
int   currentVibration  = 0;

// Sliding window buffers for z-score
float tempBuffer[ZSCORE_WINDOW];
float vibBuffer[ZSCORE_WINDOW];
int   bufferIndex = 0;
bool  bufferFull  = false;

// Health state
enum HealthState { HEALTHY, WARNING, CRITICAL };
HealthState machineState = HEALTHY;

// Sampling mode (can be changed via MQTT command)
int publishInterval = MQTT_PUBLISH_INTERVAL;

// ══════════════════════════════════════════════════════════════
//                      SETUP
// ══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  Serial.println("\n[BOOT] Machine Health Monitoring Node v1.0");

  // Pin modes
  pinMode(LED_STATUS_PIN, OUTPUT);
  pinMode(LED_ALERT_PIN,  OUTPUT);
  pinMode(BUZZER_PIN,     OUTPUT);
  pinMode(VIBRATION_PIN,  INPUT);

  // Init sensor
  dht.begin();

  // Init buffers
  memset(tempBuffer, 0, sizeof(tempBuffer));
  memset(vibBuffer,  0, sizeof(vibBuffer));

  // Connect WiFi
  connectWiFi();

  // Configure MQTT
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);   // Increase if needed

  // Connect MQTT
  connectMQTT();

  uptimeStart = millis();
  Serial.println("[BOOT] System ready.\n");
}

// ══════════════════════════════════════════════════════════════
//                      MAIN LOOP
// ══════════════════════════════════════════════════════════════
void loop() {
  // ---- Ensure connections ----
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnect >= RECONNECT_INTERVAL) {
      lastReconnect = now;
      connectMQTT();
    }
  }
  mqtt.loop();   // Process incoming messages

  unsigned long now = millis();

  // ---- Read sensors at high frequency ----
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensors();
    runAnomalyDetection();
    updateStatusLEDs();
  }

  // ---- Publish data at configured interval ----
  if (now - lastMqttPublish >= (unsigned long)publishInterval) {
    lastMqttPublish = now;
    publishSensorData();
  }

  // ---- Heartbeat ----
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    publishHeartbeat();
  }
}

// ══════════════════════════════════════════════════════════════
//                   WiFi CONNECTION
// ══════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
    digitalWrite(LED_STATUS_PIN, !digitalRead(LED_STATUS_PIN));  // Blink
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" Connected!");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_STATUS_PIN, HIGH);
  } else {
    Serial.println(" FAILED — will retry.");
    digitalWrite(LED_STATUS_PIN, LOW);
  }
}

// ══════════════════════════════════════════════════════════════
//                   MQTT CONNECTION
// ══════════════════════════════════════════════════════════════
void connectMQTT() {
  Serial.print("[MQTT] Connecting to broker...");

  // Last Will & Testament — broker publishes this if we go offline
  const char* lwtMessage = "{\"status\":\"offline\"}";

  bool connected;
  if (strlen(MQTT_USER) > 0) {
    connected = mqtt.connect(MQTT_CLIENT, MQTT_USER, MQTT_PASS,
                             TOPIC_HEALTH_STATUS, 1, true, lwtMessage);
  } else {
    connected = mqtt.connect(MQTT_CLIENT,
                             TOPIC_HEALTH_STATUS, 1, true, lwtMessage);
  }

  if (connected) {
    Serial.println(" Connected!");

    // Subscribe to command topic
    mqtt.subscribe(TOPIC_CMD, 1);
    Serial.println("[MQTT] Subscribed to command topic.");

    // Publish online status (retained)
    mqtt.publish(TOPIC_HEALTH_STATUS, "{\"status\":\"online\"}", true);

  } else {
    Serial.print(" FAILED, rc=");
    Serial.println(mqtt.state());
  }
}

// ══════════════════════════════════════════════════════════════
//             MQTT INCOMING MESSAGE HANDLER
// ══════════════════════════════════════════════════════════════
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Parse incoming JSON command
  char msg[256];
  int len = min((int)length, 255);
  memcpy(msg, payload, len);
  msg[len] = '\0';

  Serial.printf("[MQTT-RX] Topic: %s | Payload: %s\n", topic, msg);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.println("[MQTT-RX] JSON parse error.");
    return;
  }

  // ── Command: change sampling rate ──
  if (doc.containsKey("set_interval")) {
    int newInterval = doc["set_interval"].as<int>();
    if (newInterval >= 1000 && newInterval <= 60000) {
      publishInterval = newInterval;
      Serial.printf("[CMD] Publish interval changed to %d ms\n", newInterval);
    }
  }

  // ── Command: request immediate reading ──
  if (doc.containsKey("request_reading")) {
    readSensors();
    publishSensorData();
    Serial.println("[CMD] Immediate reading sent.");
  }

  // ── Command: reset anomaly state ──
  if (doc.containsKey("reset_state")) {
    machineState = HEALTHY;
    digitalWrite(LED_ALERT_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println("[CMD] State reset to HEALTHY.");
  }

  // ── Command: reboot ──
  if (doc.containsKey("reboot")) {
    Serial.println("[CMD] Rebooting...");
    delay(1000);
    ESP.restart();
  }
}

// ══════════════════════════════════════════════════════════════
//                    SENSOR READING
// ══════════════════════════════════════════════════════════════
void readSensors() {
  // --- DHT22 ---
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) currentTemp     = t;
  if (!isnan(h)) currentHumidity = h;

  // --- SW-420 (analog) ---
  // Take multiple samples and average for stability
  long vibSum = 0;
  const int samples = 10;
  for (int i = 0; i < samples; i++) {
    vibSum += analogRead(VIBRATION_PIN);
    delayMicroseconds(500);
  }
  currentVibration = vibSum / samples;

  // Push into sliding window buffers
  tempBuffer[bufferIndex] = currentTemp;
  vibBuffer[bufferIndex]  = (float)currentVibration;
  bufferIndex++;
  if (bufferIndex >= ZSCORE_WINDOW) {
    bufferIndex = 0;
    bufferFull  = true;
  }

  Serial.printf("[SENSOR] Temp=%.1f°C  Hum=%.1f%%  Vib=%d\n",
                currentTemp, currentHumidity, currentVibration);
}

// ══════════════════════════════════════════════════════════════
//               ANOMALY DETECTION (EDGE)
// ══════════════════════════════════════════════════════════════

// Helper: compute mean of float array
float computeMean(float* buf, int count) {
  float sum = 0;
  for (int i = 0; i < count; i++) sum += buf[i];
  return sum / count;
}

// Helper: compute standard deviation
float computeStdDev(float* buf, int count, float mean) {
  float sumSq = 0;
  for (int i = 0; i < count; i++) {
    float diff = buf[i] - mean;
    sumSq += diff * diff;
  }
  return sqrt(sumSq / count);
}

void runAnomalyDetection() {
  bool tempAnomaly = false;
  bool vibAnomaly  = false;
  String tempReason = "";
  String vibReason  = "";
  HealthState newState = HEALTHY;

  // ── 1. THRESHOLD-BASED DETECTION ──

  // Temperature
  if (currentTemp >= TEMP_MAX_CRITICAL) {
    tempAnomaly = true;
    tempReason  = "CRITICAL_OVERHEAT";
    newState    = CRITICAL;
  } else if (currentTemp >= TEMP_MAX_WARN || currentTemp <= TEMP_MIN_WARN) {
    tempAnomaly = true;
    tempReason  = "THRESHOLD_WARNING";
    if (newState < WARNING) newState = WARNING;
  }

  // Vibration
  if (currentVibration >= VIB_CRITICAL_THRESHOLD) {
    vibAnomaly = true;
    vibReason  = "CRITICAL_VIBRATION";
    newState   = CRITICAL;
  } else if (currentVibration >= VIB_WARN_THRESHOLD) {
    vibAnomaly = true;
    vibReason  = "THRESHOLD_WARNING";
    if (newState < WARNING) newState = WARNING;
  }

  // ── 2. Z-SCORE STATISTICAL DETECTION ──
  if (bufferFull) {
    int count = ZSCORE_WINDOW;

    // Temperature z-score
    float tempMean   = computeMean(tempBuffer, count);
    float tempStdDev = computeStdDev(tempBuffer, count, tempMean);
    if (tempStdDev > 0.01) {   // Avoid division by ~0
      float tempZ = fabs(currentTemp - tempMean) / tempStdDev;
      if (tempZ > ZSCORE_THRESHOLD && !tempAnomaly) {
        tempAnomaly = true;
        tempReason  = "ZSCORE_ANOMALY (z=" + String(tempZ, 2) + ")";
        if (newState < WARNING) newState = WARNING;
      }
    }

    // Vibration z-score
    float vibMean   = computeMean(vibBuffer, count);
    float vibStdDev = computeStdDev(vibBuffer, count, vibMean);
    if (vibStdDev > 0.01) {
      float vibZ = fabs((float)currentVibration - vibMean) / vibStdDev;
      if (vibZ > ZSCORE_THRESHOLD && !vibAnomaly) {
        vibAnomaly = true;
        vibReason  = "ZSCORE_ANOMALY (z=" + String(vibZ, 2) + ")";
        if (newState < WARNING) newState = WARNING;
      }
    }
  }

  // ── 3. UPDATE STATE & PUBLISH ALERT ──
  machineState = newState;

  if (tempAnomaly || vibAnomaly) {
    publishAnomalyAlert(tempAnomaly, tempReason, vibAnomaly, vibReason);
  }
}

// ══════════════════════════════════════════════════════════════
//                 MQTT PUBLISH FUNCTIONS
// ══════════════════════════════════════════════════════════════

void publishSensorData() {
  if (!mqtt.connected()) return;

  StaticJsonDocument<512> doc;
  doc["node_id"]      = MQTT_CLIENT;
  doc["timestamp"]    = millis();
  doc["temperature"]  = round(currentTemp * 100.0) / 100.0;
  doc["humidity"]     = round(currentHumidity * 100.0) / 100.0;
  doc["vibration"]    = currentVibration;
  doc["state"]        = (machineState == HEALTHY)  ? "HEALTHY"  :
                        (machineState == WARNING)  ? "WARNING"  : "CRITICAL";
  doc["uptime_s"]     = (millis() - uptimeStart) / 1000;
  doc["wifi_rssi"]    = WiFi.RSSI();

  char buffer[512];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_SENSOR_DATA, buffer);

  Serial.printf("[MQTT-TX] Sensor data published → %s\n", TOPIC_SENSOR_DATA);
}

void publishAnomalyAlert(bool tempAnom, String tempReason,
                          bool vibAnom,  String vibReason) {
  if (!mqtt.connected()) return;

  StaticJsonDocument<512> doc;
  doc["node_id"]    = MQTT_CLIENT;
  doc["timestamp"]  = millis();
  doc["severity"]   = (machineState == CRITICAL) ? "CRITICAL" : "WARNING";

  JsonObject tempObj = doc.createNestedObject("temperature");
  tempObj["anomaly"] = tempAnom;
  tempObj["value"]   = currentTemp;
  tempObj["reason"]  = tempReason;

  JsonObject vibObj = doc.createNestedObject("vibration");
  vibObj["anomaly"]  = vibAnom;
  vibObj["value"]    = currentVibration;
  vibObj["reason"]   = vibReason;

  char buffer[512];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_ANOMALY_ALERT, buffer, true);   // Retained

  Serial.printf("[ALERT] Anomaly published → %s\n", TOPIC_ANOMALY_ALERT);
}

void publishHeartbeat() {
  if (!mqtt.connected()) return;

  StaticJsonDocument<256> doc;
  doc["node_id"]    = MQTT_CLIENT;
  doc["uptime_s"]   = (millis() - uptimeStart) / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["state"]      = (machineState == HEALTHY)  ? "HEALTHY"  :
                      (machineState == WARNING)  ? "WARNING"  : "CRITICAL";

  char buffer[256];
  serializeJson(doc, buffer);
  mqtt.publish(TOPIC_HEARTBEAT, buffer);

  Serial.printf("[HEARTBEAT] Published → %s\n", TOPIC_HEARTBEAT);
}

// ══════════════════════════════════════════════════════════════
//                   STATUS LEDs / BUZZER
// ══════════════════════════════════════════════════════════════
void updateStatusLEDs() {
  switch (machineState) {
    case HEALTHY:
      digitalWrite(LED_ALERT_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      break;
    case WARNING:
      digitalWrite(LED_ALERT_PIN, HIGH);
      digitalWrite(BUZZER_PIN, LOW);
      break;
    case CRITICAL:
      digitalWrite(LED_ALERT_PIN, HIGH);
      // Short buzzer pulse
      digitalWrite(BUZZER_PIN, HIGH);
      delay(100);
      digitalWrite(BUZZER_PIN, LOW);
      break;
  }
}
