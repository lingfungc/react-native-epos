import { ClientService } from "@/services/ClientService";
import { EventService } from "@/services/EventService";
import { RelayService } from "@/services/RelayService";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceService } from "../services/DeviceService";
import {
  isRelay,
  type TcpConnectionInfo,
  type TcpMessage,
  type TcpRole,
  type TcpServiceDelegate,
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
      onMessageReceived: async (message) => {
        console.log("📨 Message received:", message.type, message.data);
        setMessages((prev) => [...prev, message]);

        // Update connected clients list if it's in the message
        if (message.data?.connectedClients) {
          setConnectedClients(message.data.connectedClients);
        }

        // RELAY MODE: Handle sync messages from clients
        if (isRelay && message.type === "sync" && message.data) {
          console.log("🔄 [Relay Mode] Processing sync event from client...");
          try {
            const appliedEventIds = await RelayService.onEventReceived(
              message.data,
              message.deviceId,
              message.userId,
              message.venueId
            );

            // Send applied message with event IDs
            const appliedMessage = RelayService.createAppliedMessage(appliedEventIds);
            tcpService.sendMessage(appliedMessage);

            console.log("✅ [Relay Mode] Event processed and applied message sent");
          } catch (error) {
            console.error("❌ [Relay Mode] Error processing event:", error);

            // Send error acknowledgment (fallback)
            const ackMessage = RelayService.createAckMessage(
              message.data.eventId,
              false,
              (error as Error).message
            );
            tcpService.sendMessage(ackMessage);
          }
        }

        // CLIENT MODE: Handle "applied" messages from relay
        if (!isRelay && message.type === "applied" && message.data) {
          console.log("✅ [Client Mode] Received applied confirmation from relay");
          console.log("Applied event IDs:", message.data.appliedEventIds);

          try {
            // Mark events as acked in client database
            await EventService.markEventsAsAcked(message.data.appliedEventIds);
            console.log("✅ [Client Mode] Events marked as acked");
          } catch (error) {
            console.error("❌ [Client Mode] Error marking events as acked:", error);
          }
        }

        // CLIENT MODE: Handle broadcast messages from relay
        if (!isRelay && message.type === "broadcast" && message.data) {
          console.log("📡 [Client Mode] Processing broadcast event from relay...");
          try {
            await ClientService.onBroadcastReceived(
              message.data,
              message.deviceId,
              message.userId,
              message.venueId
            );

            // Update Lamport clock
            if (message.data.lamportClock) {
              ClientService.updateLamportClock(message.data.lamportClock);
            }

            // Send acknowledgment back to relay
            const processedMessage = ClientService.createProcessedMessage(
              message.data.eventId,
              true
            );
            tcpService.sendMessage(processedMessage);

            console.log("✅ [Client Mode] Broadcast event processed");
          } catch (error) {
            console.error("❌ [Client Mode] Error processing broadcast:", error);

            // Send error acknowledgment
            const processedMessage = ClientService.createProcessedMessage(
              message.data.eventId,
              false,
              (error as Error).message
            );
            tcpService.sendMessage(processedMessage);
          }
        }

        // Handle acknowledgments (both client and relay can receive these)
        if (message.type === "ack" && message.data) {
          console.log(
            "✅ Received acknowledgment for event:",
            message.data.eventId,
            "Success:",
            message.data.success
          );
          if (!message.data.success && message.data.error) {
            console.error("❌ Event processing failed:", message.data.error);
          }
        }

        // Handle processed messages (relay receives these from clients)
        if (isRelay && message.type === "processed" && message.data) {
          console.log(
            "✅ [Relay Mode] Client processed broadcast:",
            message.data.eventId,
            "Device:",
            message.data.deviceId,
            "Success:",
            message.data.success
          );
          if (!message.data.success && message.data.error) {
            console.error(
              "❌ [Relay Mode] Client processing failed:",
              message.data.error
            );
          }
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
