// services/OrderService.ts
import { generateRandomOrder } from "@/constants/orders";
import database, { eventsCollection, ordersCollection } from "@/db";
import Order from "@/models/Order";
import { Q } from "@nozbe/watermelondb";
import { OutboxService } from "./OutboxService";

// Default values for event creation
const DEFAULT_DEVICE_ID = "device-001";
const DEFAULT_RELAY_ID = "relay-001";
const DEFAULT_USER_ID = "user-001";
const DEFAULT_VENUE_ID = "venue-001";

export class OrderService {
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

      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

      // Parse items first
      let items: any[] = [];
      try {
        items = JSON.parse(orderData.itemsJson);
      } catch (e) {
        console.error("Failed to parse items JSON:", e);
      }

      // Step 1: Get the current max sequence and lamport clock for event
      const existingEvents = await eventsCollection
        .query(Q.sortBy("sequence", Q.desc))
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
        e.deviceId = DEFAULT_DEVICE_ID;
        e.relayId = DEFAULT_RELAY_ID;
        e.userId = DEFAULT_USER_ID;
        e.venueId = DEFAULT_VENUE_ID;
        e.lamportClock = maxLamportClock + 1;
        e.status = "pending";
        e.appliedAt = now; // Mark as applied immediately
        e.outboxId = todaysOutbox.id;
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

      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

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
        e.deviceId = DEFAULT_DEVICE_ID;
        e.relayId = DEFAULT_RELAY_ID;
        e.userId = DEFAULT_USER_ID;
        e.venueId = DEFAULT_VENUE_ID;
        e.lamportClock = maxLamportClock + 1;
        e.status = "pending";
        e.appliedAt = now;
        e.outboxId = todaysOutbox.id;
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

      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

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
        e.deviceId = DEFAULT_DEVICE_ID;
        e.relayId = DEFAULT_RELAY_ID;
        e.userId = DEFAULT_USER_ID;
        e.venueId = DEFAULT_VENUE_ID;
        e.lamportClock = maxLamportClock + 1;
        e.status = "pending";
        e.appliedAt = now;
        e.outboxId = todaysOutbox.id;
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

      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

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
        e.deviceId = DEFAULT_DEVICE_ID;
        e.relayId = DEFAULT_RELAY_ID;
        e.userId = DEFAULT_USER_ID;
        e.venueId = DEFAULT_VENUE_ID;
        e.lamportClock = maxLamportClock + 1;
        e.status = "pending";
        e.appliedAt = now;
        e.outboxId = todaysOutbox.id;
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

      const todaysOutbox = await OutboxService.getOrCreateTodaysOutbox();

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
        e.deviceId = DEFAULT_DEVICE_ID;
        e.relayId = DEFAULT_RELAY_ID;
        e.userId = DEFAULT_USER_ID;
        e.venueId = DEFAULT_VENUE_ID;
        e.lamportClock = maxLamportClock + 1;
        e.status = "pending";
        e.appliedAt = now;
        e.outboxId = todaysOutbox.id;
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
}
