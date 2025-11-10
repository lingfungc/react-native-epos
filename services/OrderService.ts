import { generateRandomOrder } from "@/constants/orders";
import database, { ordersCollection } from "@/db";
import Order from "@/models/Order";
import { Q } from "@nozbe/watermelondb";

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
      return await ordersCollection.create((order) => {
        order.status = orderData.status;
        order.tableId = orderData.tableId;
        order.guestId = orderData.guestId;
        order.reservationId = orderData.reservationId;
        order.itemsJson = orderData.itemsJson;
        order.openedAt = now;
        order.subtotalCents = orderData.subtotalCents;
        order.discountCents = orderData.discountCents;
        order.taxCents = orderData.taxCents;
        order.troncCents = orderData.troncCents;
        order.totalCents = orderData.totalCents;
        order.createdByEventId = "";
        order.updatedByEventId = "";
      });
    });
  }

  /**
   * Close an order by ID
   */
  static async closeOrder(orderId: string): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      await order.update((o) => {
        o.status = "closed";
        o.closedAt = Date.now();
      });
      return order;
    });
  }

  /**
   * Close an existing order instance
   */
  static async closeOrderInstance(order: Order): Promise<Order> {
    return await database.write(async () => {
      await order.update((o) => {
        o.status = "closed";
        o.closedAt = Date.now();
      });
      return order;
    });
  }

  /**
   * Void an order by ID
   */
  static async voidOrder(orderId: string): Promise<Order> {
    return await database.write(async () => {
      const order = await ordersCollection.find(orderId);
      await order.update((o) => {
        o.status = "voided";
        o.voidedAt = Date.now();
      });
      return order;
    });
  }

  /**
   * Void an existing order instance
   */
  static async voidOrderInstance(order: Order): Promise<Order> {
    return await database.write(async () => {
      await order.update((o) => {
        o.status = "voided";
        o.voidedAt = Date.now();
      });
      return order;
    });
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

      await order.update((o) => {
        o.discountCents = discountCents;
        o.totalCents =
          o.subtotalCents - discountCents + o.taxCents + o.troncCents;
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
}
