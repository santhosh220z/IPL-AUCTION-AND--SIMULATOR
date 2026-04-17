import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { getApiBaseUrl } from "../api/http";

const SocketContext = createContext({
  socket: null,
  connected: false
});

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io(getApiBaseUrl(), {
      transports: ["websocket"]
    });

    newSocket.on("connect", () => setConnected(true));
    newSocket.on("disconnect", () => setConnected(false));

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
