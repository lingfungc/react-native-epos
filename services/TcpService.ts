import * as Device from "expo-device";
import TcpSocket from "react-native-tcp-socket";

import { DeviceService } from "./DeviceService";

/**
 * Determine if this device is a relay based on Device Operating System
 * iOS = relay (true)
 * Android/other = not relay (false)
 */
export const isRelay = Device.osName === "iOS";

// Log the relay status for debugging
console.log(
  `🔧 Relay mode: ${isRelay ? "ENABLED" : "DISABLED"} (Device: ${
    Device.osName
  })`
);

export interface TcpMessage {
  type: "sync" | "update" | "heartbeat" | "join" | "leave";
  deviceId: string;
  userId: string;
  venueId: string;
  timestamp: number;
  data?: any;
}

export interface TcpConnectionInfo {
  address: string;
  port: number;
  deviceId: string;
  userId: string;
  venueId: string;
}

export type TcpRole = "server" | "client" | "none";

export interface TcpServiceDelegate {
  onConnectionEstablished?: (info: TcpConnectionInfo) => void;
  onConnectionClosed?: () => void;
  onMessageReceived?: (message: TcpMessage) => void;
  onClientConnected?: (
    clientId: string,
    clientInfo: Partial<TcpConnectionInfo>
  ) => void;
  onClientDisconnected?: (clientId: string) => void;
  onError?: (error: Error) => void;
}

class TcpService {
  private server: any = null;
  private client: any = null;
  private connectedClients: Map<string, any> = new Map();
  private clientsInfo: Map<string, Partial<TcpConnectionInfo>> = new Map();
  private role: TcpRole = "none";
  private delegate: TcpServiceDelegate | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // constructor() {
  // }

  public setDelegate(delegate: TcpServiceDelegate) {
    this.delegate = delegate;
  }

  public getDeviceId(): string {
    return DeviceService.getDeviceId();
  }

  public getUserId(): string {
    return DeviceService.getUserId();
  }

  public getVenueId(): string {
    return DeviceService.getVenueId();
  }

  public getRole(): TcpRole {
    return this.role;
  }

  public getConnectedClients(): string[] {
    return Array.from(this.connectedClients.keys());
  }

  public getConnectedClientsInfo(): Map<string, Partial<TcpConnectionInfo>> {
    return new Map(this.clientsInfo);
  }

  public getClientInfo(
    clientId: string
  ): Partial<TcpConnectionInfo> | undefined {
    return this.clientsInfo.get(clientId);
  }

  // Start as server (relay)
  public startServer(port: number = 8080): Promise<TcpConnectionInfo> {
    return new Promise((resolve, reject) => {
      if (this.role !== "none") {
        reject(new Error(`Already running as ${this.role}`));
        return;
      }

      try {
        this.server = TcpSocket.createServer((socket) => {
          this.handleClientConnection(socket);
        });

        this.server.listen({ port, host: "0.0.0.0" }, () => {
          this.role = "server";
          const address = this.server.address();

          const info: TcpConnectionInfo = {
            address: this.getLocalIpAddress(address),
            port: address.port,
            deviceId: DeviceService.getDeviceId(),
            userId: DeviceService.getUserId(),
            venueId: DeviceService.getVenueId(),
          };

          this.startHeartbeat();
          this.delegate?.onConnectionEstablished?.(info);

          console.log(`TCP Server started on ${info.address}:${info.port}`);
          console.log(
            `Device: ${info.deviceId}, User: ${info.userId}, Venue: ${info.venueId}`
          );
          resolve(info);
        });

        this.server.on("error", (error: Error) => {
          console.error("Server error:", error);
          this.delegate?.onError?.(error);
          reject(error);
        });

        this.server.on("close", () => {
          console.log("Server closed");
          this.cleanup();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Connect as client
  public connectToServer(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.role !== "none") {
        reject(new Error(`Already running as ${this.role}`));
        return;
      }

      try {
        const options = {
          port,
          host,
          reuseAddress: true,
        };

        this.client = TcpSocket.createConnection(options, () => {
          this.role = "client";

          const info: TcpConnectionInfo = {
            address: host,
            port,
            deviceId: DeviceService.getDeviceId(),
            userId: DeviceService.getUserId(),
            venueId: DeviceService.getVenueId(),
          };

          // Send join message with full device info
          this.sendMessage({
            type: "join",
            data: {
              deviceInfo: {
                deviceId: info.deviceId,
                userId: info.userId,
                venueId: info.venueId,
              },
            },
          });

          this.startHeartbeat();
          this.delegate?.onConnectionEstablished?.(info);

          console.log(`Connected to server at ${host}:${port}`);
          console.log(
            `Device: ${info.deviceId}, User: ${info.userId}, Venue: ${info.venueId}`
          );
          resolve();
        });

        this.client.on("data", (data: Buffer) => {
          this.handleDataReceived(data, this.client);
        });

        this.client.on("error", (error: Error) => {
          console.error("Client error:", error);
          this.delegate?.onError?.(error);
          reject(error);
        });

        this.client.on("close", () => {
          console.log("Connection closed");
          this.cleanup();
          this.delegate?.onConnectionClosed?.();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleClientConnection(socket: any) {
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`Client connected: ${clientAddress}`);

    let clientId = "";

    socket.on("data", (data: Buffer) => {
      try {
        const message: TcpMessage = JSON.parse(data.toString());

        // Store client ID and info on first message
        if (message.type === "join") {
          clientId = message.deviceId;
          this.connectedClients.set(clientId, socket);

          // Store client info if provided
          if (message.data?.deviceInfo) {
            this.clientsInfo.set(clientId, message.data.deviceInfo);
          }

          this.delegate?.onClientConnected?.(
            clientId,
            message.data?.deviceInfo || {}
          );
          console.log(
            `Client ${clientId} joined (User: ${message.userId}, Venue: ${message.venueId})`
          );
        }

        // Relay message to all other clients (except sender)
        if (this.role === "server" && message.type !== "heartbeat") {
          this.relayToOtherClients(message, clientId);
        }

        this.delegate?.onMessageReceived?.(message);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    });

    socket.on("error", (error: Error) => {
      console.error(`Client error (${clientAddress}):`, error);
    });

    socket.on("close", () => {
      console.log(`Client disconnected: ${clientAddress}`);
      if (clientId) {
        this.connectedClients.delete(clientId);
        this.clientsInfo.delete(clientId);
        this.delegate?.onClientDisconnected?.(clientId);

        // Notify other clients
        this.relayToOtherClients(
          {
            type: "leave",
            deviceId: clientId,
            userId: "",
            venueId: "",
            timestamp: Date.now(),
          },
          clientId
        );
      }
    });
  }

  private handleDataReceived(data: Buffer, socket: any) {
    try {
      const message: TcpMessage = JSON.parse(data.toString());
      this.delegate?.onMessageReceived?.(message);
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  private relayToOtherClients(message: TcpMessage, excludeClientId: string) {
    const messageStr = JSON.stringify(message);

    this.connectedClients.forEach((socket, clientId) => {
      if (clientId !== excludeClientId) {
        try {
          socket.write(messageStr);
        } catch (error) {
          console.error(`Error sending to client ${clientId}:`, error);
        }
      }
    });
  }

  public sendMessage(
    message: Omit<TcpMessage, "deviceId" | "userId" | "venueId" | "timestamp">
  ): void {
    const fullMessage: TcpMessage = {
      ...message,
      deviceId: DeviceService.getDeviceId(),
      userId: DeviceService.getUserId(),
      venueId: DeviceService.getVenueId(),
      timestamp: Date.now(),
    };

    const messageStr = JSON.stringify(fullMessage);

    if (this.role === "server") {
      // Send to all connected clients
      this.connectedClients.forEach((socket, clientId) => {
        try {
          socket.write(messageStr);
        } catch (error) {
          console.error(`Error sending to client ${clientId}:`, error);
        }
      });
    } else if (this.role === "client" && this.client) {
      // Send to server
      try {
        this.client.write(messageStr);
      } catch (error) {
        console.error("Error sending to server:", error);
      }
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({
        type: "heartbeat",
        data: { connectedClients: this.getConnectedClients() },
      });
    }, 30000); // Every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public stop() {
    // Send leave message before disconnecting
    if (this.role !== "none") {
      this.sendMessage({
        type: "leave",
      });
    }

    this.cleanup();
  }

  private cleanup() {
    this.stopHeartbeat();

    if (this.server) {
      try {
        this.server.close();
      } catch (error) {
        console.error("Error closing server:", error);
      }
      this.server = null;
    }

    if (this.client) {
      try {
        this.client.destroy();
      } catch (error) {
        console.error("Error closing client:", error);
      }
      this.client = null;
    }

    // Close all client connections
    this.connectedClients.forEach((socket, clientId) => {
      try {
        socket.destroy();
      } catch (error) {
        console.error(`Error closing client ${clientId}:`, error);
      }
    });
    this.connectedClients.clear();

    this.role = "none";
    this.delegate?.onConnectionClosed?.();
  }

  private getLocalIpAddress(address: any): string {
    // In production, you might want to get the actual local IP
    // For now, return the bound address
    if (address.address === "0.0.0.0" || address.address === "::") {
      return "0.0.0.0"; // Client will need to use actual IP
    }
    return address.address;
  }
}

export default TcpService;
