import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceService } from "../services/DeviceService";
import type {
  TcpConnectionInfo,
  TcpMessage,
  TcpRole,
  TcpServiceDelegate,
} from "../services/TcpService";
import { getTcpService } from "../services/TcpServiceSingleton";

export interface UseTcpServiceResult {
  role: TcpRole;
  deviceId: string;
  userId: string;
  venueId: string;
  connectionInfo: TcpConnectionInfo | null;
  connectedClients: string[];
  connectedClientsInfo: Map<string, Partial<TcpConnectionInfo>>;
  messages: TcpMessage[];
  isConnected: boolean;
  error: Error | null;
  startServer: (port?: number) => Promise<void>;
  connectToServer: (host: string, port: number) => Promise<void>;
  sendMessage: (
    message: Omit<TcpMessage, "deviceId" | "userId" | "venueId" | "timestamp">
  ) => void;
  disconnect: () => void;
  getClientInfo: (clientId: string) => Partial<TcpConnectionInfo> | undefined;
}

export function useTcpService(): UseTcpServiceResult {
  const tcpService = getTcpService();
  const [role, setRole] = useState<TcpRole>("none");
  const [deviceId, setDeviceId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");
  const [
    connectionInfo,
    setConnectionInfo,
  ] = useState<TcpConnectionInfo | null>(null);
  const [connectedClients, setConnectedClients] = useState<string[]>([]);
  const [connectedClientsInfo, setConnectedClientsInfo] = useState<
    Map<string, Partial<TcpConnectionInfo>>
  >(new Map());
  const [messages, setMessages] = useState<TcpMessage[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Use refs to maintain callbacks across renders
  const delegateRef = useRef<TcpServiceDelegate>({});

  // Initialize device info once
  useEffect(() => {
    try {
      setDeviceId(DeviceService.getDeviceId());
      setUserId(DeviceService.getUserId());
      setVenueId(DeviceService.getVenueId());
    } catch (error) {
      console.error(
        "DeviceService not initialized. Make sure to call DeviceService.initialize() in your app startup."
      );
      console.error("DeviceService error: ", error);
    }

    // Sync initial state from service
    setRole(tcpService.getRole());
    setIsConnected(tcpService.getRole() !== "none");
  }, [tcpService]);

  // Set up persistent delegate
  useEffect(() => {
    delegateRef.current = {
      onConnectionEstablished: (info) => {
        console.log("📡 Connection established:", info);
        setConnectionInfo(info);
        setIsConnected(true);
        setError(null);
        setRole(tcpService.getRole());
      },
      onConnectionClosed: () => {
        console.log("📡 Connection closed");
        setIsConnected(false);
        setConnectionInfo(null);
        setRole("none");
        setConnectedClients([]);
        setConnectedClientsInfo(new Map());
      },
      onMessageReceived: (message) => {
        console.log("📨 Message received:", message.type, message.data);
        setMessages((prev) => [...prev, message]);

        // Update connected clients list if it's in the message
        if (message.data?.connectedClients) {
          setConnectedClients(message.data.connectedClients);
        }
      },
      onClientConnected: (clientId, clientInfo) => {
        console.log("👤 Client connected:", clientId);
        setConnectedClients((prev) => [...prev, clientId]);
        if (clientInfo) {
          setConnectedClientsInfo((prev) => {
            const newMap = new Map(prev);
            newMap.set(clientId, clientInfo);
            return newMap;
          });
        }
      },
      onClientDisconnected: (clientId) => {
        console.log("👤 Client disconnected:", clientId);
        setConnectedClients((prev) => prev.filter((id) => id !== clientId));
        setConnectedClientsInfo((prev) => {
          const newMap = new Map(prev);
          newMap.delete(clientId);
          return newMap;
        });
      },
      onError: (err) => {
        console.error("❌ TCP Error:", err);
        setError(err);
        setIsConnected(false);
      },
    };

    // Set the persistent delegate
    tcpService.setDelegate(delegateRef.current);

    // DON'T clear delegate on unmount - keep it persistent
    return () => {
      console.log("🔄 Component unmounting, keeping delegate active");
      // Do nothing - delegate stays active
    };
  }, [tcpService]);

  const startServer = useCallback(
    async (port: number = 8080) => {
      try {
        setError(null);
        await tcpService.startServer(port);
        setRole("server");
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [tcpService]
  );

  const connectToServer = useCallback(
    async (host: string, port: number) => {
      try {
        setError(null);
        await tcpService.connectToServer(host, port);
        setRole("client");
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [tcpService]
  );

  const sendMessage = useCallback(
    (
      message: Omit<TcpMessage, "deviceId" | "userId" | "venueId" | "timestamp">
    ) => {
      if (isConnected || tcpService.getRole() !== "none") {
        console.log("📤 Sending message:", message.type, message.data);
        tcpService.sendMessage(message);
      } else {
        console.warn("⚠️ Cannot send message: not connected");
      }
    },
    [tcpService, isConnected]
  );

  const disconnect = useCallback(() => {
    tcpService.stop();
    setRole("none");
    setIsConnected(false);
    setConnectionInfo(null);
    setConnectedClients([]);
    setConnectedClientsInfo(new Map());
    setMessages([]);
    setError(null);
  }, [tcpService]);

  const getClientInfo = useCallback(
    (clientId: string): Partial<TcpConnectionInfo> | undefined => {
      return tcpService.getClientInfo(clientId);
    },
    [tcpService]
  );

  return {
    role,
    deviceId,
    userId,
    venueId,
    connectionInfo,
    connectedClients,
    connectedClientsInfo,
    messages,
    isConnected,
    error,
    startServer,
    connectToServer,
    sendMessage,
    disconnect,
    getClientInfo,
  };
}
