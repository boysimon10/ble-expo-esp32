import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, getAccessToken } from '@/constants/gestu';

export type RadioPairedEvent = { radioId: string; deviceId: string; name: string };
export type SocketStatus = 'connecting' | 'connected' | 'error';

// Connexion temps réel à gestu-api (room `user:{id}`), pour recevoir `radio:paired`.
// L'état est exposé (status + error) au lieu d'être loggé : Socket.IO retente en boucle.
export function useRadioSocket(onPaired: (event: RadioPairedEvent) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  useEffect(() => {
    let renewOnNextConnect = false;
    let lastRenewAt = 0;

    if (!/^https?:\/\//.test(SOCKET_URL)) {
      setStatus('error');
      setError(`URL invalide « ${SOCKET_URL} » : .env.local chargé ? (relancer Metro avec -c)`);
      return;
    }

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
      setStatus('connected');
      setError(null);
    });
    socket.on('disconnect', (reason) => {
      // Le serveur coupe la connexion si le token est refusé : on renouvelle et on retente,
      // au plus une fois par minute pour ne pas boucler si les identifiants sont faux.
      if (reason === 'io server disconnect' && Date.now() - lastRenewAt > 60_000) {
        lastRenewAt = Date.now();
        renewOnNextConnect = true;
        setStatus('connecting');
        socket.connect();
      } else {
        setStatus('error');
        setError(reason === 'io server disconnect' ? 'Token refusé par le serveur' : reason);
      }
    });
    socket.on('connect_error', (err) => {
      // `description` contient l'erreur native du WebSocket (cause réelle), `message` seulement « websocket error ».
      const detail = (err as { description?: { message?: string } }).description?.message;
      setStatus('error');
      setError(detail ? `${err.message} (${detail})` : err.message);
    });
    socket.on('radio:paired', (event: RadioPairedEvent) => onPairedRef.current(event));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return { status, error, url: SOCKET_URL };
}
