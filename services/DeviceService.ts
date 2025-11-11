import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "@device_id";
const USER_ID_KEY = "@user_id";
const VENUE_ID_KEY = "@venue_id";

export class DeviceService {
  private static deviceId: string | null = null;
  private static userId: string | null = null;
  private static venueId: string | null = null;

  /**
   * Initialize device information
   * Call this once when the app starts
   */
  static async initialize(): Promise<void> {
    await this.getOrCreateDeviceId();
    await this.getOrCreateUserId();
    await this.getOrCreateVenueId();
  }

  /**
   * Get or create a unique device ID
   * This persists across app restarts
   */
  static async getOrCreateDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    // Try to get stored device ID
    let storedDeviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

    if (storedDeviceId) {
      this.deviceId = storedDeviceId;
      return storedDeviceId;
    }

    // Generate a new device ID using available identifiers
    let newDeviceId: string;

    if (Platform.OS === "android") {
      // For Android, use androidId if available
      const androidId = Application.getAndroidId();
      if (androidId) {
        newDeviceId = `android-${androidId}`;
      } else {
        // Fallback to generated ID
        newDeviceId = `android-${this.generateUUID()}`;
      }
    } else if (Platform.OS === "ios") {
      // For iOS, use identifierForVendor if available
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) {
        newDeviceId = `ios-${iosId}`;
      } else {
        // Fallback to generated ID
        newDeviceId = `ios-${this.generateUUID()}`;
      }
    } else {
      // For web or other platforms
      newDeviceId = `${Platform.OS}-${this.generateUUID()}`;
    }

    // Store the device ID
    await AsyncStorage.setItem(DEVICE_ID_KEY, newDeviceId);
    this.deviceId = newDeviceId;

    console.log("📱 Generated new device ID:", newDeviceId);
    return newDeviceId;
  }

  /**
   * Get the current device ID (must call initialize first)
   */
  static getDeviceId(): string {
    if (!this.deviceId) {
      throw new Error(
        "DeviceService not initialized. Call DeviceService.initialize() first."
      );
    }
    return this.deviceId;
  }

  /**
   * Get or create a user ID
   * You can set this when a user logs in
   */
  static async getOrCreateUserId(): Promise<string> {
    if (this.userId) {
      return this.userId;
    }

    let storedUserId = await AsyncStorage.getItem(USER_ID_KEY);

    if (storedUserId) {
      this.userId = storedUserId;
      return storedUserId;
    }

    // Default user ID (can be changed later with setUserId)
    const defaultUserId = "user-001";
    // const defaultUserId = `user-${this.generateShortId()}`;
    await this.setUserId(defaultUserId);
    return defaultUserId;
  }

  /**
   * Set the user ID (e.g., after login)
   */
  static async setUserId(userId: string): Promise<void> {
    this.userId = userId;
    await AsyncStorage.setItem(USER_ID_KEY, userId);
    console.log("👤 Set user ID:", userId);
  }

  /**
   * Get the current user ID
   */
  static getUserId(): string {
    if (!this.userId) {
      throw new Error(
        "DeviceService not initialized. Call DeviceService.initialize() first."
      );
    }
    return this.userId;
  }

  /**
   * Get or create a venue ID
   * You can set this based on your restaurant/venue
   */
  static async getOrCreateVenueId(): Promise<string> {
    if (this.venueId) {
      return this.venueId;
    }

    let storedVenueId = await AsyncStorage.getItem(VENUE_ID_KEY);

    if (storedVenueId) {
      this.venueId = storedVenueId;
      return storedVenueId;
    }

    // Default venue ID (can be changed later with setVenueId)
    const defaultVenueId = "venue-001";
    // const defaultVenueId = `venue-${this.generateShortId()}`;
    await this.setVenueId(defaultVenueId);
    return defaultVenueId;
  }

  /**
   * Set the venue ID (e.g., when selecting a restaurant)
   */
  static async setVenueId(venueId: string): Promise<void> {
    this.venueId = venueId;
    await AsyncStorage.setItem(VENUE_ID_KEY, venueId);
    console.log("🏪 Set venue ID:", venueId);
  }

  /**
   * Get the current venue ID
   */
  static getVenueId(): string {
    if (!this.venueId) {
      throw new Error(
        "DeviceService not initialized. Call DeviceService.initialize() first."
      );
    }
    return this.venueId;
  }

  /**
   * Get relay ID (based on device or can be customized)
   * In your architecture, relay might be the same as device for relay servers
   */
  static getRelayId(): string {
    // For now, return device ID as relay ID
    // You can customize this based on your relay architecture
    return this.getDeviceId();
  }

  /**
   * Get comprehensive device information
   */
  static async getDeviceInfo(): Promise<{
    deviceId: string;
    userId: string;
    venueId: string;
    relayId: string;
    deviceName: string | null;
    deviceType: Device.DeviceType | null;
    brand: string | null;
    modelName: string | null;
    osName: string | null;
    osVersion: string | null;
    platform: string;
  }> {
    return {
      deviceId: this.getDeviceId(),
      userId: this.getUserId(),
      venueId: this.getVenueId(),
      relayId: this.getRelayId(),
      deviceName: Device.deviceName,
      deviceType: Device.deviceType,
      brand: Device.brand,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      platform: Platform.OS,
    };
  }

  /**
   * Reset all stored IDs (useful for testing or logout)
   */
  static async reset(): Promise<void> {
    await AsyncStorage.multiRemove([DEVICE_ID_KEY, USER_ID_KEY, VENUE_ID_KEY]);
    this.deviceId = null;
    this.userId = null;
    this.venueId = null;
    console.log("🔄 Reset all device identifiers");
  }

  /**
   * Generate a UUID v4
   */
  private static generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate a short ID (8 characters)
   */
  private static generateShortId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
