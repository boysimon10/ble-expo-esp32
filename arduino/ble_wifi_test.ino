#include <WiFi.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLECharacteristic.h>

#define SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define CHARACTERISTIC_UUID "abcdef12-3456-7890-abcd-ef1234567890"

BLECharacteristic* pCharacteristic = NULL;

void connectAndNotify(String ssid, String password) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  Serial.print("Connexion à " + ssid);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  String msg;
  if (WiFi.status() == WL_CONNECTED) {
    msg = "OK:" + WiFi.localIP().toString();
    Serial.println("\nConnecté ! IP: " + WiFi.localIP().toString());
  } else {
    msg = "FAIL";
    Serial.println("\nÉchec connexion WiFi");
  }

  pCharacteristic->setValue(msg.c_str());
  pCharacteristic->notify();
  Serial.println("BLE notifié : " + msg);
}

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) override {
    String value = "";
    uint8_t* data = pChar->getData();
    for (int i = 0; i < pChar->getLength(); i++) value += (char)data[i];

    Serial.println("Reçu : " + value);

    int sep = value.indexOf(',');
    if (sep != -1) {
      String ssid = value.substring(0, sep);
      String pass = value.substring(sep + 1);
      connectAndNotify(ssid, pass);
    } else {
      Serial.println("Format incorrect (attendu: SSID,password)");
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Démarrage BLE test...");

  BLEDevice::init("ESP32_Test");
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

void loop() {}
