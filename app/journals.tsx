import { eventsCollection, journalsCollection } from "@/db";
import Event from "@/models/Event";
import type { JournalSource, JournalStatus } from "@/models/Journal";
import Journal from "@/models/Journal";
import { Q } from "@nozbe/watermelondb";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTcpService } from "../hooks/useTcpService";

type JournalWithEvents = {
  journal: Journal;
  events: Event[];
};

interface GroupedJournals {
  date: string;
  journals: JournalWithEvents[];
}

// Animated Group Component
const AnimatedGroup = ({
  item,
  isExpanded,
  onToggle,
  renderJournalItem,
}: {
  item: GroupedJournals;
  isExpanded: boolean;
  onToggle: () => void;
  renderJournalItem: (props: { item: JournalWithEvents }) => JSX.Element;
}) => {
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const animatedRotation = useRef(new Animated.Value(0)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(animatedHeight, {
        toValue: isExpanded ? 1 : 0,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }),
      Animated.timing(animatedRotation, {
        toValue: isExpanded ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(animatedOpacity, {
        toValue: isExpanded ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isExpanded]);

  const rotateInterpolate = animatedRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <View style={styles.groupContainer}>
      <TouchableOpacity
        style={styles.dateHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.dateHeaderLeft}>
          <Text style={styles.dateHeaderText}>{item.date}</Text>
          <Text style={styles.dateHeaderCount}>
            {item.journals.length} journal
            {item.journals.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <Animated.View
          style={{
            transform: [{ rotate: rotateInterpolate }],
          }}
        >
          <Text style={styles.expandIcon}>▶</Text>
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.journalsContainer,
          {
            maxHeight: animatedHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 10000],
            }),
            opacity: animatedOpacity,
          },
        ]}
      >
        {item.journals.map((journal) => (
          <Animated.View
            key={journal.journal.id}
            style={{
              transform: [
                {
                  translateY: animatedHeight.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                  }),
                },
              ],
            }}
          >
            {renderJournalItem({ item: journal })}
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
};

export default function JournalsScreen() {
  const [journals, setJournals] = useState<JournalWithEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [sendingEventIds, setSendingEventIds] = useState<Set<string>>(
    new Set()
  );

  const { isConnected, role, sendMessage } = useTcpService();

  // Group journals by date
  const groupedJournals: GroupedJournals[] = React.useMemo(() => {
    const groups: { [key: string]: JournalWithEvents[] } = {};

    journals.forEach((journalWithEvents) => {
      const date = new Date(journalWithEvents.journal.date);
      const dateKey = date.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(journalWithEvents);
    });

    return Object.entries(groups).map(([date, journals]) => ({
      date,
      journals,
    }));
  }, [journals]);

  useEffect(() => {
    const loadJournals = async () => {
      try {
        // Fetch all journals sorted by date (descending)
        const journalsData = await journalsCollection
          .query(Q.sortBy("date", Q.desc))
          .fetch();

        // For each journal, fetch its related events
        const journalsWithEvents = await Promise.all(
          journalsData.map(async (journal) => {
            // Explicitly query events that belong to this journal
            const events = await eventsCollection
              .query(
                Q.where("journal_id", journal.id),
                Q.sortBy("sequence", Q.asc)
              )
              .fetch();

            return {
              journal: journal,
              events: events,
            };
          })
        );

        console.log("Journals loaded:", journalsWithEvents.length);
        console.log(
          "Events per journal:",
          journalsWithEvents.map((j) => ({
            date: j.journal.date,
            journalId: j.journal.id,
            eventCount: j.events.length,
            eventIds: j.events.map((e) => e.id),
          }))
        );

        setJournals(journalsWithEvents);
        setLoading(false);
        setRefreshing(false);
      } catch (error) {
        console.error("Error loading journals:", error);
        setLoading(false);
        setRefreshing(false);
      }
    };

    // Initial load
    loadJournals();

    // Subscribe to changes in both journals and events
    const journalSubscription = journalsCollection
      .query(Q.sortBy("date", Q.desc))
      .observe()
      .subscribe(() => {
        loadJournals();
      });

    const eventsSubscription = eventsCollection
      .query()
      .observe()
      .subscribe(() => {
        loadJournals();
      });

    return () => {
      journalSubscription.unsubscribe();
      eventsSubscription.unsubscribe();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);

    // Reload journals
    const journalsData = await journalsCollection
      .query(Q.sortBy("date", Q.desc))
      .fetch();

    const journalsWithEvents = await Promise.all(
      journalsData.map(async (journal) => {
        // Explicitly query events that belong to this journal
        const events = await eventsCollection
          .query(Q.where("journal_id", journal.id), Q.sortBy("sequence", Q.asc))
          .fetch();

        return {
          journal: journal,
          events: events,
        };
      })
    );

    setJournals(journalsWithEvents);
    setRefreshing(false);
  };

  const toggleDateExpansion = (date: string) => {
    setExpandedDates((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const handleBroadcastEvent = async (event: Event) => {
    if (!isConnected) {
      Alert.alert(
        "Not Connected",
        "Please connect to the relay server first via the TCP tab."
      );
      return;
    }

    if (role !== "server") {
      Alert.alert(
        "Invalid Role",
        "Only relay servers can broadcast events to clients. Current role: " +
          role
      );
      return;
    }

    if (event.status !== "acked") {
      Alert.alert(
        "Invalid Status",
        "Only acked events can be broadcast to clients."
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

      // Broadcast the acked event to all connected clients via TCP
      sendMessage({
        type: "broadcast",
        data: {
          eventId: event.id,
          sequence: event.sequence,
          entity: event.entity,
          entityId: event.entityId,
          eventType: event.type,
          payload: payload,
          lamportClock: event.lamportClock,
          status: event.status,
          journalId: event.journalId,
          createdAt: event.createdAt,
          ackedAt: event.ackedAt,
        },
      });

      console.log("📡 Event broadcast to all clients:", event.id);

      Alert.alert("Success", "Event broadcast to all clients successfully!");
    } catch (error) {
      console.error("Error broadcasting event:", error);
      Alert.alert(
        "Error",
        `Failed to broadcast event: ${(error as Error).message}`
      );
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

  const getStatusColor = (status: JournalStatus): string => {
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

  const getSourceColor = (source: JournalSource): string => {
    switch (source) {
      case "local":
        return "#2196F3";
      case "relay":
        return "#FF9800";
      case "cloud":
        return "#4CAF50";
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
    const isAcked = event.status === "acked";

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
            {isAcked && (
              <TouchableOpacity
                style={[
                  styles.broadcastButton,
                  isSending && styles.broadcastButtonDisabled,
                ]}
                onPress={() => handleBroadcastEvent(event)}
                disabled={isSending}
                activeOpacity={0.7}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.broadcastButtonText}>Broadcast</Text>
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
          {event.ackedAt && (
            <Text style={styles.eventDetailText}>
              Acked: {formatDate(event.ackedAt)}
            </Text>
          )}
          {payload && (
            <Text style={styles.eventPayload} numberOfLines={2}>
              Payload: {JSON.stringify(payload)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderJournalItem = ({ item }: { item: JournalWithEvents }) => {
    const { journal, events } = item;
    const ackedEvents = events.filter((e) => e.status === "acked");

    return (
      <View style={styles.journalCard}>
        <View style={styles.journalHeader}>
          <View style={styles.journalHeaderLeft}>
            <Text style={styles.journalDate}>
              {formatDateString(journal.date)}
            </Text>
            <Text style={styles.journalId}>ID: {journal.id.slice(-8)}</Text>
          </View>
          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(journal.status) },
              ]}
            >
              <Text style={styles.statusText}>
                {journal.status.toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.sourceBadge,
                { backgroundColor: getSourceColor(journal.source) },
              ]}
            >
              <Text style={styles.sourceText}>
                {journal.source.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.journalDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={styles.detailValue}>{journal.status}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Source:</Text>
            <Text style={styles.detailValue}>{journal.source}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sequence:</Text>
            <Text style={styles.detailValue}>{journal.sequence}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Device Id:</Text>
            <Text style={styles.detailValue}>{journal.deviceId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Venue Id:</Text>
            <Text style={styles.detailValue}>{journal.venueId}</Text>
          </View>
          {journal.syncedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Synced At:</Text>
              <Text style={styles.detailValue}>
                {formatDate(journal.syncedAt)}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created At:</Text>
            <Text style={styles.detailValue}>
              {formatDate(journal.createdAt)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Updated At:</Text>
            <Text style={styles.detailValue}>
              {formatDate(journal.updatedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.eventsSection}>
          <View style={styles.eventsHeader}>
            <Text style={styles.eventsTitle}>
              Events ({events.length})
              {ackedEvents.length > 0 && (
                <Text style={styles.ackedCount}>
                  {" "}
                  • {ackedEvents.length} acked
                </Text>
              )}
            </Text>
          </View>
          {events.length === 0 ? (
            <View style={styles.noEventsContainer}>
              <Text style={styles.noEventsText}>No events in this journal</Text>
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

  const renderGroup = ({ item }: { item: GroupedJournals }) => {
    const isExpanded = expandedDates.has(item.date);

    return (
      <AnimatedGroup
        item={item}
        isExpanded={isExpanded}
        onToggle={() => toggleDateExpansion(item.date)}
        renderJournalItem={renderJournalItem}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading journals...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Journals</Text>
            <Text style={styles.headerSubtitle}>
              {journals.length} journal{journals.length !== 1 ? "s" : ""} found
            </Text>
            {!isConnected && role === "none" && (
              <Text style={styles.connectionWarning}>
                ⚠️ Not connected to relay
              </Text>
            )}
          </View>
        </View>
      </View>
      {journals.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No journal found</Text>
          <Text style={styles.emptySubtext}>
            Journal items will appear here when they are created
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupedJournals}
          renderItem={renderGroup}
          keyExtractor={(item) => item.date}
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
  groupContainer: {
    marginBottom: 8,
    overflow: "hidden",
  },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  dateHeaderLeft: {
    flex: 1,
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 2,
  },
  dateHeaderCount: {
    fontSize: 13,
    color: "#757575",
    fontWeight: "500",
  },
  expandIcon: {
    fontSize: 14,
    color: "#2196F3",
    marginLeft: 12,
    fontWeight: "bold",
  },
  journalsContainer: {
    marginTop: 4,
    overflow: "hidden",
  },
  journalCard: {
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
  journalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  journalHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  journalDate: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#212121",
    marginBottom: 4,
  },
  journalId: {
    fontSize: 12,
    color: "#757575",
    marginTop: 2,
  },
  badgeContainer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
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
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  sourceText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  journalDetails: {
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
  ackedCount: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4CAF50",
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
  broadcastButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastButtonDisabled: {
    backgroundColor: "#A5D6A7",
  },
  broadcastButtonText: {
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
