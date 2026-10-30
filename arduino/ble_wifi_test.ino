// Dépendance : ArduinoJson (v7) via le gestionnaire de bibliothèques.
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLECharacteristic.h>

#define SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define CHARACTERISTIC_UUID "abcdef12-3456-7890-abcd-ef1234567890"
#define CLAIM_URL           "http://62.171.182.243:4000/api/v1/radios/claim"

BLECharacteristic* pCharacteristic = NULL;
String deviceId;         // MAC sans ":" en majuscules, ex. 448CC41DB410
String rxBuffer;         // morceaux BLE accumulés jusqu'au '\n'
String pendingMessage;   // message complet à traiter dans loop()

void notify(const String& msg) {
  pCharacteristic->setValue(msg.c_str());
  pCharacteristic->notify();
  Serial.println("BLE notifié : " + msg);
}

bool connectWifi(const String& ssid, const String& password) {
  WiFi.begin(ssid.c_str(), password.c_str());
  Serial.print("Connexion à " + ssid);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

// POST /radios/claim avec le pairingToken en Bearer.
int claimRadio(const String& pairingToken) {
  HTTPClient http;
  http.begin(CLAIM_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + pairingToken);
  int code = http.POST("{\"deviceId\":\"" + deviceId + "\"}");
  Serial.println("Claim HTTP " + String(code) + " : " + http.getString());
  http.end();
  return code;
}

void handleMessage(const String& message) {
  JsonDocument doc;
  if (deserializeJson(doc, message)) {
    Serial.println("JSON invalide (attendu: {ssid, password, pairingToken})");
    notify("FAIL:JSON");
    return;
  }
  String ssid = doc["ssid"] | "";
  String password = doc["password"] | "";
  String pairingToken = doc["pairingToken"] | "";

  if (!connectWifi(ssid, password)) {
    Serial.println("Échec connexion WiFi");
    notify("FAIL");
    return;
  }
  Serial.println("Connecté ! IP: " + WiFi.localIP().toString());
  notify("OK:" + WiFi.localIP().toString());

  if (pairingToken.length() == 0) {
    notify("CLAIM_FAIL:NOTOKEN");
    return;
  }
  int code = claimRadio(pairingToken);
  notify(code >= 200 && code < 300 ? "CLAIM_OK" : "CLAIM_FAIL:" + String(code));
}

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    uint8_t* data = pChar->getData();
    for (int i = 0; i < pChar->getLength(); i++) {
      char c = (char)data[i];
      if (c == '\n') {
        pendingMessage = rxBuffer;
        rxBuffer = "";
      } else {
        rxBuffer += c;
      }
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Démarrage BLE test...");

  WiFi.mode(WIFI_STA);
  deviceId = WiFi.macAddress();
  deviceId.replace(":", "");
  deviceId.toUpperCase();
  String bleName = "RadioTuuti-" + deviceId;
  Serial.println("Nom BLE : " + bleName);

  BLEDevice::init(bleName.c_str());
  BLEServer* pServer = BLEDevice::createServer();
  BLEService* pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->start();

  Serial.println("BLE prêt.");
}

// Traitement hors du callback BLE (connexion Wi-Fi et HTTP sont bloquants).
void loop() {
  if (pendingMessage.length() > 0) {
    String message = pendingMessage;
    pendingMessage = "";
    Serial.println("Reçu : " + String(message.length()) + " octets");
    handleMessage(message);
  }
  delay(10);
}
