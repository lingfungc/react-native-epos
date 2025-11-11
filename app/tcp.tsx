import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  formatConnectionString,
  isValidIpAddress,
  isValidPort,
} from "../services/NetworkUtils";
import { useTcpService } from "../services/useTcpService";

export default function TcpConnectionScreen() {
  const {
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
  } = useTcpService();

  const [serverPort, setServerPort] = useState("8080");
  const [clientHost, setClientHost] = useState("");
  const [clientPort, setClientPort] = useState("8080");
  const [messageText, setMessageText] = useState("");

  const handleStartServer = async () => {
    const port = parseInt(serverPort, 10);
    if (!isValidPort(port)) {
      Alert.alert(
        "Invalid Port",
        "Please enter a valid port number (1024-65535)"
      );
      return;
    }

    try {
      await startServer(port);
      Alert.alert(
        "Server Started",
        `Server is running on port ${port}.\n\nShare this information with other devices:\nPort: ${port}\n\nNote: Clients will need your device's IP address to connect.`
      );
    } catch (err) {
      Alert.alert("Error", `Failed to start server: ${(err as Error).message}`);
    }
  };

  const handleConnectToServer = async () => {
    if (!isValidIpAddress(clientHost)) {
      Alert.alert("Invalid IP", "Please enter a valid IP address");
      return;
    }

    const port = parseInt(clientPort, 10);
    if (!isValidPort(port)) {
      Alert.alert(
        "Invalid Port",
        "Please enter a valid port number (1024-65535)"
      );
      return;
    }

    try {
      await connectToServer(clientHost, port);
      Alert.alert(
        "Connected",
        `Connected to ${formatConnectionString(clientHost, port)}`
      );
    } catch (err) {
      Alert.alert("Connection Failed", (err as Error).message);
    }
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) {
      Alert.alert("Empty Message", "Please enter a message");
      return;
    }

    sendMessage({
      type: "sync",
      data: { text: messageText },
    });
    setMessageText("");
  };

  const handleDisconnect = () => {
    Alert.alert("Disconnect", "Are you sure you want to disconnect?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => disconnect(),
      },
    ]);
  };

  const renderIdleState = () => (
    <View style={styles.section}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start as Server (Relay)</Text>
        <Text style={styles.cardDescription}>
          Your device will act as a relay for other devices to connect to.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Port (default: 8080)"
          value={serverPort}
          onChangeText={setServerPort}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleStartServer}
        >
          <Text style={styles.primaryButtonText}>Start Server</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connect to Server</Text>
        <Text style={styles.cardDescription}>
          Connect to another device that is running as a server.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Server IP Address (e.g., 192.168.1.100)"
          value={clientHost}
          onChangeText={setClientHost}
          keyboardType="decimal-pad"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Port (default: 8080)"
          value={clientPort}
          onChangeText={setClientPort}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleConnectToServer}
        >
          <Text style={styles.primaryButtonText}>Connect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConnectedState = () => (
    <View style={styles.section}>
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Status</Text>
        <Text style={styles.statusValue}>
          {role === "server" ? "🟢 Server Running" : "🟢 Connected to Server"}
        </Text>

        <Text style={styles.statusLabel}>Device ID</Text>
        <Text style={styles.statusValueSmall}>{deviceId}</Text>

        <Text style={styles.statusLabel}>User ID</Text>
        <Text style={styles.statusValueSmall}>{userId}</Text>

        <Text style={styles.statusLabel}>Venue ID</Text>
        <Text style={styles.statusValueSmall}>{venueId}</Text>

        {connectionInfo && (
          <>
            <Text style={styles.statusLabel}>Connection</Text>
            <Text style={styles.statusValue}>
              {formatConnectionString(
                connectionInfo.address,
                connectionInfo.port
              )}
            </Text>
          </>
        )}

        {role === "server" && (
          <>
            <Text style={styles.statusLabel}>Connected Clients</Text>
            <Text style={styles.statusValue}>{connectedClients.length}</Text>
          </>
        )}

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleDisconnect}
        >
          <Text style={styles.dangerButtonText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {role === "server" && connectedClients.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connected Clients</Text>
          {connectedClients.map((clientId, index) => {
            const clientInfo = getClientInfo(clientId);
            return (
              <View key={clientId} style={styles.clientItem}>
                <Text style={styles.clientIndex}>{index + 1}.</Text>
                <View style={styles.clientDetails}>
                  <Text style={styles.clientId}>{clientId}</Text>
                  {clientInfo?.userId && (
                    <Text style={styles.clientMeta}>
                      User: {clientInfo.userId}
                    </Text>
                  )}
                  {clientInfo?.venueId && (
                    <Text style={styles.clientMeta}>
                      Venue: {clientInfo.venueId}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Send Message</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          placeholder="Type your message..."
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSendMessage}
        >
          <Text style={styles.primaryButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Messages ({messages.length})</Text>
        <ScrollView style={styles.messageList}>
          {messages
            .slice()
            .reverse()
            .map((msg, index) => (
              <View
                key={`${msg.timestamp}-${index}`}
                style={styles.messageItem}
              >
                <Text style={styles.messageType}>{msg.type.toUpperCase()}</Text>
                <Text style={styles.messageDevice}>
                  {msg.deviceId === deviceId
                    ? "You"
                    : `Device: ${msg.deviceId.substring(0, 20)}...`}
                </Text>
                {msg.userId && msg.userId !== userId && (
                  <Text style={styles.messageUser}>User: {msg.userId}</Text>
                )}
                {msg.data?.text && (
                  <Text style={styles.messageText}>{msg.data.text}</Text>
                )}
                <Text style={styles.messageTime}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>TCP Local Network</Text>
          <Text style={styles.subtitle}>
            Connect devices on the same local network
          </Text>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {error.message}</Text>
          </View>
        )}

        {!isConnected ? renderIdleState() : renderConnectedState()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#2196F3",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#E3F2FD",
    opacity: 0.9,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {},
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  messageInput: {
    height: 80,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  dangerButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  statusLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 12,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  statusValueSmall: {
    fontSize: 12,
    color: "#333",
    fontFamily: "monospace",
  },
  clientItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  clientIndex: {
    fontSize: 14,
    color: "#666",
    marginRight: 8,
    fontWeight: "600",
  },
  clientDetails: {
    flex: 1,
  },
  clientId: {
    fontSize: 12,
    color: "#333",
    fontFamily: "monospace",
    marginBottom: 4,
  },
  clientMeta: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  messageList: {
    maxHeight: 300,
  },
  messageItem: {
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  messageType: {
    fontSize: 10,
    color: "#007AFF",
    fontWeight: "600",
    marginBottom: 4,
  },
  messageDevice: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontFamily: "monospace",
  },
  messageUser: {
    fontSize: 11,
    color: "#888",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 10,
    color: "#999",
  },
  errorCard: {
    backgroundColor: "#FFF3CD",
    borderRadius: 8,
    padding: 12,
    margin: 16,
    borderWidth: 1,
    borderColor: "#FFE69C",
  },
  errorText: {
    color: "#856404",
    fontSize: 14,
  },
});
