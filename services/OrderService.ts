// services/OrderService.ts
import { generateRandomOrder } from "@/constants/orders";
import database, {
  eventsCollection,
  journalsCollection,
  ordersCollection,
  outboxesCollection,
} from "@/db";
import Order from "@/models/Order";
import { Q } from "@nozbe/watermelondb";
import { DeviceService } from "./DeviceService";
import { isRelay } from "./TcpService";

export class OrderService {
  /**
   * Helper: Get or create today's outbox (without database.write wrapper)
   * This is used WITHIN database.write() calls
   */
  private static async getOrCreateTodaysOutboxInternal() {
    const today = new Date().toISOString().split("T")[0];

    const existingOutbox = await outboxesCollection
      .query(Q.where("date", today))
      .fetch();

    if (existingOutbox.length > 0) {
      return existingOutbox[0];
    }

    // Create new outbox - we're already in a write transaction
    return await outboxesCollection.create((outbox) => {
      outbox.date = today;
      outbox.status = "pending";
      outbox.deviceId = DeviceService.getDeviceId();
      outbox.venueId = DeviceService.getVenueId();
    });
  }

  /**
   * Helper: Get or create today's journal (without database.write wrapper)
   * This is used WITHIN database.write() calls
   */
  private static async getOrCreateTodaysJournalInternal() {
    const today = new Date().toISOString().split("T")[0];

    const existingJournals = await journalsCollection
      .query(Q.where("date", today))
      .fetch();

    if (existingJournals.length > 0) {
      return existingJournals[0];
    }

    // Create new journal - we're already in a write transaction
    return await journalsCollection.create((j) => {
      j.date = today;
      j.status = "pending";
      j.sequence = 0;
      j.source = "local";
      j.deviceId = DeviceService.getDeviceId();
      j.venueId = DeviceService.getVenueId();
    });
  }

  /**
   * Create a new order with random data
   */
  static async createRandomOrder(): Promise<Order> {
    const orderData = generateRandomOrder();
    return await this.createOrder(orderData);
  }

  /**
   * Create a new order with provided data
   */
  static async createOrder(orderData: {
    status: "open" | "closed" | "voided";
    tableId?: string;
    guestId?: string;
    reservationId?: string;
    itemsJson: string;
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    troncCents: number;
    totalCents: number;
  }): Promise<Order> {
    return await database.write(async () => {
      const now = Date.now();

      let outboxId: string | undefined;
      let journalId: string | undefined;

      if (isRelay) {
        const todaysJournal = await this.getOrCreateTodaysJournalInternal();
        journalId = todaysJournal.id;
      } else {
        const todaysOutbox = await this.getOrCreateTodaysOutboxInternal();
        outboxId = todaysOutbox.id;
      }

      // Parse items first
      let items: any[] = [];
      try {
        items = JSON.parse(orderData.itemsJson);
      } catch (e) {
        console.error("Failed to parse items JSON:", e);
      }

      // Step 1: Get the current max sequence and lamport clock for event
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc), Q.take(1))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      // Step 2: Create the order first (with empty event IDs temporarily)
      const order = await ordersCollection.create((o) => {
        o.status = orderData.status;
        o.tableId = orderData.tableId;
        o.guestId = orderData.guestId;
        o.reservationId = orderData.reservationId;
        o.itemsJson = orderData.itemsJson;
        o.openedAt = now;
        o.subtotalCents = orderData.subtotalCents;
        o.discountCents = orderData.discountCents;
        o.taxCents = orderData.taxCents;
        o.troncCents = orderData.troncCents;
        o.totalCents = orderData.totalCents;
        o.createdByEventId = "";
        o.updatedByEventId = "";
      });

      // Step 3: Create the event with the actual order ID
      const event = await eventsCollection.create((e) => {
        e.sequence = maxSequence + 1;
        e.entity = "order";
        e.entityId = order.id;
        e.type = "add_item";
        e.payloadJson = JSON.stringify({
          items: items,
          orderId: order.id,
          tableId: orderData.tableId,
          guestId: orderData.guestId,
          subtotalCents: orderData.subtotalCents,
          discountCents: orderData.discountCents,
          taxCents: orderData.taxCents,
          troncCents: orderData.troncCents,
          totalCents: orderData.totalCents,
        });
        e.deviceId = DeviceService.getDeviceId();
        e.relayId = DeviceService.getRelayId();
        e.userId = DeviceService.getUserId();
        e.venueId = DeviceService.getVenueId();
        e.lamportClock = maxLamportClock + 1;
        e.appliedAt = now; // Mark as applied immediately

        // Assign either outbox_id or journal_id based on isRelay
        if (isRelay) {
          e.journalId = journalId;
          e.status = "acked";
          e.ackedAt = now; // Mark as acked immediately
        } else {
          e.outboxId = outboxId;
          e.status = "pending";
        }
      });

      // Step 4: Update the order with event reference
      await order.update((o) => {
        o.createdByEventId = event.id;
        o.updatedByEventId = event.id;
      });

      return order;
    });
  }

  /**
   * Close an order by ID
   */
  static async closeOrder(orderId: string): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      const now = Date.now();

      let outboxId: string | undefined;
      let journalId: string | undefined;

      if (isRelay) {
        const todaysJournal = await this.getOrCreateTodaysJournalInternal();
        journalId = todaysJournal.id;
      } else {
        const todaysOutbox = await this.getOrCreateTodaysOutboxInternal();
        outboxId = todaysOutbox.id;
      }

      // Get current max sequence and lamport clock
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      // Create close_check event
      const event = await eventsCollection.create((e) => {
        e.sequence = maxSequence + 1;
        e.entity = "order";
        e.entityId = order.id;
        e.type = "close_check";
        e.payloadJson = JSON.stringify({
          orderId: order.id,
          closedAt: now,
          totalCents: order.totalCents,
        });
        e.deviceId = DeviceService.getDeviceId();
        e.relayId = DeviceService.getRelayId();
        e.userId = DeviceService.getUserId();
        e.venueId = DeviceService.getVenueId();
        e.lamportClock = maxLamportClock + 1;
        e.appliedAt = now; // Mark as applied immediately

        // Assign either outbox_id or journal_id based on isRelay
        if (isRelay) {
          e.journalId = journalId;
          e.status = "acked";
          e.ackedAt = now; // Mark as acked immediately
        } else {
          e.outboxId = outboxId;
          e.status = "pending";
        }
      });

      await order.update((o) => {
        o.status = "closed";
        o.closedAt = now;
        o.updatedByEventId = event.id;
      });

      return order;
    });
  }

  /**
   * Close an existing order instance
   */
  static async closeOrderInstance(order: Order): Promise<Order> {
    return await this.closeOrder(order.id);
  }

  /**
   * Void an order by ID
   */
  static async voidOrder(orderId: string): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      const now = Date.now();

      let outboxId: string | undefined;
      let journalId: string | undefined;

      if (isRelay) {
        const todaysJournal = await this.getOrCreateTodaysJournalInternal();
        journalId = todaysJournal.id;
      } else {
        const todaysOutbox = await this.getOrCreateTodaysOutboxInternal();
        outboxId = todaysOutbox.id;
      }

      // Get current max sequence and lamport clock
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      // Create void_item event
      const event = await eventsCollection.create((e) => {
        e.sequence = maxSequence + 1;
        e.entity = "order";
        e.entityId = order.id;
        e.type = "void_item";
        e.payloadJson = JSON.stringify({
          orderId: order.id,
          voidedAt: now,
        });
        e.deviceId = DeviceService.getDeviceId();
        e.relayId = DeviceService.getRelayId();
        e.userId = DeviceService.getUserId();
        e.venueId = DeviceService.getVenueId();
        e.lamportClock = maxLamportClock + 1;
        e.appliedAt = now; // Mark as applied immediately

        // Assign either outbox_id or journal_id based on isRelay
        if (isRelay) {
          e.journalId = journalId;
          e.status = "acked";
          e.ackedAt = now; // Mark as acked immediately
        } else {
          e.outboxId = outboxId;
          e.status = "pending";
        }
      });

      await order.update((o) => {
        o.status = "voided";
        o.voidedAt = now;
        o.updatedByEventId = event.id;
      });

      return order;
    });
  }

  /**
   * Void an existing order instance
   */
  static async voidOrderInstance(order: Order): Promise<Order> {
    return await this.voidOrder(order.id);
  }

  /**
   * Get an order by ID
   */
  static async getOrderById(orderId: string): Promise<Order> {
    return await ordersCollection.find(orderId);
  }

  /**
   * Get all orders
   */
  static async getAllOrders(): Promise<Order[]> {
    return await ordersCollection.query().fetch();
  }

  /**
   * Get orders by status
   */
  static async getOrdersByStatus(
    status: "open" | "closed" | "voided"
  ): Promise<Order[]> {
    return await ordersCollection.query(Q.where("status", status)).fetch();
  }

  /**
   * Get orders by table ID
   */
  static async getOrdersByTableId(tableId: string): Promise<Order[]> {
    return await ordersCollection.query(Q.where("table_id", tableId)).fetch();
  }

  /**
   * Update order items and recalculate totals
   */
  static async updateOrderItems(orderId: string, items: any[]): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      const now = Date.now();

      let outboxId: string | undefined;
      let journalId: string | undefined;

      if (isRelay) {
        const todaysJournal = await this.getOrCreateTodaysJournalInternal();
        journalId = todaysJournal.id;
      } else {
        const todaysOutbox = await this.getOrCreateTodaysOutboxInternal();
        outboxId = todaysOutbox.id;
      }

      // Get current max sequence and lamport clock
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      // Create change_quantity event
      const event = await eventsCollection.create((e) => {
        e.sequence = maxSequence + 1;
        e.entity = "order";
        e.entityId = order.id;
        e.type = "change_quantity";
        e.payloadJson = JSON.stringify({
          orderId: order.id,
          items: items,
        });
        e.deviceId = DeviceService.getDeviceId();
        e.relayId = DeviceService.getRelayId();
        e.userId = DeviceService.getUserId();
        e.venueId = DeviceService.getVenueId();
        e.lamportClock = maxLamportClock + 1;
        e.appliedAt = now; // Mark as applied immediately

        // Assign either outbox_id or journal_id based on isRelay
        if (isRelay) {
          e.journalId = journalId;
          e.status = "acked";
          e.ackedAt = now; // Mark as acked immediately
        } else {
          e.outboxId = outboxId;
          e.status = "pending";
        }
      });

      // Recalculate totals
      const subtotal = items.reduce(
        (sum, item) => sum + (item.subtotalCents || 0),
        0
      );
      const tax = Math.round(subtotal * 0.1);
      const tronc = Math.round(subtotal * 0.12);
      const total = subtotal + tax + tronc;

      await order.update((o) => {
        o.itemsJson = JSON.stringify(items);
        o.subtotalCents = subtotal;
        o.taxCents = tax;
        o.troncCents = tronc;
        o.totalCents = total;
        o.updatedByEventId = event.id;
      });

      return order;
    });
  }

  /**
   * Apply discount to an order
   */
  static async applyDiscount(
    orderId: string,
    discountCents: number
  ): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      const now = Date.now();

      let outboxId: string | undefined;
      let journalId: string | undefined;

      if (isRelay) {
        const todaysJournal = await this.getOrCreateTodaysJournalInternal();
        journalId = todaysJournal.id;
      } else {
        const todaysOutbox = await this.getOrCreateTodaysOutboxInternal();
        outboxId = todaysOutbox.id;
      }

      // Get current max sequence and lamport clock
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc))
        .fetch();

      const maxSequence =
        existingEvents.length > 0 ? existingEvents[0].sequence : 0;
      const maxLamportClock =
        existingEvents.length > 0 ? existingEvents[0].lamportClock : 0;

      // Create apply_discount event
      const event = await eventsCollection.create((e) => {
        e.sequence = maxSequence + 1;
        e.entity = "order";
        e.entityId = order.id;
        e.type = "apply_discount";
        e.payloadJson = JSON.stringify({
          orderId: order.id,
          discountCents: discountCents,
        });
        e.deviceId = DeviceService.getDeviceId();
        e.relayId = DeviceService.getRelayId();
        e.userId = DeviceService.getUserId();
        e.venueId = DeviceService.getVenueId();
        e.lamportClock = maxLamportClock + 1;
        e.appliedAt = now; // Mark as applied immediately

        // Assign either outbox_id or journal_id based on isRelay
        if (isRelay) {
          e.journalId = journalId;
          e.status = "acked";
          e.ackedAt = now; // Mark as acked immediately
        } else {
          e.outboxId = outboxId;
          e.status = "pending";
        }
      });

      await order.update((o) => {
        o.discountCents = discountCents;
        o.totalCents =
          o.subtotalCents - discountCents + o.taxCents + o.troncCents;
        o.updatedByEventId = event.id;
      });

      return order;
    });
  }

  /**
   * Delete an order by ID
   */
  static async deleteOrder(orderId: string): Promise<void> {
    await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      await order.destroyPermanently();
    });
  }

  /**
   * Parse items JSON from an order
   */
  static parseOrderItems(order: Order): any[] {
    try {
      return JSON.parse(order.itemsJson);
    } catch {
      return [];
    }
  }

  /**
   * Format order total as currency
   */
  static formatOrderTotal(order: Order): string {
    return `$${(order.totalCents / 100).toFixed(2)}`;
  }

  /**
   * Check if order can be modified
   */
  static canModifyOrder(order: Order): boolean {
    return order.status === "open";
  }

  /**
   * Get events for an order
   */
  static async getOrderEvents(orderId: string) {
    return await eventsCollection
      .query(
        Q.where("entity", "order"),
        Q.where("entity_id", orderId),
        Q.sortBy("sequence", Q.desc)
      )
      .fetch();
  }

  /**
   * Mark an order as closed
   * PURPOSE: Close order after events are confirmed by relay
   * This is called when order events are acked
   */
  static async markAsClosed(orderId: string): Promise<void> {
    try {
      console.log(`🔒 [OrderService] Marking order ${orderId} as closed`);

      const order = await ordersCollection.find(orderId);

      await database.write(async () => {
        await order.update((o) => {
          o.status = "closed";
          o.closedAt = Date.now();
        });
      });

      console.log(`✅ [OrderService] Order ${orderId} marked as closed`);
    } catch (error) {
      console.error(`❌ [OrderService] Error marking order as closed:`, error);
      throw error;
    }
  }
}
