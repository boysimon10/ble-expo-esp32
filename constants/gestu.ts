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

// oui j'ai la flemme de mettre un autre env c juste un poc
export const SOCKET_URL = API_URL.replace(/\/api\/v\d+\/?$/, '');

export async function getAccessToken(forceRenew = false): Promise<string> {
  if (forceRenew || !accessToken) await renewTokens();
  return accessToken;
}

async function withAuth(path: string, body: unknown, method = 'POST') {
  const call = async () => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  let res = await call();
  if (res.status === 401) {
    await renewTokens();
    res = await call();
  }
  if (!res.json?.success) throw new Error(res.json?.message ?? `HTTP ${res.status}`);
  return res.json.data;
}

export async function fetchPairingToken(deviceId: string): Promise<string> {
  const data = await withAuth('/users/radios/pairing-token', { deviceId: deviceId.trim().toUpperCase() });
  if (!data?.pairingToken) throw new Error('pairingToken absent de la réponse');
  return data.pairingToken;
}

export async function renameRadio(radioId: string, name: string): Promise<void> {
  await withAuth(`/users/radios/${radioId}`, { name: name.trim() }, 'PATCH');
}
