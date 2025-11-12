import { DiscoveredService } from "@/services/BonjourService";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceService } from "../services/DeviceService";
import TcpService, {
  TcpConnectionInfo,
  TcpMessage,
  TcpRole,
  TcpServiceDelegate,
} from "../services/TcpService";

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

  discoveredServices: DiscoveredService[];
  isScanning: boolean;

  startServer: (port?: number) => Promise<void>;
  connectToServer: (host: string, port: number) => Promise<void>;

  startDiscovery: () => void;
  stopDiscovery: () => void;
  connectToDiscoveredService: (service: DiscoveredService) => Promise<void>;

  sendMessage: (
    message: Omit<TcpMessage, "deviceId" | "userId" | "venueId" | "timestamp">
  ) => void;
  disconnect: () => void;
  getClientInfo: (clientId: string) => Partial<TcpConnectionInfo> | undefined;
}

export function useTcpService(): UseTcpServiceResult {
  const tcpServiceRef = useRef<TcpService | null>(null);
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

  const [discoveredServices, setDiscoveredServices] = useState<
    DiscoveredService[]
  >([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Initialize TCP service
  useEffect(() => {
    if (!tcpServiceRef.current) {
      const service = new TcpService();
      tcpServiceRef.current = service;

      // Get device identifiers from DeviceService
      try {
        setDeviceId(DeviceService.getDeviceId());
        setUserId(DeviceService.getUserId());
        setVenueId(DeviceService.getVenueId());
      } catch (error) {
        console.error("DeviceService not initialized");
      }

      // TCP delegate
      const tcpDelegate: TcpServiceDelegate = {
        onConnectionEstablished: (info) => {
          setConnectionInfo(info);
          setIsConnected(true);
          setError(null);
        },
        onConnectionClosed: () => {
          setIsConnected(false);
          setConnectionInfo(null);
          setRole("none");
          setConnectedClients([]);
          setConnectedClientsInfo(new Map());
        },
        onMessageReceived: (message) => {
          setMessages((prev) => [...prev, message]);
          if (message.data?.connectedClients) {
            setConnectedClients(message.data.connectedClients);
          }
        },
        onClientConnected: (clientId, clientInfo) => {
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
          setConnectedClients((prev) => prev.filter((id) => id !== clientId));
          setConnectedClientsInfo((prev) => {
            const newMap = new Map(prev);
            newMap.delete(clientId);
            return newMap;
          });
        },
        onError: (err) => {
          setError(err);
          setIsConnected(false);
        },
      };

      service.setDelegate(tcpDelegate);

      const bonjourService = service.getBonjourService();
      bonjourService.setDelegate({
        onServiceFound: (discoveredService) => {
          console.log("📡 Service discovered:", discoveredService);
          setDiscoveredServices((prev) => {
            // Avoid duplicates
            const exists = prev.some((s) => s.name === discoveredService.name);
            if (exists) {
              return prev.map((s) =>
                s.name === discoveredService.name ? discoveredService : s
              );
            }
            return [...prev, discoveredService];
          });
        },
        onServiceLost: (lostService) => {
          console.log("📡 Service lost:", lostService.name);
          setDiscoveredServices((prev) =>
            prev.filter((s) => s.name !== lostService.name)
          );
        },
        onError: (err) => {
          console.error("mDNS error:", err);
          setError(err);
        },
      });
    }

    return () => {
      if (tcpServiceRef.current) {
        const bonjourService = tcpServiceRef.current.getBonjourService();
        bonjourService.cleanup();
        tcpServiceRef.current.stop();
      }
    };
  }, []);

  const startServer = useCallback(async (port: number = 8080) => {
    try {
      setError(null);
      if (tcpServiceRef.current) {
        await tcpServiceRef.current.startServer(port);
        setRole("server");
      }
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  const connectToServer = useCallback(async (host: string, port: number) => {
    try {
      setError(null);
      if (tcpServiceRef.current) {
        await tcpServiceRef.current.connectToServer(host, port);
        setRole("client");
      }
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  }, []);

  const startDiscovery = useCallback(() => {
    if (tcpServiceRef.current) {
      const bonjourService = tcpServiceRef.current.getBonjourService();
      bonjourService.startScanning();
      setIsScanning(true);
      setDiscoveredServices([]); // Clear old results
    }
  }, []);

  const stopDiscovery = useCallback(() => {
    if (tcpServiceRef.current) {
      const bonjourService = tcpServiceRef.current.getBonjourService();
      bonjourService.stopScanning();
      setIsScanning(false);
    }
  }, []);

  const connectToDiscoveredService = useCallback(
    async (service: DiscoveredService) => {
      try {
        // Stop scanning first
        stopDiscovery();

        // Connect using discovered host and port
        await connectToServer(service.host, service.port);
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [connectToServer, stopDiscovery]
  );

  const sendMessage = useCallback(
    (
      message: Omit<TcpMessage, "deviceId" | "userId" | "venueId" | "timestamp">
    ) => {
      if (tcpServiceRef.current && isConnected) {
        tcpServiceRef.current.sendMessage(message);
      }
    },
    [isConnected]
  );

  const disconnect = useCallback(() => {
    if (tcpServiceRef.current) {
      stopDiscovery(); // Stop scanning if active
      tcpServiceRef.current.stop();
      setRole("none");
      setIsConnected(false);
      setConnectionInfo(null);
      setConnectedClients([]);
      setConnectedClientsInfo(new Map());
      setMessages([]);
      setError(null);
      setDiscoveredServices([]);
    }
  }, [stopDiscovery]);

  const getClientInfo = useCallback((clientId: string):
    | Partial<TcpConnectionInfo>
    | undefined => {
    return tcpServiceRef.current?.getClientInfo(clientId);
  }, []);

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
    discoveredServices,
    isScanning,
    startServer,
    connectToServer,
    startDiscovery,
    stopDiscovery,
    connectToDiscoveredService,
    sendMessage,
    disconnect,
    getClientInfo,
  };
}
