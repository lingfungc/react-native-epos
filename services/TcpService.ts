import * as Device from "expo-device";

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
