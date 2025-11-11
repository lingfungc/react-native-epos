import { OutboxService } from "@/services/OutboxService";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import EventsScreen from "./events";
import OrdersScreen from "./orders";
import OutboxScreen from "./outboxes";

type Tab = "orders" | "events" | "outbox";

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize today's outbox when app opens
    const initializeOutbox = async () => {
      try {
        const outbox = await OutboxService.getOrCreateTodaysOutbox();
        console.log("✅ Today's outbox initialized:", outbox.date);
        setIsInitialized(true);
      } catch (error) {
        console.error("❌ Failed to initialize outbox:", error);
        setIsInitialized(true); // Still allow app to load
      }
    };

    initializeOutbox();
  }, []);

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
      {/* Content */}
      <View style={styles.content}>
        {activeTab === "orders" && <OrdersScreen />}
        {activeTab === "events" && <EventsScreen />}
        {activeTab === "outbox" && <OutboxScreen />}
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
});
