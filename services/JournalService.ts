// services/JournalService.ts
import database, { journalsCollection } from "@/db";
import Journal from "@/models/Journal";
import { Q } from "@nozbe/watermelondb";
import { DeviceService } from "./DeviceService";

export class JournalService {
  /**
   * Get or create today's journal
   */
  static async getOrCreateTodaysJournal(): Promise<Journal> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    return await database.write(async () => {
      // Try to find existing journal for today
      const existingJournals = await journalsCollection
        .query(Q.where("date", today))
        .fetch();

      if (existingJournals.length > 0) {
        return existingJournals[0];
      }

      // Create new journal for today
      const journal = await journalsCollection.create((j) => {
        j.date = today;
        j.status = "pending";
        j.sequence = 0; // Will be updated as events are added
        j.source = "local"; // Default to local, update as needed
        j.deviceId = DeviceService.getDeviceId();
        j.venueId = DeviceService.getVenueId();
      });

      return journal;
    });
  }

  /**
   * Get journal by date
   */
  static async getJournalByDate(date: string): Promise<Journal | null> {
    const journals = await journalsCollection
      .query(Q.where("date", date))
      .fetch();

    return journals.length > 0 ? journals[0] : null;
  }

  /**
   * Get all journals
   */
  static async getAllJournals(): Promise<Journal[]> {
    return await journalsCollection.query(Q.sortBy("date", Q.desc)).fetch();
  }

  /**
   * Mark journal as synced
   */
  static async markJournalAsSynced(journalId: string): Promise<Journal> {
    return await database.write(async () => {
      const journal = await journalsCollection.find(journalId);
      await journal.update((j) => {
        j.status = "synced";
        j.syncedAt = Date.now();
      });
      return journal;
    });
  }

  /**
   * Update journal sequence number
   */
  static async updateJournalSequence(
    journalId: string,
    sequence: number
  ): Promise<Journal> {
    return await database.write(async () => {
      const journal = await journalsCollection.find(journalId);
      await journal.update((j) => {
        j.sequence = sequence;
      });
      return journal;
    });
  }

  /**
   * Get events in a journal
   */
  static async getJournalEvents(journalId: string) {
    const journal = await journalsCollection.find(journalId);
    return await journal.events.fetch();
  }

  /**
   * Get pending journals
   */
  static async getPendingJournals(): Promise<Journal[]> {
    return await journalsCollection.query(Q.where("status", "pending")).fetch();
  }
}
