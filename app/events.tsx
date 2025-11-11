import { eventsCollection } from "@/db";
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
    const subscription = eventsCollection
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
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Events</Text>
            <Text style={styles.headerSubtitle}>
              {events.length} event{events.length !== 1 ? "s" : ""} found
            </Text>
          </View>
          {/* <TouchableOpacity
            style={styles.createButton}
            onPress={createEvent}
            activeOpacity={0.7}
          >
            <Text style={styles.createButtonText}>+ Create</Text>
          </TouchableOpacity> */}
        </View>
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
    padding: 20,
  },
  header: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#E3F2FD",
    opacity: 0.9,
  },
  createButton: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  createButtonText: {
    color: "#2196F3",
    fontSize: 15,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#757575",
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9E9E9E",
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    padding: 12,
    paddingBottom: 20,
  },
  eventCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  eventHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  eventType: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 4,
  },
  eventEntity: {
    fontSize: 12,
    color: "#757575",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  eventDetails: {
    gap: 10,
    width: "100%",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#757575",
    marginRight: 8,
    minWidth: 110,
  },
  detailValue: {
    fontSize: 13,
    color: "#212121",
    flex: 1,
    lineHeight: 18,
    flexShrink: 1,
  },
  errorLabel: {
    color: "#F44336",
  },
  errorValue: {
    color: "#F44336",
    fontWeight: "500",
  },
  payloadContainer: {
    marginTop: 6,
    padding: 10,
    backgroundColor: "#F9F9F9",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    width: "100%",
  },
  payloadLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#757575",
    marginBottom: 6,
  },
  payloadValue: {
    fontSize: 11,
    color: "#424242",
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
