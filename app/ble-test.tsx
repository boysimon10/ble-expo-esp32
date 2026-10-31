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
import { fetchPairingToken, renameRadio } from '@/constants/gestu';
import { useRadioSocket, type RadioPairedEvent } from '@/hooks/use-radio-socket';

const ESP32_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const ESP32_CHARACTERISTIC_UUID = 'abcdef12-3456-7890-abcd-ef1234567890';
// Taille sûre avec le MTU par défaut (23 - 3 octets d'en-tête ATT).
const BLE_CHUNK_SIZE = 20;

const ble = BleNitro.instance();

const stringToBytes = (str: string): number[] => Array.from(new TextEncoder().encode(str));
const bytesToString = (bytes: number[]): string => String.fromCharCode(...bytes);

// deviceId radio = 12 hexa majuscules : depuis le nom `RadioTuuti-XXXXXXXXXXXX`,
// sinon depuis l'adresse MAC (id BLE sur Android ; sur iOS l'id est un UUID).
function radioIdFrom(name?: string, bleId?: string): string {
  const fromName = name?.match(/^RadioTuuti-([0-9A-Fa-f]{12})$/)?.[1];
  if (fromName) return fromName.toUpperCase();
  if (bleId && /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(bleId)) return bleId.replace(/:/g, '').toUpperCase();
  return '';
}

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
  const [radioId, setRadioId] = useState(() => radioIdFrom(deviceName, deviceId));
  const [sending, setSending] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [bleEntries, setBleEntries] = useState<BleEntry[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const [pairedRadio, setPairedRadio] = useState<RadioPairedEvent | null>(null);
  const [radioName, setRadioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const notifSub = useRef<AsyncSubscription | null>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const [wsNotice, setWsNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showWsNotice = (msg: string) => {
    setWsNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setWsNotice(null), 5000);
  };

  const ws = useRadioSocket((event) => {
    if (event.deviceId !== radioId) {
      showWsNotice(`radio:paired reçu pour une autre radio (${event.deviceId})`);
      return;
    }
    showWsNotice(`📻 Radio appairée : ${event.name}`);
    setPairedRadio(event);
    setRadioName(event.name);
    setNameSaved(false);
  });

  const saveRadioName = async () => {
    if (!pairedRadio) return;
    setSaving(true);
    try {
      await renameRadio(pairedRadio.radioId, radioName);
      setNameSaved(true);
      addLog(`Radio renommée : ${radioName.trim()}`);
    } catch (e) {
      addLog(`Erreur de renommage : ${e}`);
    } finally {
      setSaving(false);
    }
  };

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
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (deviceId) {
      // Connexion BLE (système externe) au montage : le setState de « connexion en cours » est voulu.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      connectToDevice({ id: deviceId, name: deviceName ?? '' } as BLEDevice);
    }
  }, [deviceId, deviceName, connectToDevice]);

  const sendWifiCredentials = async () => {
    if (!connectedDevice) return;
    setSending(true);
    try {
      addLog(`Demande du pairingToken pour ${radioId}...`);
      const pairingToken = await fetchPairingToken(radioId);
      addLog(`pairingToken reçu (${pairingToken.length} car.)`);

      // JSON terminé par `\n`, envoyé en morceaux : l'ESP32 accumule jusqu'au `\n`.
      const message = stringToBytes(JSON.stringify({ ssid, password, pairingToken }) + '\n');
      for (let i = 0; i < message.length; i += BLE_CHUNK_SIZE) {
        await ble.writeCharacteristic(
          connectedDevice.id,
          ESP32_SERVICE_UUID,
          ESP32_CHARACTERISTIC_UUID,
          message.slice(i, i + BLE_CHUNK_SIZE),
          true,
        );
      }
      addLog(`Envoyé : { ssid: ${ssid}, password: ***, pairingToken: *** } (${message.length} octets)`);
    } catch (e) {
      addLog(`Erreur d'envoi : ${e}`);
    } finally {
      setSending(false);
    }
  };

  const isConnected = !!connectedDevice;
  const canSend = isConnected && !sending && ssid.trim().length > 0 && /^[0-9A-F]{12}$/.test(radioId);

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

        {/* Statut connexion BLE */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Bluetooth (ESP32)</Text>
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

        {/* Statut WebSocket (serveur) */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Serveur (WebSocket)</Text>
          <View style={styles.statusRow}>
            {ws.status === 'connecting' && <ActivityIndicator size="small" color="#007AFF" />}
            <Text
              style={[
                styles.statusText,
                ws.status === 'connected' && styles.statusOn,
                ws.status === 'error' && styles.statusOff,
              ]}>
              {ws.status === 'connected' ? 'Connecté' : ws.status === 'connecting' ? 'Connexion...' : 'Erreur'}
            </Text>
          </View>
          <Text style={styles.deviceIdText}>{ws.url || '(URL vide)'}</Text>
          {ws.error && <Text style={styles.wsError}>{ws.error}</Text>}
        </View>

        {/* Formulaire WiFi */}
        <View style={[styles.card, !isConnected && styles.cardDisabled]}>
          <Text style={styles.cardTitle}>Credentials Wi-Fi</Text>
          <TextInput
            style={[styles.input, !isConnected && styles.inputDisabled]}
            placeholder="Device ID radio (ex. 448CC41DB410)"
            placeholderTextColor="#aaa"
            value={radioId}
            onChangeText={(v) => setRadioId(v.trim().toUpperCase())}
            editable={isConnected}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
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
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Envoyer</Text>}
          </Pressable>
        </View>

        {/* Nommage après l'event WebSocket radio:paired */}
        {pairedRadio && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Radio appairée 🎉</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom de la radio (ex. Salon)"
              placeholderTextColor="#aaa"
              value={radioName}
              onChangeText={(v) => {
                setRadioName(v);
                setNameSaved(false);
              }}
              maxLength={100}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                (saving || !radioName.trim()) && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}
              onPress={saveRadioName}
              disabled={saving || !radioName.trim()}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>{nameSaved ? 'Nom enregistré ✓' : 'Enregistrer le nom'}</Text>
              )}
            </Pressable>
          </View>
        )}

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

      {/* Bannière des events WebSocket */}
      {wsNotice && (
        <Pressable style={styles.banner} onPress={() => setWsNotice(null)}>
          <Text style={styles.bannerText}>{wsNotice}</Text>
        </Pressable>
      )}
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
  statusLabel: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  wsError: { fontSize: 12, color: '#c0392b', marginTop: 6 },

  banner: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  bannerText: { color: '#fff', fontSize: 15, fontWeight: '600' },

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
