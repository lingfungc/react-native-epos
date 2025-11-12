declare module "react-native-zeroconf" {
  export interface ZeroconfService {
    name: string;
    fullName?: string;
    host: string;
    port: number;
    addresses: string[];
    txt?: Record<string, string>;
  }

  export default class Zeroconf {
    constructor();

    /**
     * Start scanning for services
     * @param type - Service type (e.g., 'http', 'airplay')
     * @param protocol - Protocol (usually 'tcp' or 'udp')
     * @param domain - Domain (usually 'local.')
     */
    scan(type?: string, protocol?: string, domain?: string): void;

    /**
     * Stop scanning for services
     */
    stop(): void;

    /**
     * Register event listeners
     * @param event - Event name
     * @param handler - Event handler function
     */
    on(event: "start", handler: () => void): void;
    on(event: "stop", handler: () => void): void;
    on(event: "found", handler: (service: string) => void): void;
    on(event: "resolved", handler: (service: ZeroconfService) => void): void;
    on(event: "remove", handler: (service: ZeroconfService) => void): void;
    on(event: "update", handler: () => void): void;
    on(event: "error", handler: (error: any) => void): void;

    /**
     * Remove event listener
     * @param event - Event name
     * @param handler - Event handler function
     */
    off(event: string, handler: (...args: any[]) => void): void;

    /**
     * Remove all event listeners
     */
    removeAllListeners(): void;

    /**
     * Get all resolved services
     */
    getServices(): Record<string, ZeroconfService>;

    /**
     * Publish a service
     * @param type - Service type
     * @param protocol - Protocol
     * @param domain - Domain
     * @param name - Service name
     * @param port - Port number
     * @param txt - TXT record
     */
    publishService(
      type: string,
      protocol: string,
      domain: string,
      name: string,
      port: number,
      txt?: Record<string, string>
    ): void;

    /**
     * Unpublish a service
     * @param name - Service name
     */
    unpublishService(name: string): void;
  }
}
