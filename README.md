# ble-expo — ESP32 WiFi Provisioning

Application mobile React Native (Expo) pour configurer un ESP32 via Bluetooth Low Energy (WiFi provisioning).

## Fonctionnement

1. L'app scanne les appareils BLE et filtre uniquement les ESP32 (par UUID de service)
2. L'utilisateur sélectionne un appareil et est redirigé vers l'écran de provisioning
3. Il saisit le SSID et le mot de passe WiFi, puis les envoie via BLE
4. L'ESP32 tente la connexion et renvoie `OK:<IP>` ou `FAIL` via BLE notify
5. La réponse s'affiche en live dans le panneau "Réponses ESP32"

## Stack

- React Native 0.81 + Expo 54
- expo-router (navigation)
- react-native-ble-nitro (BLE)

## Lancer l'app

```bash
npm install
npx expo run:android   # build + installe sur un appareil Android connecté en USB
```

> BLE ne fonctionne pas sur émulateur, il faut un appareil physique.

Si l'APK est déjà installé et que tu veux juste mettre à jour le JS :

```bash
npx expo start --dev-client
```

## UUIDs BLE

| Rôle            | UUID                                   |
|-----------------|----------------------------------------|
| Service         | `12345678-1234-5678-1234-56789abcdef0` |
| Caractéristique | `abcdef12-3456-7890-abcd-ef1234567890` |

## Format des messages BLE

| Direction   | Format              | Exemple                 |
|-------------|---------------------|-------------------------|
| App → ESP32 | `SSID,password`     | `MonWifi,motdepasse123` |
| ESP32 → App | `OK:<IP>` ou `FAIL` | `OK:192.168.1.42`       |

## Firmware Arduino

Les fichiers `.ino` se trouvent dans le dossier `arduino/`.

| Fichier                       | Description                                       |
|-------------------------------|---------------------------------------------------|
| `arduino/ble_wifi_test.ino`   | Sketch de test minimal BLE + WiFi (sans SD/audio) |

## Permissions Android

Gérées via le plugin `react-native-ble-nitro` dans `app.json` :

```json
["react-native-ble-nitro", {
  "isBackgroundEnabled": false,
  "neverForLocation": false,
  "bluetoothAlwaysPermission": "Allow the app to use Bluetooth."
}]
```

Après toute modification, relancer `npx expo prebuild` pour regénérer les fichiers natifs.

## Setup BLE (singleton)

```ts
import { BleNitro } from 'react-native-ble-nitro';

const ble = BleNitro.instance(); // à créer en dehors du composant
```
