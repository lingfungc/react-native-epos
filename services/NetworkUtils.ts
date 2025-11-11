import { Platform } from "react-native";

/**
 * Get the local IP address of the device
 * Note: This is a simplified version. For production, you might want to use
 * a native module or a library like react-native-network-info
 */
export async function getLocalIpAddress(): Promise<string | null> {
  if (Platform.OS === "ios") {
    // On iOS, we need to use a workaround
    // The most reliable way is to use a native module
    // For now, we'll return null and the user will need to manually enter the IP
    return null;
  }

  return null;
}

/**
 * Validate IP address format
 */
export function isValidIpAddress(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) {
    return false;
  }

  const parts = ip.split(".");
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validate port number
 */
export function isValidPort(port: number): boolean {
  return port >= 1024 && port <= 65535;
}

/**
 * Get a list of common local network IP ranges for scanning
 */
export function getLocalNetworkRanges(baseIp: string): string[] {
  const parts = baseIp.split(".");
  if (parts.length !== 4) {
    return [];
  }

  const base = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const ranges: string[] = [];

  // Generate IPs from .1 to .254
  for (let i = 1; i < 255; i++) {
    ranges.push(`${base}.${i}`);
  }

  return ranges;
}

/**
 * Format connection info for display
 */
export function formatConnectionString(host: string, port: number): string {
  return `${host}:${port}`;
}

/**
 * Parse connection string
 */
export function parseConnectionString(
  connectionString: string
): { host: string; port: number } | null {
  const parts = connectionString.split(":");
  if (parts.length !== 2) {
    return null;
  }

  const [host, portStr] = parts;
  const port = parseInt(portStr, 10);

  if (!isValidIpAddress(host) || !isValidPort(port)) {
    return null;
  }

  return { host, port };
}

/**
 * Get suggested server ports
 */
export function getSuggestedPorts(): number[] {
  return [8080, 8081, 8082, 9000, 9001];
}
