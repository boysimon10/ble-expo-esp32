import { BleNitro, type BLEDevice } from 'react-native-ble-nitro';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

const ble = BleNitro.instance();

export default function BleTestScreen() {
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startScan = () => {
    setError(null);
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

    setTimeout(() => {
      ble.stopScan();
      setScanning(false);
    }, 5000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>BLE Nitro Test</Text>
      <Text style={styles.status}>State: {ble.state()}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, scanning && styles.buttonDisabled]}
        onPress={startScan}
        disabled={scanning}>
        <Text style={styles.buttonText}>{scanning ? 'Scanning (5s)...' : 'Start Scan'}</Text>
      </Pressable>

      <Text style={styles.count}>{devices.length} device(s) found</Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.device}>
            <Text style={styles.deviceName}>{item.name || '(no name)'}</Text>
            <Text style={styles.deviceId}>{item.id}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  status: { fontSize: 14, color: '#555', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12 },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { backgroundColor: '#aaa' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  count: { fontSize: 13, color: '#888', marginBottom: 8 },
  device: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  deviceName: { fontWeight: '600' },
  deviceId: { fontSize: 11, color: '#999', marginTop: 2 },
});
