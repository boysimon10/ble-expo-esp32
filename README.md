# BLE Expo / ESP-32 + react-native-ble-nitro

An experimental React Native (Expo) app exploring Bluetooth Low Energy communication with an ESP-32 using `react-native-ble-nitro`.

## Launch

```bash
npm install
npx expo run:android   # builds and installs on connected Android device
```

> You need a physical device, BLE doesn't work in emulators.

If the APK is already installed and you just want to update the JS:

```bash
npx expo start --dev-client
```

## Why react-native-ble-nitro?

After a lot of struggle trying to get `react-native-ble-plx` to work (setup issues, random crashes, hard to debug errors) I decided to try something else.

`react-native-ble-nitro` is a newer BLE library built on top of `react-native-nitro-modules`. It communicates with native code more directly, which makes it faster and easier to set up. So far the experience has been much smoother.

## Setup

The library exposes a singleton, one shared BLE manager for the whole app:

```ts
import { BleNitro } from 'react-native-ble-nitro';

const ble = BleNitro.instance();
```

Create this outside your component so it's not recreated on every render.

## Permissions

Permissions are configured via `app.json` using the `react-native-ble-nitro` Expo plugin. On iOS it sets the Bluetooth usage description, on Android it handles the manifest permissions automatically.

```json
["react-native-ble-nitro", {
  "isBackgroundEnabled": false,
  "neverForLocation": false,
  "bluetoothAlwaysPermission": "Allow the app to use Bluetooth."
}]
```

After any change, run `npx expo prebuild` to regenerate native files.

## What this experiment covers

- Scanning for nearby BLE devices and displaying them in a list (name, ID, RSSI)
- Requesting runtime Bluetooth permissions on Android
- Monitoring Bluetooth state changes in real time
- Foundation for connecting to an ESP-32 and reading/writing characteristics
