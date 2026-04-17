#include <Arduino.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

#include "WS_GPIO.h"

// --- Provisioning AP defaults ---
static constexpr const char *kApPass = "svkrishna";
static constexpr uint16_t kHttpPort = 80;
static constexpr uint32_t kStaConnectTimeoutMs = 15'000;

// SoftAP network (explicit so we can report it reliably)
static const IPAddress kApIp(192, 168, 4, 1);
static const IPAddress kApGw(192, 168, 4, 1);
static const IPAddress kApMask(255, 255, 255, 0);

static Preferences prefs;
static WebServer server(kHttpPort);

static bool relayFlags[6] = {false, false, false, false, false, false};

static String apSsid;
static String staSsid;
static String staPass;
static String mdnsHost;
static bool mdnsStarted = false;

static String htmlEscape(const String &input) {
  String out;
  out.reserve(input.length());
  for (size_t i = 0; i < input.length(); i++) {
    const char c = input[i];
    if (c == '&') out += "&amp;";
    else if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '"') out += "&quot;";
    else if (c == '\'') out += "&#39;";
    else out += c;
  }
  return out;
}

static String macSuffix() {
  const uint64_t efuseMac = ESP.getEfuseMac();
  const uint32_t raw = static_cast<uint32_t>((efuseMac >> 24) & 0xFFFFFF);
  const uint32_t suffix = ((raw & 0xFF) << 16) | (raw & 0xFF00) | ((raw >> 16) & 0xFF);
  char buf[7];
  snprintf(buf, sizeof(buf), "%06X", suffix);
  return String(buf);
}

static void applyRelayPinsFromFlags() {
  digitalWrite(GPIO_PIN_CH1, relayFlags[0] ? HIGH : LOW);
  digitalWrite(GPIO_PIN_CH2, relayFlags[1] ? HIGH : LOW);
  digitalWrite(GPIO_PIN_CH3, relayFlags[2] ? HIGH : LOW);
  digitalWrite(GPIO_PIN_CH4, relayFlags[3] ? HIGH : LOW);
  digitalWrite(GPIO_PIN_CH5, relayFlags[4] ? HIGH : LOW);
  digitalWrite(GPIO_PIN_CH6, relayFlags[5] ? HIGH : LOW);
}

static void toggleRelayChannel(uint8_t channel1to6) {
  if (channel1to6 < 1 || channel1to6 > 6) return;
  const uint8_t idx = channel1to6 - 1;
  relayFlags[idx] = !relayFlags[idx];
  applyRelayPinsFromFlags();
  Buzzer_PWM(80);
}

static void setAllRelays(bool on) {
  for (auto &flag : relayFlags) flag = on;
  applyRelayPinsFromFlags();
  Buzzer_PWM(on ? 200 : 120);
}

static void handleGetData() {
  String json = "[";
  for (int i = 0; i < 6; i++) {
    json += relayFlags[i] ? "1" : "0";
    if (i < 5) json += ",";
  }
  json += "]";
  server.send(200, "application/json", json);
}

static void handleSwitch(uint8_t channel1to6) {
  toggleRelayChannel(channel1to6);
  server.send(200, "text/plain", "OK");
}

static void handleAllOn() {
  setAllRelays(true);
  server.send(200, "text/plain", "OK");
}

static void handleAllOff() {
  setAllRelays(false);
  server.send(200, "text/plain", "OK");
}

static String staStatusLine() {
  if (WiFi.status() == WL_CONNECTED) {
    return "Connected (" + WiFi.localIP().toString() + ")";
  }
  return "Not connected";
}

static void handleWifiPage() {
  const bool hasCreds = staSsid.length() > 0;
  String page;
  page.reserve(1800);

  page += "<!doctype html><html><head><meta charset='utf-8'/>";
  page += "<meta name='viewport' content='width=device-width, initial-scale=1'/>";
  page += "<title>SVK Relay Wi-Fi</title>";
  page += "<style>body{font-family:Arial,sans-serif;margin:20px}input{width:100%;padding:10px;margin:6px 0}button{padding:10px 14px}code{background:#f2f2f2;padding:2px 4px}</style>";
  page += "</head><body>";
  page += "<h2>Wi-Fi provisioning</h2>";
  page += "<p><b>AP SSID:</b> <code>" + htmlEscape(apSsid) + "</code></p>";
  page += "<p><b>AP IP:</b> <code>" + kApIp.toString() + "</code></p>";
  page += "<p><b>STA status:</b> " + htmlEscape(staStatusLine()) + "</p>";
  page += "<hr/>";
  page += "<form method='POST' action='/wifi/save'>";
  page += "<label>Boat/router SSID</label>";
  page += "<input name='ssid' maxlength='64' value='" + htmlEscape(staSsid) + "' placeholder='e.g. SV-Krishna-WiFi'/>";
  page += "<label>Boat/router password</label>";
  page += "<input name='pass' type='password' maxlength='64' value='" + htmlEscape(staPass) + "' placeholder='(leave blank for open network)'/>";
  page += "<button type='submit'>Save & Reconnect</button>";
  page += "</form>";
  page += "<p style='margin-top:14px'>Relay control UI: <a href='/'>/</a></p>";
  if (hasCreds) {
    page += "<p>Saved SSID: <code>" + htmlEscape(staSsid) + "</code></p>";
  }
  page += "</body></html>";

  server.send(200, "text/html", page);
}

static void tryConnectSta(bool verbose) {
  if (staSsid.length() == 0) return;

  WiFi.begin(staSsid.c_str(), staPass.c_str());
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < kStaConnectTimeoutMs) {
    delay(250);
  }

  if (!verbose) return;

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("STA connected. IP: ");
    Serial.println(WiFi.localIP());
    RGB_Light(0, 60, 0);
    delay(300);
    RGB_Light(0, 0, 0);
  } else {
    Serial.println("STA connect failed (keeping AP up for provisioning).");
    RGB_Light(60, 0, 0);
    delay(300);
    RGB_Light(0, 0, 0);
  }
}

static void ensureMdnsStarted() {
  if (mdnsStarted) {
    return;
  }

  if (!MDNS.begin(mdnsHost.c_str())) {
    Serial.println("mDNS start failed.");
    return;
  }

  MDNS.addService("http", "tcp", kHttpPort);
  mdnsStarted = true;
  Serial.print("mDNS host: http://");
  Serial.print(mdnsHost);
  Serial.println(".local/");
}

static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t) {
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    ensureMdnsStarted();
  }

  if (event == ARDUINO_EVENT_WIFI_AP_START) {
    // mDNS may still be useful on AP-only setups depending on the client OS.
    ensureMdnsStarted();
  }
}

static void handleWifiSave() {
  const String newSsid = server.arg("ssid");
  const String newPass = server.arg("pass");

  staSsid = newSsid;
  staPass = newPass;

  prefs.putString("sta_ssid", staSsid);
  prefs.putString("sta_pass", staPass);

  server.send(200, "text/html",
              "<html><body><p>Saved. Attempting to connect...</p><p><a href='/wifi'>Back</a></p></body></html>");

  delay(200);
  tryConnectSta(true);
}

static void handleRoot() {
  // A trimmed version of Waveshare's relay page, plus a link to /wifi.
  String page;
  page.reserve(2600);

  page += "<!doctype html><html><head><meta charset='utf-8'/>";
  page += "<meta name='viewport' content='width=device-width, initial-scale=1'/>";
  page += "<title>ESP32-S3 Relay 6CH</title>";
  page += "<style>body{font-family:Arial,sans-serif;background:#f0f0f0;margin:0} .header{padding:16px;background:#333;color:#fff;text-align:center} .container{max-width:720px;margin:16px auto;background:#fff;border-radius:8px;padding:16px;box-shadow:0 0 8px rgba(0,0,0,.2)} .row{display:flex;align-items:center;gap:10px;margin:10px 0} .row label{width:52px} input{flex:1;padding:8px} button{padding:10px 12px;background:#333;color:#fff;border:0;border-radius:6px;cursor:pointer} button:hover{background:#555} .actions{display:flex;gap:10px;justify-content:center;margin-top:14px} .toplinks{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px} code{background:#f2f2f2;padding:2px 4px;border-radius:4px}</style>";
  page += "<script>";
  page += "function req(path){var x=new XMLHttpRequest();x.open('GET',path,true);x.send();}";
  page += "function ledSwitch(n){if(n>=1&&n<=6)req('/Switch'+n); else if(n==7)req('/AllOn'); else if(n==8)req('/AllOff');}";
  page += "function updateData(){var x=new XMLHttpRequest();x.open('GET','/getData',true);x.onreadystatechange=function(){if(x.readyState===4&&x.status===200){var d=JSON.parse(x.responseText);for(var i=0;i<6;i++){document.getElementById('ch'+(i+1)).value=d[i];}}};x.send();}";
  page += "setInterval(updateData,250);";
  page += "</script></head><body>";

  page += "<div class='header'><h1>ESP32-S3-Relay-6CH</h1></div>";
  page += "<div class='container'>";
  page += "<div class='toplinks'><div>AP: <code>" + htmlEscape(apSsid) + "</code> @ <code>" + kApIp.toString() + "</code></div><div><a href='/wifi'>Wi‑Fi setup</a></div></div>";

  for (int i = 1; i <= 6; i++) {
    page += "<div class='row'><label>CH" + String(i) + "</label><input id='ch" + String(i) + "' readonly/><button onclick='ledSwitch(" + String(i) + ")'>Toggle</button></div>";
  }

  page += "<div class='actions'><button onclick='ledSwitch(7)'>All On</button><button onclick='ledSwitch(8)'>All Off</button></div>";
  page += "<p style='margin-top:14px'>STA: " + htmlEscape(staStatusLine()) + "</p>";
  page += "</div></body></html>";

  server.send(200, "text/html", page);
}

static void setupServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/wifi", HTTP_GET, handleWifiPage);
  server.on("/wifi/save", HTTP_POST, handleWifiSave);

  server.on("/getData", HTTP_GET, handleGetData);
  server.on("/Switch1", HTTP_GET, [] { handleSwitch(1); });
  server.on("/Switch2", HTTP_GET, [] { handleSwitch(2); });
  server.on("/Switch3", HTTP_GET, [] { handleSwitch(3); });
  server.on("/Switch4", HTTP_GET, [] { handleSwitch(4); });
  server.on("/Switch5", HTTP_GET, [] { handleSwitch(5); });
  server.on("/Switch6", HTTP_GET, [] { handleSwitch(6); });
  server.on("/AllOn", HTTP_GET, handleAllOn);
  server.on("/AllOff", HTTP_GET, handleAllOff);

  server.onNotFound([] { server.send(404, "text/plain", "Not found"); });
  server.begin();
}

void setup() {
  Serial.begin(115200);
  delay(200);

  GPIO_Init();
  setAllRelays(false); // safe default at boot
  RGB_Light(0, 0, 0);

  prefs.begin("svk-relay", false);
  staSsid = prefs.getString("sta_ssid", "");
  staPass = prefs.getString("sta_pass", "");

  apSsid = "SVK-Relay-6CH-" + macSuffix();
  mdnsHost = String("svk-relay-6ch-") + macSuffix();
  mdnsHost.toLowerCase();

  WiFi.mode(WIFI_AP_STA);
  WiFi.onEvent(onWiFiEvent);
  WiFi.softAPConfig(kApIp, kApGw, kApMask);
  WiFi.softAP(apSsid.c_str(), kApPass);

  Serial.println();
  Serial.println("SVK Relay provisioning firmware");
  Serial.print("AP SSID: ");
  Serial.println(apSsid);
  Serial.print("AP password: ");
  Serial.println(kApPass);
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.print("mDNS name: ");
  Serial.print(mdnsHost);
  Serial.println(".local");

  if (staSsid.length() > 0) {
    Serial.print("Saved STA SSID: ");
    Serial.println(staSsid);
    tryConnectSta(true);
  } else {
    Serial.println("No saved STA credentials yet. Connect to the AP and open http://192.168.4.1/wifi");
  }

  ensureMdnsStarted();
  setupServer();
  Serial.print("HTTP server started on port ");
  Serial.println(kHttpPort);
}

void loop() { server.handleClient(); }
