import { BleNitro, BLEState, type BLEDevice } from 'react-native-ble-nitro';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const ble = BleNitro.instance();

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (parseInt(Platform.Version.toString(), 10) >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted'
    );
  } else {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === 'granted';
  }
}

export default function ScanScreen() {
  const [bleState, setBleState] = useState<BLEState>(() => ble.state());
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestBlePermissions().catch(() => {});
    const sub = ble.subscribeToStateChange((state) => setBleState(state), true);
    return () => {
      sub.remove();
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (ble.isScanning()) ble.stopScan();
    };
  }, []);

  const startScan = async () => {
    setError(null);

    const granted = await requestBlePermissions();
    if (!granted) {
      setError('Permissions Bluetooth refusées. Autorise-les dans les paramètres.');
      return;
    }

    setDevices([]);
    setScanning(true);

    ble.startScan(
      undefined,
      (device) => {
        setDevices((prev) => {
          if (prev.find((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      },
      (err) => {
        setError(err);
        setScanning(false);
      },
    );

    stopTimer.current = setTimeout(() => {
      ble.stopScan();
      setScanning(false);
    }, 5000);
  };

  const isReady = bleState === BLEState.PoweredOn;
  const canScan = isReady || bleState === BLEState.Unauthorized;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>BLE Scan</Text>
          <View style={[styles.statusDot, isReady ? styles.dotOn : styles.dotOff]} />
        </View>

        <Text style={styles.subtitle}>
          {isReady ? 'Bluetooth actif' : `Bluetooth : ${bleState}`}
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.scanButton,
            !canScan && styles.scanButtonDisabled,
            scanning && styles.scanButtonScanning,
            pressed && styles.scanButtonPressed,
          ]}
          onPress={startScan}
          disabled={scanning || !canScan}>
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.scanButtonText}>
              {isReady ? 'Lancer le scan' : bleState === BLEState.Unauthorized ? 'Autoriser le Bluetooth' : 'Bluetooth indisponible'}
            </Text>
          )}
        </Pressable>

        {scanning && <Text style={styles.scanningLabel}>Recherche en cours...</Text>}

        {devices.length > 0 && (
          <Text style={styles.count}>{devices.length} appareil(s) trouvé(s)</Text>
        )}

        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.device}>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{item.name || '(sans nom)'}</Text>
                <Text style={styles.deviceId}>{item.id}</Text>
              </View>
              <Text style={styles.rssi}>{item.rssi} dBm</Text>
            </View>
          )}
          ListEmptyComponent={
            !scanning ? (
              <Text style={styles.emptyText}>Lance un scan pour découvrir des appareils.</Text>
            ) : null
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fa' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 32, fontWeight: '700', color: '#111' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#34C759' },
  dotOff: { backgroundColor: '#FF3B30' },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  errorBox: {
    backgroundColor: '#fff0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#FF3B30',
  },
  errorText: { color: '#c0392b', fontSize: 13 },
  scanButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanButtonDisabled: { backgroundColor: '#c7c7cc', shadowOpacity: 0, elevation: 0 },
  scanButtonScanning: { backgroundColor: '#5856d6' },
  scanButtonPressed: { opacity: 0.85 },
  scanButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  scanningLabel: { textAlign: 'center', color: '#5856d6', fontSize: 13, marginBottom: 12 },
  count: { fontSize: 13, color: '#888', marginBottom: 8 },
  list: { paddingBottom: 20 },
  device: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontWeight: '600', fontSize: 15, color: '#111' },
  deviceId: { fontSize: 11, color: '#999', marginTop: 2, fontFamily: 'monospace' },
  rssi: { fontSize: 12, color: '#888', marginLeft: 8 },
  emptyText: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
});
