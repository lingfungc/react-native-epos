import database from "@/db";
import type { EventStatus } from "@/models/Event";
import Event from "@/models/Event";
import { Q } from "@nozbe/watermelondb";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const subscription = database
      .get<Event>("events")
      .query(Q.sortBy("created_at", Q.desc))
      .observe()
      .subscribe((eventsData) => {
        console.log("Events: ", eventsData);
        setEvents(eventsData);
        setLoading(false);
        setRefreshing(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // The observe subscription will automatically update when data changes
    // Just wait a moment for the refresh to complete
    setTimeout(() => setRefreshing(false), 500);
  };

  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: EventStatus): string => {
    switch (status) {
      case "acked":
        return "#4CAF50";
      case "pending":
        return "#FF9800";
      case "rejected":
        return "#F44336";
      default:
        return "#757575";
    }
  };

  const renderEventItem = ({ item }: { item: Event }) => {
    let payload: any = null;
    try {
      payload = JSON.parse(item.payloadJson);
    } catch (e) {
      // Invalid JSON, ignore
    }

    return (
      <View style={styles.eventCard}>
        <View style={styles.eventHeader}>
          <View style={styles.eventHeaderLeft}>
            <Text style={styles.eventType}>{item.type}</Text>
            <Text style={styles.eventEntity}>
              {item.entity} ({item.entityId})
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) },
            ]}
          >
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.eventDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sequence:</Text>
            <Text style={styles.detailValue}>{item.sequence}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Lamport Clock:</Text>
            <Text style={styles.detailValue}>{item.lamportClock}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device ID:</Text>
            <Text style={styles.detailValue}>{item.deviceId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>User ID:</Text>
            <Text style={styles.detailValue}>{item.userId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Venue ID:</Text>
            <Text style={styles.detailValue}>{item.venueId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created At:</Text>
            <Text style={styles.detailValue}>{formatDate(item.createdAt)}</Text>
          </View>
          {item.appliedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Applied At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(item.appliedAt)}
              </Text>
            </View>
          )}
          {item.ackedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Acked At:</Text>
              <Text style={styles.detailValue}>{formatDate(item.ackedAt)}</Text>
            </View>
          )}
          {item.errorMessage && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, styles.errorLabel]}>
                Error:
              </Text>
              <Text style={[styles.detailValue, styles.errorValue]}>
                {item.errorMessage}
              </Text>
            </View>
          )}
          {payload && (
            <View style={styles.payloadContainer}>
              <Text style={styles.payloadLabel}>Payload:</Text>
              <Text style={styles.payloadValue}>
                {JSON.stringify(payload, null, 2)}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
        <Text style={styles.headerSubtitle}>
          {events.length} event{events.length !== 1 ? "s" : ""} found
        </Text>
      </View>
      {events.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No events found</Text>
          <Text style={styles.emptySubtext}>
            Events will appear here when they are created
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  header: {
    backgroundColor: "#2196F3",
    padding: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#E3F2FD",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#757575",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9E9E9E",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 16,
  },
  eventCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  eventHeaderLeft: {
    flex: 1,
  },
  eventType: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 4,
  },
  eventEntity: {
    fontSize: 14,
    color: "#757575",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  eventDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#757575",
    marginRight: 8,
    minWidth: 100,
  },
  detailValue: {
    fontSize: 14,
    color: "#212121",
    flex: 1,
  },
  errorLabel: {
    color: "#F44336",
  },
  errorValue: {
    color: "#F44336",
  },
  payloadContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 4,
  },
  payloadLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 8,
  },
  payloadValue: {
    fontSize: 12,
    color: "#424242",
    fontFamily: "monospace",
  },
});
