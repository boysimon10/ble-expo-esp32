// Identifiants de test gëstu, lus depuis .env.local (non versionné, voir .env.example).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const TEST_EMAIL = process.env.EXPO_PUBLIC_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.EXPO_PUBLIC_TEST_PASSWORD ?? '';

let accessToken = process.env.EXPO_PUBLIC_TEST_ACCESS_TOKEN ?? '';
let refreshToken = process.env.EXPO_PUBLIC_TEST_REFRESH_TOKEN ?? '';

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// 401 → refresh (rotation), puis login en dernier recours.
async function renewTokens(): Promise<void> {
  const refreshed = await post('/auth/user/refresh', { refreshToken });
  const data = refreshed.json?.success
    ? refreshed.json.data
    : (await post('/auth/user/login', { email: TEST_EMAIL, password: TEST_PASSWORD })).json?.data;
  if (!data?.accessToken) throw new Error('Impossible de se reconnecter à l’API');
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
}

export async function fetchPairingToken(deviceId: string): Promise<string> {
  const body = { deviceId: deviceId.trim().toUpperCase() };
  let res = await post('/users/radios/pairing-token', body, accessToken);
  if (res.status === 401) {
    await renewTokens();
    res = await post('/users/radios/pairing-token', body, accessToken);
  }
  const token = res.json?.data?.pairingToken;
  if (!token) throw new Error(res.json?.message ?? `HTTP ${res.status}`);
  return token;
}
