import NetInfo from "@react-native-community/netinfo";

export class NetworkInfoService {
  /**
   * Get the device's local IP address
   */
  static async getLocalIpAddress(): Promise<string | null> {
    try {
      const state = await NetInfo.fetch();

      // Check if connected to WiFi
      if (state.type === "wifi" && state.details) {
        const details = state.details as any;

        // Get IP address from WiFi details
        const ipAddress = details.ipAddress || details.ipv4Address;

        if (ipAddress && ipAddress !== "0.0.0.0") {
          return ipAddress;
        }
      }

      // Check if connected via Ethernet
      if (state.type === "ethernet" && state.details) {
        const details = state.details as any;
        const ipAddress = details.ipAddress || details.ipv4Address;

        if (ipAddress && ipAddress !== "0.0.0.0") {
          return ipAddress;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting IP address:", error);
      return null;
    }
  }

  /**
   * Format connection string for display
   */
  static formatConnectionString(ip: string, port: number): string {
    return `${ip}:${port}`;
  }

  /**
   * Check if connected to network
   */
  static async isConnectedToNetwork(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true;
    } catch (error) {
      return false;
    }
  }
}
