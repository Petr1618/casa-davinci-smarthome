/*
 * Casa DaVinci - Living Room Sensor
 * ESP32 DevKit V1 + AM2302 (DHT22) + SSD1306 OLED
 *
 * Publishes temperature and humidity to MQTT broker (Cerbo GX)
 * Displays readings on OLED screen
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ==================== CONFIGURATION ====================

// WiFi Settings
const char* ssid = "YOUR_WIFI_SSID";           // <-- UPDATE THIS
const char* password = "YOUR_WIFI_PASSWORD";   // <-- UPDATE THIS

// MQTT Settings (Cerbo GX)
const char* mqtt_server = "192.168.1.210";
const int mqtt_port = 1883;
const char* mqtt_client_id = "esp32_living_room";

// MQTT Topics
const char* topic_sensor = "home/living_room/sensor";
const char* topic_temperature = "home/living_room/temperature";
const char* topic_humidity = "home/living_room/humidity";

// DHT22 Sensor
#define DHTPIN 14          // GPIO 14 (D14)
#define DHTTYPE DHT22

// OLED Display
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

// Timing
const unsigned long PUBLISH_INTERVAL = 10000;  // 10 seconds
const unsigned long WIFI_SCAN_INTERVAL = 60000; // 1 minute

// ==================== OBJECTS ====================

WiFiClient espClient;
PubSubClient mqtt(espClient);
DHT dht(DHTPIN, DHTTYPE);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ==================== VARIABLES ====================

unsigned long lastPublishTime = 0;
unsigned long lastWifiScanTime = 0;
float temperature = 0;
float humidity = 0;
bool mqttConnected = false;
int wifiSignal = 0;

// ==================== SETUP ====================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== Casa DaVinci - Living Room Sensor ===\n");

  // Initialize OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("SSD1306 OLED initialization failed!");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Casa DaVinci");
    display.println("Living Room Sensor");
    display.println("\nInitializing...");
    display.display();
  }

  // Initialize DHT sensor
  dht.begin();
  Serial.println("DHT22 sensor initialized");

  // Connect to WiFi
  connectWiFi();

  // Configure MQTT
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setCallback(mqttCallback);

  // Scan WiFi networks
  scanWiFiNetworks();

  Serial.println("\nSetup complete!\n");
}

// ==================== MAIN LOOP ====================

void loop() {
  // Ensure WiFi is connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Ensure MQTT is connected
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();

  // Publish sensor data at interval
  unsigned long currentTime = millis();
  if (currentTime - lastPublishTime >= PUBLISH_INTERVAL) {
    lastPublishTime = currentTime;
    readAndPublishSensorData();
  }

  // Periodic WiFi scan
  if (currentTime - lastWifiScanTime >= WIFI_SCAN_INTERVAL) {
    lastWifiScanTime = currentTime;
    wifiSignal = WiFi.RSSI();
  }

  // Update display
  updateDisplay();

  delay(100);
}

// ==================== WIFI FUNCTIONS ====================

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connecting to WiFi...");
  display.println(ssid);
  display.display();

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    wifiSignal = WiFi.RSSI();
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

void scanWiFiNetworks() {
  Serial.println("\nScanning WiFi networks...");

  int networks = WiFi.scanNetworks();

  if (networks == 0) {
    Serial.println("No networks found");
  } else {
    Serial.printf("Found %d networks:\n", networks);
    for (int i = 0; i < networks; i++) {
      Serial.printf("  %d: %s (RSSI: %d dBm) %s\n",
        i + 1,
        WiFi.SSID(i).c_str(),
        WiFi.RSSI(i),
        WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "Open" : "Encrypted"
      );
    }
  }
  Serial.println();
}

// ==================== MQTT FUNCTIONS ====================

void connectMQTT() {
  Serial.print("Connecting to MQTT broker: ");
  Serial.println(mqtt_server);

  if (mqtt.connect(mqtt_client_id)) {
    Serial.println("MQTT connected!");
    mqttConnected = true;

    // Subscribe to commands (optional)
    // mqtt.subscribe("home/living_room/command");
  } else {
    Serial.print("MQTT connection failed, rc=");
    Serial.println(mqtt.state());
    mqttConnected = false;
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("MQTT message received on topic: ");
  Serial.println(topic);

  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("Message: ");
  Serial.println(message);
}

// ==================== SENSOR FUNCTIONS ====================

void readAndPublishSensorData() {
  // Read sensor
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();

  // Check for read errors
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  Serial.printf("Temperature: %.1f°C, Humidity: %.1f%%\n", temperature, humidity);

  // Publish to MQTT if connected
  if (mqtt.connected()) {
    // Publish JSON format
    char jsonPayload[100];
    snprintf(jsonPayload, sizeof(jsonPayload),
      "{\"temperature\":%.1f,\"humidity\":%.1f,\"device\":\"living_room\"}",
      temperature, humidity);
    mqtt.publish(topic_sensor, jsonPayload);

    // Publish individual values
    char tempStr[10], humStr[10];
    dtostrf(temperature, 4, 1, tempStr);
    dtostrf(humidity, 4, 1, humStr);
    mqtt.publish(topic_temperature, tempStr);
    mqtt.publish(topic_humidity, humStr);

    Serial.println("Data published to MQTT");
  }
}

// ==================== DISPLAY FUNCTIONS ====================

void updateDisplay() {
  display.clearDisplay();

  // Header
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("Casa DaVinci");

  // WiFi signal indicator
  display.setCursor(90, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.printf("%ddBm", wifiSignal);
  } else {
    display.print("No WiFi");
  }

  // Divider line
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  // Temperature (large)
  display.setTextSize(2);
  display.setCursor(0, 16);
  if (!isnan(temperature)) {
    display.printf("%.1f", temperature);
    display.setTextSize(1);
    display.print(" C");
  } else {
    display.print("--.-");
  }

  // Humidity (large)
  display.setTextSize(2);
  display.setCursor(0, 38);
  if (!isnan(humidity)) {
    display.printf("%.1f", humidity);
    display.setTextSize(1);
    display.print(" %");
  } else {
    display.print("--.-");
  }

  // Status bar
  display.setTextSize(1);
  display.setCursor(0, 56);
  display.print("MQTT:");
  display.print(mqttConnected ? "OK" : "--");

  display.setCursor(70, 56);
  display.print("Living Room");

  display.display();
}
