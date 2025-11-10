import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import EventsScreen from "./events";
import OrdersScreen from "./orders";

type Tab = "orders" | "events";

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");

  return (
    <View style={styles.container}>
      {/* Content */}
      <View style={styles.content}>
        {activeTab === "orders" ? <OrdersScreen /> : <EventsScreen />}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    backgroundColor: "#ffffff",
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
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
