import { Platform } from "react-native";

/**
 * Determine if this device is a relay based on platform
 * iOS = relay (true)
 * Android/other = not relay (false)
 */
export const isRelay = Platform.OS === "ios";

// Log the relay status for debugging
console.log(
  `🔧 Relay mode: ${isRelay ? "ENABLED" : "DISABLED"} (Platform: ${
    Platform.OS
  })`
);
