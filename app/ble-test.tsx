import { BleNitro, type BLEDevice, type AsyncSubscription } from 'react-native-ble-nitro';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const ESP32_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const ESP32_CHARACTERISTIC_UUID = 'abcdef12-3456-7890-abcd-ef1234567890';

const ble = BleNitro.instance();

const stringToBytes = (str: string): number[] => str.split('').map((c) => c.charCodeAt(0));
const bytesToString = (bytes: number[]): string => String.fromCharCode(...bytes);

type BleEntry = { time: string; raw: string };

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (parseInt(Platform.Version.toString(), 10) >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(results).every((r) => r === 'granted');
  }
  return (
    (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) === 'granted'
  );
}

export default function BleTestScreen() {
  const router = useRouter();
  const { deviceId, deviceName } = useLocalSearchParams<{ deviceId?: string; deviceName?: string }>();

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [bleEntries, setBleEntries] = useState<BleEntry[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const notifSub = useRef<AsyncSubscription | null>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const addBleEntry = useCallback((raw: string) => {
    const time = new Date().toLocaleTimeString();
    setBleEntries((prev) => [{ time, raw }, ...prev].slice(0, 200));
  }, []);

  const connectToDevice = useCallback(async (device: BLEDevice) => {
    setConnecting(true);
    try {
      addLog(`Connexion à ${device.name || device.id}...`);

      await ble.connect(device.id, () => {
        addLog(`Déconnecté de ${device.name || device.id}`);
        setConnectedDevice(null);
        notifSub.current = null;
      });

      setConnectedDevice(device);
      addLog('Connecté — découverte des services...');
      await ble.discoverServices(device.id);
      addLog('Services découverts');

      try {
        notifSub.current = await ble.subscribeToCharacteristic(
          device.id,
          ESP32_SERVICE_UUID,
          ESP32_CHARACTERISTIC_UUID,
          (_, bytes) => {
            const data = bytesToString(bytes);
            addBleEntry(data);
            addLog(`Reçu : ${data}`);
          },
        );
        addLog('Abonné aux notifications');
      } catch (subErr) {
        addLog(`Abonnement ignoré : ${subErr}`);
      }
    } catch (e) {
      addLog(`Erreur de connexion : ${e}`);
    } finally {
      setConnecting(false);
    }
  }, [addLog, addBleEntry]);

  useEffect(() => {
    requestBlePermissions();
    return () => {
      notifSub.current?.remove().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (deviceId) {
      connectToDevice({ id: deviceId, name: deviceName ?? '' } as BLEDevice);
    }
  }, [deviceId, deviceName, connectToDevice]);

  const sendWifiCredentials = async () => {
    if (!connectedDevice) return;
    try {
      const credentials = `${ssid},${password}`;
      await ble.writeCharacteristic(
        connectedDevice.id,
        ESP32_SERVICE_UUID,
        ESP32_CHARACTERISTIC_UUID,
        stringToBytes(credentials),
        true,
      );
      addLog(`Envoyé : ${ssid},***`);
    } catch (e) {
      addLog(`Erreur d'envoi : ${e}`);
    }
  };

  const isConnected = !!connectedDevice;
  const canSend = isConnected && ssid.trim().length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Retour</Text>
          </Pressable>
          <Text style={styles.deviceTitle} numberOfLines={1}>
            {deviceName || deviceId || 'Appareil'}
          </Text>
          <View style={[styles.statusDot, isConnected ? styles.dotOn : styles.dotOff]} />
        </View>

        {/* Statut connexion */}
        <View style={styles.statusCard}>
          {connecting ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.statusText}>Connexion en cours...</Text>
            </View>
          ) : (
            <Text style={[styles.statusText, isConnected ? styles.statusOn : styles.statusOff]}>
              {isConnected ? 'Connecté' : 'Déconnecté'}
            </Text>
          )}
          {isConnected && (
            <Text style={styles.deviceIdText}>{connectedDevice.id}</Text>
          )}
        </View>

        {/* Formulaire WiFi */}
        <View style={[styles.card, !isConnected && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Credentials Wi-Fi</Text>
          <TextInput
            style={[styles.input, !isConnected && styles.inputDisabled]}
            placeholder="SSID"
            placeholderTextColor="#aaa"
            value={ssid}
            onChangeText={setSsid}
            editable={isConnected}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, !isConnected && styles.inputDisabled]}
            placeholder="Mot de passe"
            placeholderTextColor="#aaa"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={isConnected}
          />
          <Pressable
            style={({ pressed }) => [styles.sendButton, !canSend && styles.sendButtonDisabled, pressed && styles.sendButtonPressed]}
            onPress={sendWifiCredentials}
            disabled={!canSend}>
            <Text style={styles.sendButtonText}>Envoyer</Text>
          </Pressable>
        </View>

        {/* Réponses BLE ESP32 */}
        <View style={styles.bleBox}>
          <View style={styles.bleHeader}>
            <View style={styles.bleHeaderLeft}>
              <View style={[styles.bleDot, isConnected ? styles.dotOn : styles.dotOff]} />
              <Text style={styles.bleTitle}>Réponses ESP32</Text>
            </View>
            {bleEntries.length > 0 && (
              <Pressable onPress={() => setBleEntries([])}>
                <Text style={styles.bleClear}>Effacer</Text>
              </Pressable>
            )}
          </View>

          {bleEntries.length === 0 ? (
            <Text style={styles.bleEmpty}>
              {isConnected ? 'En attente de données...' : 'Connectez un appareil pour voir les données'}
            </Text>
          ) : (
            bleEntries.map((entry, i) => (
              <View key={i} style={[styles.bleEntry, i === 0 && styles.bleEntryFirst]}>
                <Text style={styles.bleTime}>{entry.time}</Text>
                <Text style={styles.bleRaw}>{entry.raw}</Text>
              </View>
            ))
          )}
        </View>

        {/* Logs système */}
        {logs.length > 0 && (
          <View style={styles.logBox}>
            <View style={styles.logHeader}>
              <Text style={styles.logTitle}>LOG SYSTÈME</Text>
              <Pressable onPress={() => setLogs([])}>
                <Text style={styles.logClear}>Effacer</Text>
              </Pressable>
            </View>
            {logs.map((entry, i) => (
              <Text key={i} style={styles.logEntry}>{entry}</Text>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fa' },
  container: { padding: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  backButton: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#007AFF', fontSize: 15 },
  deviceTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#34C759' },
  dotOff: { backgroundColor: '#FF3B30' },

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 15, fontWeight: '600' },
  statusOn: { color: '#34C759' },
  statusOff: { color: '#FF3B30' },
  deviceIdText: { fontSize: 11, color: '#999', marginTop: 4, fontFamily: 'monospace' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: 12, letterSpacing: 0.5 },

  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  inputDisabled: { backgroundColor: '#f0f0f0' },

  sendButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  sendButtonDisabled: { backgroundColor: '#c7c7cc' },
  sendButtonPressed: { opacity: 0.8 },
  sendButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  bleBox: {
    backgroundColor: '#0d1117',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    minHeight: 120,
  },
  bleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bleHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bleDot: { width: 8, height: 8, borderRadius: 4 },
  bleTitle: { color: '#58a6ff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  bleClear: { color: '#FF453A', fontSize: 12 },
  bleEmpty: { color: '#555', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 16 },
  bleEntry: {
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    paddingTop: 8,
    marginTop: 8,
  },
  bleEntryFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  bleTime: { color: '#6e7681', fontSize: 10, fontFamily: 'monospace', marginBottom: 2 },
  bleRaw: { color: '#3fb950', fontSize: 13, fontFamily: 'monospace' },

  logBox: { backgroundColor: '#1c1c1e', borderRadius: 12, padding: 14 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  logTitle: { color: '#888', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  logClear: { color: '#FF453A', fontSize: 12 },
  logEntry: { color: '#00ff88', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 },
});
