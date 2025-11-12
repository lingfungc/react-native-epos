import Zeroconf from "react-native-zeroconf";

// Service type for your POS system
const SERVICE_TYPE = "_posrelay._tcp";
const DOMAIN = "local.";

export interface DiscoveredService {
  name: string; // e.g., "POS-Relay-venue-001"
  host: string; // e.g., "192.168.1.100"
  port: number; // e.g., 8080
  addresses: string[]; // All IP addresses
  txt?: {
    // Additional metadata
    deviceId?: string;
    venueId?: string;
    userId?: string;
  };
}

export interface BonjourDelegate {
  onServiceFound?: (service: DiscoveredService) => void;
  onServiceLost?: (service: DiscoveredService) => void;
  onError?: (error: Error) => void;
}

class BonjourService {
  private zeroconf: Zeroconf;
  private delegate: BonjourDelegate | null = null;
  private isPublishing: boolean = false;
  private isScanning: boolean = false;

  constructor() {
    this.zeroconf = new Zeroconf();
  }

  public setDelegate(delegate: BonjourDelegate) {
    this.delegate = delegate;
  }

  /**
   * RELAY: Publish/advertise service when server starts
   */
  public publishService(
    port: number,
    deviceId: string,
    userId: string,
    venueId: string
  ): void {
    if (this.isPublishing) {
      console.warn("Already publishing service");
      return;
    }

    try {
      const serviceName = `POS-Relay-${venueId}`;
      const txt = {
        deviceId,
        userId,
        venueId,
        version: "1.0",
      };

      console.log(`📡 Publishing mDNS service: ${serviceName}`);
      console.log(`   Type: ${SERVICE_TYPE}`);
      console.log(`   Port: ${port}`);
      console.log(`   Metadata:`, txt);

      try {
        this.zeroconf.publishService(
          SERVICE_TYPE,
          DOMAIN,
          serviceName,
          port,
          txt
        );

        this.isPublishing = true;
        console.log("✅ mDNS service published successfully");
      } catch (publishError) {
        console.error("❌ Failed to publish mDNS service:", publishError);

        const errorMessage = (publishError as Error).message || "";
        if (
          errorMessage.includes("permission") ||
          errorMessage.includes("denied")
        ) {
          const permissionError = new Error(
            "Local network permission denied. Please enable it in Settings > Privacy > Local Network"
          );
          this.delegate?.onError?.(permissionError);
        } else {
          this.delegate?.onError?.(publishError as Error);
        }

        throw publishError; // Re-throw to prevent continuing with invalid state
      }
    } catch (error) {
      console.error("❌ Error in publishService:", error);
      this.delegate?.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * RELAY: Stop advertising when server stops
   */
  public unpublishService(): void {
    if (!this.isPublishing) {
      return;
    }

    try {
      console.log("🛑 Unpublishing mDNS service");
      this.zeroconf.unpublishService(SERVICE_TYPE, DOMAIN);
      this.isPublishing = false;
      console.log("✅ mDNS service unpublished");
    } catch (error) {
      console.error("❌ Error unpublishing service:", error);
    }
  }

  /**
   * CLIENT: Start scanning for available relays
   */
  public startScanning(): void {
    if (this.isScanning) {
      console.warn("Already scanning");
      return;
    }

    console.log(`🔍 Starting mDNS scan for ${SERVICE_TYPE}...`);

    // Listen for service resolution (when service details are available)
    this.zeroconf.on("resolved", (service: any) => {
      console.log("✅ Service discovered:", service);

      const discoveredService: DiscoveredService = {
        name: service.name,
        host: service.host || service.addresses[0], // Primary IP
        port: service.port,
        addresses: service.addresses || [],
        txt: service.txt || {},
      };

      this.delegate?.onServiceFound?.(discoveredService);
    });

    // Listen for service removal
    this.zeroconf.on("remove", (service: any) => {
      console.log("❌ Service lost:", service.name);

      const lostService: DiscoveredService = {
        name: service.name,
        host: service.host || "",
        port: service.port || 0,
        addresses: [],
      };

      this.delegate?.onServiceLost?.(lostService);
    });

    // Listen for errors
    this.zeroconf.on("error", (error: Error) => {
      console.error("❌ mDNS error:", error);
      this.delegate?.onError?.(error);
    });

    // Start scanning
    this.zeroconf.scan(SERVICE_TYPE, "tcp", DOMAIN);
    this.isScanning = true;
    console.log("🔍 mDNS scanning started");
  }

  /**
   * CLIENT: Stop scanning
   */
  public stopScanning(): void {
    if (!this.isScanning) {
      return;
    }

    console.log("🛑 Stopping mDNS scan");
    this.zeroconf.stop();

    // Remove all listeners
    this.zeroconf.removeAllListeners("resolved");
    this.zeroconf.removeAllListeners("remove");
    this.zeroconf.removeAllListeners("error");

    this.isScanning = false;
    console.log("✅ mDNS scanning stopped");
  }

  /**
   * Get current scanning state
   */
  public isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Get current publishing state
   */
  public isCurrentlyPublishing(): boolean {
    return this.isPublishing;
  }

  /**
   * Cleanup - stop everything
   */
  public cleanup(): void {
    this.stopScanning();
    this.unpublishService();
  }
}

export default BonjourService;
