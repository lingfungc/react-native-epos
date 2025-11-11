import database, {
  eventsCollection,
  journalsCollection,
  ordersCollection,
  outboxesCollection,
} from "@/db";

export class DatabaseService {
  /**
   * Reset the database by deleting all records from all tables
   * This will remove all orders, events, outboxes, and journals
   */
  static async resetDatabase(): Promise<void> {
    await database.write(async () => {
      // Delete all events
      const allEvents = await eventsCollection.query().fetch();
      await Promise.all(
        allEvents.map((event) => event.destroyPermanently())
      );

      // Delete all orders
      const allOrders = await ordersCollection.query().fetch();
      await Promise.all(
        allOrders.map((order) => order.destroyPermanently())
      );

      // Delete all outboxes
      const allOutboxes = await outboxesCollection.query().fetch();
      await Promise.all(
        allOutboxes.map((outbox) => outbox.destroyPermanently())
      );

      // Delete all journals
      const allJournals = await journalsCollection.query().fetch();
      await Promise.all(
        allJournals.map((journal) => journal.destroyPermanently())
      );
    });
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    ordersCount: number;
    eventsCount: number;
    outboxesCount: number;
    journalsCount: number;
  }> {
    const orders = await ordersCollection.query().fetch();
    const events = await eventsCollection.query().fetch();
    const outboxes = await outboxesCollection.query().fetch();
    const journals = await journalsCollection.query().fetch();

    return {
      ordersCount: orders.length,
      eventsCount: events.length,
      outboxesCount: outboxes.length,
      journalsCount: journals.length,
    };
  }
}
