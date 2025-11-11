import { DatabaseService } from "@/services/DatabaseService";
import { DeviceService } from "@/services/DeviceService";
import { JournalService } from "@/services/JournalService";
import { OutboxService } from "@/services/OutboxService";
import { isRelay } from "@/services/TcpService";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import EventsScreen from "./events";
import JournalsScreen from "./journals";
import OrdersScreen from "./orders";
import OutboxScreen from "./outboxes";

type Tab = "orders" | "events" | "outbox" | "journals";

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize device and storage when app opens
    const initializeApp = async () => {
      try {
        // Step 1: Initialize device information FIRST
        await DeviceService.initialize();
        const deviceInfo = await DeviceService.getDeviceInfo();
        console.log("📱 Device initialized:", deviceInfo);

        // Step 2: Initialize today's journal if relay
        if (isRelay) {
          const journal = await JournalService.getOrCreateTodaysJournal();
          console.log("✅ Today's journal initialized:", journal.date);
        }

        // Step 3: Initialize today's outbox
        const outbox = await OutboxService.getOrCreateTodaysOutbox();
        console.log("✅ Today's outbox initialized:", outbox.date);

        setIsInitialized(true);
      } catch (error) {
        console.error("❌ Failed to initialize app:", error);
        setIsInitialized(true); // Still allow app to load
      }
    };

    initializeApp();
  }, []);

  const handleResetDatabase = () => {
    Alert.alert(
      "Reset Database",
      "Are you sure you want to delete all data? This will remove all orders, events, outboxes, and journals. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await DatabaseService.resetDatabase();
              // Reinitialize today's journal after reset
              if (isRelay) {
                await JournalService.getOrCreateTodaysJournal();
              }
              // Reinitialize today's outbox after reset
              await OutboxService.getOrCreateTodaysOutbox();
              Alert.alert("Success", "Database has been reset successfully.");
            } catch (error) {
              console.error("Error resetting database:", error);
              Alert.alert(
                "Error",
                "Failed to reset database. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  // Optional: Show loading state while initializing
  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Relay Mode Indicator */}
      <View
        style={[
          styles.relayBanner,
          isRelay ? styles.relayBannerActive : styles.relayBannerInactive,
        ]}
      >
        <Text style={styles.relayBannerText}>
          {isRelay ? "🔄 RELAY MODE" : "📱 POS MODE"} •{" "}
          {Platform.OS.toUpperCase()}
        </Text>
        <Text style={styles.relayBannerSubtext}>
          {isRelay ? "Events → Journal (acked)" : "Events → Outbox (pending)"}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === "orders" && <OrdersScreen />}
        {activeTab === "events" && <EventsScreen />}
        {activeTab === "outbox" && <OutboxScreen />}
        {activeTab === "journals" && <JournalsScreen />}
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab("orders")}
        >
          <View
            style={[
              styles.iconContainer,
              activeTab === "orders" && styles.iconContainerActive,
            ]}
          >
            <Text style={styles.icon}>📋</Text>
          </View>
          <Text
            style={[
              styles.navText,
              activeTab === "orders" && styles.navTextActive,
            ]}
          >
            Orders
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab("events")}
        >
          <View
            style={[
              styles.iconContainer,
              activeTab === "events" && styles.iconContainerActive,
            ]}
          >
            <Text style={styles.icon}>⚡</Text>
          </View>
          <Text
            style={[
              styles.navText,
              activeTab === "events" && styles.navTextActive,
            ]}
          >
            Events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab("outbox")}
        >
          <View
            style={[
              styles.iconContainer,
              activeTab === "outbox" && styles.iconContainerActive,
            ]}
          >
            <Text style={styles.icon}>📤</Text>
          </View>
          <Text
            style={[
              styles.navText,
              activeTab === "outbox" && styles.navTextActive,
            ]}
          >
            Outbox
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => setActiveTab("journals")}
        >
          <View
            style={[
              styles.iconContainer,
              activeTab === "journals" && styles.iconContainerActive,
            ]}
          >
            <Text style={styles.icon}>📔</Text>
          </View>
          <Text
            style={[
              styles.navText,
              activeTab === "journals" && styles.navTextActive,
            ]}
          >
            Journals
          </Text>
        </TouchableOpacity>

        {/* Reset DB Button */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetDatabase}
          activeOpacity={0.7}
        >
          <View style={styles.resetIconContainer}>
            <Text style={styles.resetIcon}>🗑️</Text>
          </View>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  relayBanner: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 16, // Account for status bar
    alignItems: "center",
    justifyContent: "center",
  },
  relayBannerActive: {
    backgroundColor: "#10b981", // Green for relay mode
  },
  relayBannerInactive: {
    backgroundColor: "#3b82f6", // Blue for POS mode
  },
  relayBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 1,
    marginBottom: 2,
  },
  relayBannerSubtext: {
    fontSize: 11,
    fontWeight: "500",
    color: "#ffffff",
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingBottom: 20,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 8,
    alignItems: "flex-start",
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  iconContainerActive: {
    backgroundColor: "#eff6ff",
  },
  icon: {
    fontSize: 24,
  },
  navText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666666",
    marginTop: 4,
  },
  navTextActive: {
    color: "#2563eb",
    fontWeight: "600",
  },
  resetButton: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  resetIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    backgroundColor: "#fff5f5",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  resetIcon: {
    fontSize: 20,
  },
  resetButtonText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#dc2626",
    marginTop: 4,
  },
});
