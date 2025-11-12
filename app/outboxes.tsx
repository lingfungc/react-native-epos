import { eventsCollection, outboxesCollection } from "@/db";
import Event from "@/models/Event";
import type { OutboxStatus } from "@/models/Outbox";
import Outbox from "@/models/Outbox";
import { Q } from "@nozbe/watermelondb";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTcpService } from "../hooks/useTcpService";

type OutboxWithEvents = {
  outbox: Outbox;
  events: Event[];
};

export default function OutboxScreen() {
  const [outboxes, setOutboxes] = useState<OutboxWithEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingEventIds, setSendingEventIds] = useState<Set<string>>(
    new Set()
  );

  const { isConnected, role, sendMessage } = useTcpService();

  useEffect(() => {
    const loadOutboxes = async () => {
      try {
        // Fetch all outboxes sorted by date (descending)
        const outboxesData = await outboxesCollection
          .query(Q.sortBy("date", Q.desc))
          .fetch();

        // For each outbox, fetch its related events
        const outboxesWithEvents = await Promise.all(
          outboxesData.map(async (outbox) => {
            // Explicitly query events that belong to this outbox
            const events = await eventsCollection
              .query(
                Q.where("outbox_id", outbox.id),
                Q.sortBy("sequence", Q.asc)
              )
              .fetch();

            return {
              outbox: outbox,
              events: events,
            };
          })
        );

        console.log("Outboxes loaded:", outboxesWithEvents.length);
        console.log(
          "Events per outbox:",
          outboxesWithEvents.map((o) => ({
            date: o.outbox.date,
            outboxId: o.outbox.id,
            eventCount: o.events.length,
            eventIds: o.events.map((e) => e.id),
          }))
        );

        setOutboxes(outboxesWithEvents);
        setLoading(false);
        setRefreshing(false);
      } catch (error) {
        console.error("Error loading outboxes:", error);
        setLoading(false);
        setRefreshing(false);
      }
    };

    // Initial load
    loadOutboxes();

    // Subscribe to changes in both outboxes and events
    const outboxSubscription = outboxesCollection
      .query(Q.sortBy("date", Q.desc))
      .observe()
      .subscribe(() => {
        loadOutboxes();
      });

    const eventsSubscription = eventsCollection
      .query()
      .observe()
      .subscribe(() => {
        loadOutboxes();
      });

    return () => {
      outboxSubscription.unsubscribe();
      eventsSubscription.unsubscribe();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);

    // Reload outboxes
    const outboxesData = await outboxesCollection
      .query(Q.sortBy("date", Q.desc))
      .fetch();

    const outboxesWithEvents = await Promise.all(
      outboxesData.map(async (outbox) => {
        // Explicitly query events that belong to this outbox
        const events = await eventsCollection
          .query(Q.where("outbox_id", outbox.id), Q.sortBy("sequence", Q.asc))
          .fetch();

        return {
          outbox: outbox,
          events: events,
        };
      })
    );

    setOutboxes(outboxesWithEvents);
    setRefreshing(false);
  };

  const handleSendEvent = async (event: Event) => {
    if (!isConnected) {
      Alert.alert(
        "Not Connected",
        "Please connect to the relay server first via the TCP tab."
      );
      return;
    }

    if (role !== "client") {
      Alert.alert(
        "Invalid Role",
        "Only clients can send events to the relay. Current role: " + role
      );
      return;
    }

    try {
      setSendingEventIds((prev) => new Set(prev).add(event.id));

      // Parse the payload
      let payload: any = null;
      try {
        payload = JSON.parse(event.payloadJson);
      } catch (e) {
        console.error("Failed to parse event payload:", e);
      }

      // Send the event via TCP
      sendMessage({
        type: "sync",
        data: {
          eventId: event.id,
          sequence: event.sequence,
          entity: event.entity,
          entityId: event.entityId,
          eventType: event.type,
          payload: payload,
          lamportClock: event.lamportClock,
          status: event.status,
          outboxId: event.outboxId,
          createdAt: event.createdAt,
        },
      });

      console.log("📤 Event sent to relay:", event.id);

      Alert.alert("Success", "Event sent to relay successfully!");
    } catch (error) {
      console.error("Error sending event:", error);
      Alert.alert("Error", `Failed to send event: ${(error as Error).message}`);
    } finally {
      setSendingEventIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(event.id);
        return newSet;
      });
    }
  };

  const formatDate = (timestamp: number | undefined): string => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const formatDateString = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return dateString;
    }
  };

  const getStatusColor = (status: OutboxStatus): string => {
    switch (status) {
      case "synced":
        return "#4CAF50";
      case "syncing":
        return "#FF9800";
      case "pending":
        return "#2196F3";
      default:
        return "#757575";
    }
  };

  const renderEventItem = (event: Event, index: number) => {
    let payload: any = null;
    try {
      payload = JSON.parse(event.payloadJson);
    } catch (e) {
      // Invalid JSON, ignore
    }

    const isSending = sendingEventIds.has(event.id);
    const isPending = event.status === "pending";

    return (
      <View key={event.id} style={styles.eventItem}>
        <View style={styles.eventHeader}>
          <Text style={styles.eventType}>{event.type}</Text>
          <View style={styles.eventHeaderRight}>
            <View
              style={[
                styles.eventStatusBadge,
                {
                  backgroundColor:
                    event.status === "acked"
                      ? "#4CAF50"
                      : event.status === "rejected"
                      ? "#F44336"
                      : "#FF9800",
                },
              ]}
            >
              <Text style={styles.eventStatusText}>
                {event.status.toUpperCase()}
              </Text>
            </View>
            {isPending && (
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isSending && styles.sendButtonDisabled,
                ]}
                onPress={() => handleSendEvent(event)}
                disabled={isSending}
                activeOpacity={0.7}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.eventDetails}>
          <Text style={styles.eventDetailText}>
            Entity: {event.entity} ({event.entityId.slice(-8)})
          </Text>
          <Text style={styles.eventDetailText}>
            Sequence: {event.sequence} | Lamport: {event.lamportClock}
          </Text>
          <Text style={styles.eventDetailText}>
            Created: {formatDate(event.createdAt)}
          </Text>
          {payload && (
            <Text style={styles.eventPayload} numberOfLines={2}>
              Payload: {JSON.stringify(payload)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderOutboxItem = ({ item }: { item: OutboxWithEvents }) => {
    const { outbox, events } = item;
    const pendingEvents = events.filter((e) => e.status === "pending");

    return (
      <View style={styles.outboxCard}>
        <View style={styles.outboxHeader}>
          <View style={styles.outboxHeaderLeft}>
            <Text style={styles.outboxDate}>
              {formatDateString(outbox.date)}
            </Text>
            <Text style={styles.outboxId}>ID: {outbox.id.slice(-8)}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(outbox.status) },
            ]}
          >
            <Text style={styles.statusText}>{outbox.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.outboxDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={styles.detailValue}>{outbox.status}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device Id:</Text>
            <Text style={styles.detailValue}>{outbox.deviceId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Venue Id:</Text>
            <Text style={styles.detailValue}>{outbox.venueId}</Text>
          </View>
          {outbox.syncedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Synced At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(outbox.syncedAt)}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created At:</Text>
            <Text style={styles.detailValue}>
              {formatDate(outbox.createdAt)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Updated At:</Text>
            <Text style={styles.detailValue}>
              {formatDate(outbox.updatedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.eventsSection}>
          <View style={styles.eventsHeader}>
            <Text style={styles.eventsTitle}>
              Events ({events.length})
              {pendingEvents.length > 0 && (
                <Text style={styles.pendingCount}>
                  {" "}
                  • {pendingEvents.length} pending
                </Text>
              )}
            </Text>
          </View>
          {events.length === 0 ? (
            <View style={styles.noEventsContainer}>
              <Text style={styles.noEventsText}>No events in this outbox</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.eventsList}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={false}
            >
              {events.map((event, index) => renderEventItem(event, index))}
            </ScrollView>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading outbox...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Outbox</Text>
            <Text style={styles.headerSubtitle}>
              {outboxes.length} outbox{outboxes.length !== 1 ? "es" : ""} found
            </Text>
            {!isConnected && role === "none" && (
              <Text style={styles.connectionWarning}>
                ⚠️ Not connected to relay
              </Text>
            )}
          </View>
        </View>
      </View>
      {outboxes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No outbox found</Text>
          <Text style={styles.emptySubtext}>
            Outbox items will appear here when they are created
          </Text>
        </View>
      ) : (
        <FlatList
          data={outboxes}
          renderItem={renderOutboxItem}
          keyExtractor={(item) => item.outbox.id}
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
  connectionWarning: {
    fontSize: 12,
    color: "#FFF59D",
    marginTop: 4,
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
  outboxCard: {
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
  outboxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  outboxHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  outboxDate: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 4,
  },
  outboxId: {
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
  outboxDetails: {
    gap: 8,
    marginBottom: 12,
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
    minWidth: 100,
  },
  detailValue: {
    fontSize: 13,
    color: "#212121",
    flex: 1,
    lineHeight: 18,
    flexShrink: 1,
  },
  eventsSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  eventsHeader: {
    marginBottom: 12,
  },
  eventsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#212121",
  },
  pendingCount: {
    fontSize: 12,
    fontWeight: "500",
    color: "#FF9800",
  },
  eventsList: {
    maxHeight: 400,
  },
  eventItem: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventType: {
    fontSize: 13,
    fontWeight: "600",
    color: "#212121",
    flex: 1,
  },
  eventStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eventStatusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  sendButton: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#BBDEFB",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  eventDetails: {
    gap: 4,
  },
  eventDetailText: {
    fontSize: 12,
    color: "#757575",
    lineHeight: 16,
  },
  eventPayload: {
    fontSize: 11,
    color: "#424242",
    fontFamily: "monospace",
    marginTop: 4,
    padding: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
  },
  noEventsContainer: {
    padding: 16,
    alignItems: "center",
  },
  noEventsText: {
    fontSize: 13,
    color: "#9E9E9E",
    fontStyle: "italic",
  },
});
