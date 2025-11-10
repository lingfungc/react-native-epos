import database, { eventsCollection } from "@/db";
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
        .query(Q.sortBy("sequence", Q.desc))
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
}
