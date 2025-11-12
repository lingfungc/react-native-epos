import { eventsCollection, journalsCollection } from "@/db";
import Event from "@/models/Event";
import type { JournalSource, JournalStatus } from "@/models/Journal";
import Journal from "@/models/Journal";
import { Q } from "@nozbe/watermelondb";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type JournalWithEvents = {
  journal: Journal;
  events: Event[];
};

export default function JournalsScreen() {
  const [journals, setJournals] = useState<JournalWithEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

    return (
      <View key={event.id} style={styles.eventItem}>
        <View style={styles.eventHeader}>
          <Text style={styles.eventType}>{event.type}</Text>
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

  const renderJournalItem = ({ item }: { item: JournalWithEvents }) => {
    const { journal, events } = item;

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
            <Text style={styles.eventsTitle}>Events ({events.length})</Text>
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
          data={journals}
          renderItem={renderJournalItem}
          keyExtractor={(item) => item.journal.id}
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
    marginLeft: 8,
  },
  eventStatusText: {
    color: "#FFFFFF",
    fontSize: 10,
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
