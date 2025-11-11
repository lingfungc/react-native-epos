import database, {
  eventsCollection,
  ordersCollection,
  outboxesCollection,
} from "@/db";

export class DatabaseService {
  /**
   * Reset the database by deleting all records from all tables
   * This will remove all orders, events, and outboxes
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
    });
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    ordersCount: number;
    eventsCount: number;
    outboxesCount: number;
  }> {
    const orders = await ordersCollection.query().fetch();
    const events = await eventsCollection.query().fetch();
    const outboxes = await outboxesCollection.query().fetch();

    return {
      ordersCount: orders.length,
      eventsCount: events.length,
      outboxesCount: outboxes.length,
    };
  }
}
