import database, { eventsCollection, outboxesCollection } from "@/db";
import Event, { EntityType, EventStatus, EventType } from "@/models/Event";
import { Q } from "@nozbe/watermelondb";
import { OutboxService } from "./OutboxService";

export class EventService {
  /**
   * Create a new event
   */
  static async createEvent(eventData: {
    entity: EntityType;
    entityId: string;
    type: EventType;
    payloadJson: string;
    deviceId: string;
    relayId: string;
    userId: string;
    venueId: string;
  }): Promise<Event> {
    return await database.write(async () => {
      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

      // Get the current max sequence and lamport clock
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc), Q.take(1))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      return await eventsCollection.create((event) => {
        event.sequence = maxSequence + 1;
        event.entity = eventData.entity;
        event.entityId = eventData.entityId;
        event.type = eventData.type;
        event.payloadJson = eventData.payloadJson;
        event.deviceId = eventData.deviceId;
        event.relayId = eventData.relayId;
        event.userId = eventData.userId;
        event.venueId = eventData.venueId;
        event.lamportClock = maxLamportClock + 1;
        event.status = "pending";
        event.outboxId = todaysOutbox.id;
      });
    });
  }

  /**
   * Get an event by ID
   */
  static async getEventById(eventId: string): Promise<Event> {
    return await eventsCollection.find(eventId);
  }

  /**
   * Get all events
   */
  static async getAllEvents(): Promise<Event[]> {
    return await eventsCollection.query(Q.sortBy("sequence", Q.desc)).fetch();
  }

  /**
   * Get events by entity and entity ID
   */
  static async getEventsByEntity(
    entity: EntityType,
    entityId: string
  ): Promise<Event[]> {
    return await eventsCollection
      .query(
        Q.where("entity", entity),
        Q.where("entity_id", entityId),
        Q.sortBy("sequence", Q.desc)
      )
      .fetch();
  }

  /**
   * Get events by status
   */
  static async getEventsByStatus(status: EventStatus): Promise<Event[]> {
    return await eventsCollection
      .query(Q.where("status", status), Q.sortBy("sequence", Q.desc))
      .fetch();
  }

  /**
   * Get events by type
   */
  static async getEventsByType(type: EventType): Promise<Event[]> {
    return await eventsCollection
      .query(Q.where("type", type), Q.sortBy("sequence", Q.desc))
      .fetch();
  }

  /**
   * Update event status
   */
  static async updateEventStatus(
    eventId: string,
    status: EventStatus,
    errorMessage?: string
  ): Promise<Event> {
    return await database.write(async () => {
      const event = await eventsCollection.find(eventId);
      await event.update((e) => {
        e.status = status;
        if (errorMessage) {
          e.errorMessage = errorMessage;
        }
        if (status === "acked") {
          e.ackedAt = Date.now();
        }
      });
      return event;
    });
  }

  /**
   * Mark event as applied
   */
  static async markEventAsApplied(eventId: string): Promise<Event> {
    return await database.write(async () => {
      const event = await eventsCollection.find(eventId);
      await event.update((e) => {
        e.appliedAt = Date.now();
      });
      return event;
    });
  }

  /**
   * Delete an event by ID
   */
  static async deleteEvent(eventId: string): Promise<void> {
    await database.write(async () => {
      const event = await eventsCollection.find(eventId);
      await event.destroyPermanently();
    });
  }

  /**
   * Parse event payload JSON
   */
  static parseEventPayload(event: Event): any {
    try {
      return JSON.parse(event.payloadJson);
    } catch {
      return null;
    }
  }

  /**
   * Get pending events (not yet acknowledged)
   */
  static async getPendingEvents(): Promise<Event[]> {
    return await eventsCollection
      .query(Q.where("status", "pending"), Q.sortBy("sequence", Q.asc))
      .fetch();
  }

  /**
   * Mark events as acked after relay confirmation
   * PURPOSE: Update client events status when relay confirms application
   * This is called when client receives "applied" message from relay
   */
  static async markEventsAsAcked(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      console.log("ℹ️ [EventService] No events to mark as acked");
      return;
    }

    try {
      console.log(
        `✅ [EventService] Marking ${eventIds.length} events as acked`
      );

      // Find all events that were confirmed
      const events = await eventsCollection
        .query(Q.where("id", Q.oneOf(eventIds)))
        .fetch();

      if (events.length === 0) {
        console.warn("⚠️ [EventService] No matching events found");
        return;
      }

      console.log(`📝 [EventService] Found ${events.length} events to update`);

      // Update each event to acked status
      await database.write(async () => {
        for (const event of events) {
          await event.update((e) => {
            e.status = "acked";
            e.ackedAt = Date.now();
          });
          console.log(`✅ Event ${event.id} marked as acked`);
        }
      });

      // After marking events as acked, check if their outboxes should be marked as synced
      await this.updateOutboxStatusesAfterAck(events);

      console.log("✅ [EventService] All events marked as acked");
    } catch (error) {
      console.error("Error marking events as acked:", error);
      throw error;
    }
  }

  /**
   * Update outbox statuses after events are acked
   * PURPOSE: If all events in an outbox are acked, mark the outbox as synced
   */
  private static async updateOutboxStatusesAfterAck(
    ackedEvents: Event[]
  ): Promise<void> {
    try {
      // Get unique outbox IDs from the acked events
      const outboxIds = new Set(
        ackedEvents
          .map((e) => e.outboxId)
          .filter((id): id is string => id !== null && id !== undefined)
      );

      if (outboxIds.size === 0) {
        console.log("ℹ️ [EventService] No outboxes to check");
        return;
      }

      console.log(
        `📦 [EventService] Checking ${outboxIds.size} outboxes for completion`
      );

      await database.write(async () => {
        for (const outboxId of outboxIds) {
          // Get all events in this outbox
          const outboxEvents = await eventsCollection
            .query(Q.where("outbox_id", outboxId))
            .fetch();

          // Check if ALL events are acked
          const allAcked = outboxEvents.every((e) => e.status === "acked");

          if (allAcked && outboxEvents.length > 0) {
            // Mark outbox as synced
            const outbox = await outboxesCollection.find(outboxId);
            await outbox.update((o) => {
              o.status = "synced";
              o.syncedAt = Date.now();
            });
            console.log(
              `✅ Outbox ${outboxId} marked as synced (${outboxEvents.length} events all acked)`
            );
          } else {
            console.log(
              `ℹ️ Outbox ${outboxId} still has pending events (${
                outboxEvents.filter((e) => e.status !== "acked").length
              }/${outboxEvents.length})`
            );
          }
        }
      });
    } catch (error) {
      console.error("Error updating outbox statuses:", error);
    }
  }
}
