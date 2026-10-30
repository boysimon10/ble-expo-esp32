import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, getAccessToken } from '@/constants/gestu';

export type RadioPairedEvent = { radioId: string; deviceId: string; name: string };

// Connexion temps réel à gestu-api (room `user:{id}`), pour recevoir `radio:paired`.
export function useRadioSocket(onPaired: (event: RadioPairedEvent) => void, onLog: (msg: string) => void) {
  const [connected, setConnected] = useState(false);
  const onPairedRef = useRef(onPaired);
  const onLogRef = useRef(onLog);
  onPairedRef.current = onPaired;
  onLogRef.current = onLog;

  useEffect(() => {
    let renewOnNextConnect = false;
    let lastRenewAt = 0;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: (cb) => {
        getAccessToken(renewOnNextConnect)
          .then((token) => cb({ token }))
          .catch(() => cb({}));
        renewOnNextConnect = false;
      },
    });

    socket.on('connect', () => {
      setConnected(true);
      onLogRef.current('WebSocket connecté');
    });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      // Le serveur coupe la connexion si le token est refusé : on renouvelle et on retente,
      // au plus une fois par minute pour ne pas boucler si les identifiants sont faux.
      if (reason === 'io server disconnect' && Date.now() - lastRenewAt > 60_000) {
        lastRenewAt = Date.now();
        renewOnNextConnect = true;
        onLogRef.current('WebSocket refusé — renouvellement du token...');
        socket.connect();
      } else {
        onLogRef.current(`WebSocket déconnecté : ${reason}`);
      }
    });
    socket.on('connect_error', (err) => onLogRef.current(`WebSocket erreur : ${err.message}`));
    socket.on('radio:paired', (event: RadioPairedEvent) => onPairedRef.current(event));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return { connected };
}
