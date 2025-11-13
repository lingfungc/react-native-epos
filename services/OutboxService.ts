import database, { eventsCollection, outboxesCollection } from "@/db";
import Event from "@/models/Event";
import Outbox, { OutboxStatus } from "@/models/Outbox";
import { Q } from "@nozbe/watermelondb";
import { DeviceService } from "./DeviceService";

export class OutboxService {
  /**
   * Get today's date in YYYY-MM-DD format
   */
  private static getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  /**
   * Get or create today's outbox
   * This ensures there's always an outbox for the current day
   */
  static async getOrCreateTodaysOutbox(): Promise<Outbox> {
    const todayDate = this.getTodayDate();

    // Try to find existing outbox for today
    const existingOutbox = await outboxesCollection
      .query(Q.where("date", todayDate))
      .fetch();

    if (existingOutbox.length > 0) {
      return existingOutbox[0];
    }

    // Create new outbox for today
    return await database.write(async () => {
      return await outboxesCollection.create((outbox) => {
        outbox.date = todayDate;
        outbox.status = "pending";
        outbox.sequence = 0; // Will be updated as events are added
        outbox.deviceId = DeviceService.getDeviceId();
        outbox.venueId = DeviceService.getVenueId();
      });
    });
  }

  /**
   * Get outbox by date
   */
  static async getOutboxByDate(date: string): Promise<Outbox | null> {
    const outboxes = await outboxesCollection
      .query(Q.where("date", date))
      .fetch();

    return outboxes.length > 0 ? outboxes[0] : null;
  }

  /**
   * Get all outboxes
   */
  static async getAllOutboxes(): Promise<Outbox[]> {
    return await outboxesCollection.query(Q.sortBy("date", Q.desc)).fetch();
  }

  /**
   * Get pending outboxes (not yet synced)
   */
  static async getPendingOutboxes(): Promise<Outbox[]> {
    return await outboxesCollection
      .query(Q.where("status", "pending"), Q.sortBy("date", Q.asc))
      .fetch();
  }

  /**
   * NEW: Get syncing outboxes (in progress)
   * PURPOSE: Track outboxes currently being synced
   */
  static async getSyncingOutboxes(): Promise<Outbox[]> {
    return await outboxesCollection
      .query(Q.where("status", "syncing"), Q.sortBy("date", Q.asc))
      .fetch();
  }

  /**
   * Get events for a specific outbox
   */
  static async getOutboxEvents(outboxId: string): Promise<Event[]> {
    return await eventsCollection
      .query(Q.where("outbox_id", outboxId), Q.sortBy("sequence", Q.asc))
      .fetch();
  }

  /**
   * Get events for today's outbox
   */
  static async getTodaysEvents(): Promise<Event[]> {
    const todaysOutbox = await this.getOrCreateTodaysOutbox();
    return await this.getOutboxEvents(todaysOutbox.id);
  }

  /**
   * Get count of events in an outbox
   */
  static async getOutboxEventCount(outboxId: string): Promise<number> {
    const events = await this.getOutboxEvents(outboxId);
    return events.length;
  }

  /**
   * Update outbox status
   */
  static async updateOutboxStatus(
    outboxId: string,
    status: OutboxStatus
  ): Promise<Outbox> {
    return await database.write(async () => {
      const outbox = await outboxesCollection.find(outboxId);
      await outbox.update((o) => {
        o.status = status;
        if (status === "synced") {
          o.syncedAt = Date.now();
        }
      });
      return outbox;
    });
  }

  /**
   * Update outbox sequence number
   */
  static async updateOutboxSequence(
    outboxId: string,
    sequence: number
  ): Promise<Outbox> {
    return await database.write(async () => {
      const outbox = await outboxesCollection.find(outboxId);
      await outbox.update((o) => {
        o.sequence = sequence;
      });
      return outbox;
    });
  }

  /**
   * Mark outbox as syncing
   */
  static async markOutboxAsSyncing(outboxId: string): Promise<Outbox> {
    return await this.updateOutboxStatus(outboxId, "syncing");
  }

  /**
   * Mark outbox as synced
   */
  static async markOutboxAsSynced(outboxId: string): Promise<Outbox> {
    return await this.updateOutboxStatus(outboxId, "synced");
  }

  /**
   * NEW: Mark outbox as syncing by wrapping the existing method
   * PURPOSE: Convenience method with logging for sync workflow
   */
  static async markAsSyncing(outboxId: string): Promise<void> {
    try {
      await this.markOutboxAsSyncing(outboxId);
      console.log(`📤 [OutboxService] Outbox ${outboxId} marked as syncing`);
    } catch (error) {
      console.error("Error marking outbox as syncing:", error);
      throw error;
    }
  }

  /**
   * NEW: Confirm events were applied on relay
   * PURPOSE: Core sync protocol - mark outbox as synced after relay confirms
   * Mark outbox as synced and set syncedAt timestamp
   */
  static async confirmApplied(appliedEventIds: string[]): Promise<void> {
    if (appliedEventIds.length === 0) {
      console.log("ℹ️ [OutboxService] No events to confirm");
      return;
    }

    try {
      console.log(
        `✅ [OutboxService] Confirming ${appliedEventIds.length} applied events`
      );

      // Find all events that were applied
      const appliedEvents = await eventsCollection
        .query(Q.where("id", Q.oneOf(appliedEventIds)))
        .fetch();

      if (appliedEvents.length === 0) {
        console.warn("⚠️ [OutboxService] No matching events found");
        return;
      }

      // Get unique outbox IDs from these events
      const outboxIds = new Set(
        appliedEvents
          .map((e) => e.outboxId)
          .filter((id): id is string => id !== null && id !== undefined)
      );

      console.log(
        `📦 [OutboxService] Marking ${outboxIds.size} outboxes as synced`
      );

      // Mark each outbox as synced
      await database.write(async () => {
        for (const outboxId of outboxIds) {
          try {
            const outbox = await outboxesCollection.find(outboxId);
            await outbox.update((o) => {
              o.status = "synced";
              o.syncedAt = Date.now();
            });
            console.log(`✅ Outbox ${outboxId} marked as synced`);
          } catch (error) {
            console.error(`Error updating outbox ${outboxId}:`, error);
          }
        }
      });

      console.log("✅ [OutboxService] All outboxes confirmed");
    } catch (error) {
      console.error("Error confirming applied events:", error);
      throw error;
    }
  }

  /**
   * NEW: Clear synced outboxes (safe cleanup after confirmation)
   * PURPOSE: Remove confirmed synced data to keep database clean
   * Only clears outboxes that have been confirmed synced by relay
   */
  static async clearSyncedOutboxes(): Promise<number> {
    try {
      const syncedOutboxes = await outboxesCollection
        .query(Q.where("status", "synced"))
        .fetch();

      if (syncedOutboxes.length === 0) {
        console.log("ℹ️ [OutboxService] No synced outboxes to clear");
        return 0;
      }

      // Get all events from these outboxes
      const outboxIds = syncedOutboxes.map((o) => o.id);
      const events = await eventsCollection
        .query(Q.where("outbox_id", Q.oneOf(outboxIds)))
        .fetch();

      console.log(
        `🗑️ [OutboxService] Clearing ${syncedOutboxes.length} synced outboxes with ${events.length} events`
      );

      await database.write(async () => {
        // Delete events first (foreign key constraint)
        for (const event of events) {
          await event.markAsDeleted();
        }

        // Then delete outboxes
        for (const outbox of syncedOutboxes) {
          await outbox.markAsDeleted();
        }
      });

      console.log("✅ [OutboxService] Cleared synced outboxes");
      return syncedOutboxes.length;
    } catch (error) {
      console.error("Error clearing synced outboxes:", error);
      throw error;
    }
  }

  /**
   * Get old outboxes (for cleanup)
   */
  static async getOldOutboxes(daysOld: number = 7): Promise<Outbox[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

    return await outboxesCollection
      .query(
        Q.where("date", Q.lt(cutoffDateStr)),
        Q.where("status", "synced"),
        Q.sortBy("date", Q.asc)
      )
      .fetch();
  }

  /**
   * Clean up old synced outboxes and their events
   */
  static async cleanupOldOutboxes(daysOld: number = 7): Promise<number> {
    const oldOutboxes = await this.getOldOutboxes(daysOld);

    if (oldOutboxes.length === 0) {
      return 0;
    }

    await database.write(async () => {
      for (const outbox of oldOutboxes) {
        // Delete all events in this outbox
        const events = await this.getOutboxEvents(outbox.id);
        await Promise.all(events.map((event) => event.destroyPermanently()));

        // Delete the outbox itself
        await outbox.destroyPermanently();
      }
    });

    return oldOutboxes.length;
  }

  /**
   * Get summary of all outboxes
   */
  static async getOutboxSummary(): Promise<{
    total: number;
    pending: number;
    syncing: number;
    synced: number;
  }> {
    const allOutboxes = await this.getAllOutboxes();

    return {
      total: allOutboxes.length,
      pending: allOutboxes.filter((o) => o.status === "pending").length,
      syncing: allOutboxes.filter((o) => o.status === "syncing").length,
      synced: allOutboxes.filter((o) => o.status === "synced").length,
    };
  }
}
