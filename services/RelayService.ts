import database, { eventsCollection, ordersCollection } from "@/db";
import { DeviceService } from "./DeviceService";
import { JournalService } from "./JournalService";
import { isRelay } from "./TcpService";

interface ReceivedEventData {
  eventId: string;
  sequence: number;
  entity: string;
  entityId: string;
  eventType: string;
  payload: any;
  lamportClock: number;
  status: string;
  outboxId: string;
  createdAt: number;
}

export class RelayService {
  /**
   * Handle event received from client
   * This should only be called when in relay mode
   */
  static async onEventReceived(
    eventData: ReceivedEventData,
    senderDeviceId: string,
    senderUserId: string,
    senderVenueId: string
  ): Promise<string[]> {
    // CHANGED: Now returns array of applied event IDs
    if (!isRelay) {
      console.warn("⚠️ RelayService called but not in relay mode");
      return [];
    }

    console.log("📥 [RelayService] Event received from client");
    console.log("├─ Event ID:", eventData.eventId);
    console.log("├─ Entity:", eventData.entity);
    console.log("├─ Entity ID:", eventData.entityId);
    console.log("├─ Event Type:", eventData.eventType);
    console.log("├─ Sequence:", eventData.sequence);
    console.log("├─ Lamport Clock:", eventData.lamportClock);
    console.log("├─ Sender Device ID:", senderDeviceId);
    console.log("├─ Sender User ID:", senderUserId);
    console.log("├─ Sender Venue ID:", senderVenueId);
    console.log("├─ Payload:", JSON.stringify(eventData.payload, null, 2));
    console.log(
      "└─ Original Created At:",
      new Date(eventData.createdAt).toISOString()
    );

    try {
      // Step 1: Record event in relay's journal as "acked" FIRST
      await this.recordEventInJournal(
        eventData,
        senderDeviceId,
        senderUserId,
        senderVenueId
      );

      // Step 2: Apply the event to relay's database (create/update order)
      switch (eventData.entity) {
        case "order":
          await this.handleOrderEvent(
            eventData,
            senderDeviceId,
            senderUserId,
            senderVenueId
          );
          break;
        default:
          console.warn(`⚠️ Unknown entity type: ${eventData.entity}`);
      }

      console.log("✅ [RelayService] Event processed successfully");

      // CHANGED: Return the event ID to confirm it was applied
      return [eventData.eventId];
    } catch (error) {
      console.error("❌ [RelayService] Error handling event:", error);
      throw error;
    }
  }

  /**
   * Handle order-related events
   */
  private static async handleOrderEvent(
    eventData: ReceivedEventData,
    senderDeviceId: string,
    senderUserId: string,
    senderVenueId: string
  ): Promise<void> {
    console.log("🍽️ [RelayService] Handling order event:", eventData.eventType);

    switch (eventData.eventType) {
      case "add_item":
        await this.handleAddItemEvent(
          eventData,
          senderDeviceId,
          senderUserId,
          senderVenueId
        );
        break;
      default:
        console.warn(`⚠️ Unknown order event type: ${eventData.eventType}`);
    }
  }

  /**
   * Handle add_item event - Create or update order in relay DB
   */
  private static async handleAddItemEvent(
    eventData: ReceivedEventData,
    senderDeviceId: string,
    senderUserId: string,
    senderVenueId: string
  ): Promise<void> {
    console.log("➕ [RelayService] Processing add_item event");

    const { entityId, payload } = eventData;

    try {
      // Check if order already exists in relay DB
      const existingOrder = await ordersCollection
        .find(entityId)
        .catch(() => null);

      if (existingOrder) {
        console.log("📝 [RelayService] Order exists, updating...");
        console.log("Current order data:", {
          id: existingOrder.id,
          status: existingOrder.status,
          itemsJson: existingOrder.itemsJson,
          subtotalCents: existingOrder.subtotalCents,
        });

        // Update existing order
        await database.write(async () => {
          await existingOrder.update((order) => {
            // Parse existing items
            let items = [];
            try {
              items = JSON.parse(order.itemsJson);
            } catch (e) {
              console.error("Failed to parse existing items:", e);
              items = [];
            }

            console.log("Existing items:", items);

            // Add new items from payload.items array
            if (payload.items && Array.isArray(payload.items)) {
              items.push(...payload.items);
              console.log("New items added from payload.items:", payload.items);
            }

            // Calculate totals from the items
            const subtotalCents = items.reduce(
              (sum, item) =>
                sum + (item.unitPriceCents || item.subtotalCents || 0),
              0
            );

            console.log("Calculated subtotal (cents):", subtotalCents);

            // Update order with payload data
            order.itemsJson = JSON.stringify(items);
            order.subtotalCents = payload.subtotalCents || subtotalCents;
            order.discountCents = payload.discountCents || order.discountCents;
            order.taxCents = payload.taxCents || order.taxCents;
            order.troncCents = payload.troncCents || order.troncCents;
            order.totalCents = payload.totalCents || order.totalCents;
            order.updatedByEventId = eventData.eventId;

            // Update relations if provided
            if (payload.tableId) order.tableId = payload.tableId;
            if (payload.guestId) order.guestId = payload.guestId;
            if (payload.reservationId)
              order.reservationId = payload.reservationId;

            console.log("Order updated:", {
              itemCount: items.length,
              subtotalCents: order.subtotalCents,
              totalCents: order.totalCents,
            });
          });
        });

        console.log("✅ [RelayService] Order updated successfully");
      } else {
        console.log(
          "🆕 [RelayService] Order doesn't exist, creating new order..."
        );
        console.log("Full payload received:", payload);

        // Create new order in relay DB
        await database.write(async () => {
          await ordersCollection.create((order) => {
            order._raw.id = entityId; // Use the same ID as the client

            // Use items from payload.items array
            const items = payload.items || [];
            console.log("Creating order with items:", items);

            order.itemsJson = JSON.stringify(items);
            order.status = "open";
            order.openedAt = Date.now();

            // Use the calculated values from payload
            order.subtotalCents = payload.subtotalCents || 0;
            order.discountCents = payload.discountCents || 0;
            order.taxCents = payload.taxCents || 0;
            order.troncCents = payload.troncCents || 0;
            order.totalCents = payload.totalCents || 0;

            order.createdByEventId = eventData.eventId;
            order.updatedByEventId = eventData.eventId;

            // Set table/guest/reservation info from payload
            if (payload.tableId) {
              order.tableId = payload.tableId;
            }
            if (payload.guestId) {
              order.guestId = payload.guestId;
            }
            if (payload.reservationId) {
              order.reservationId = payload.reservationId;
            }

            console.log("Order created:", {
              id: order._raw.id,
              status: order.status,
              itemCount: items.length,
              items: items,
              subtotalCents: order.subtotalCents,
              totalCents: order.totalCents,
              tableId: order.tableId,
              guestId: order.guestId,
            });
          });
        });

        console.log("✅ [RelayService] New order created successfully");
      }

      console.log("✅ [RelayService] add_item event processed successfully");
    } catch (error) {
      console.error(
        "❌ [RelayService] Error processing add_item event:",
        error
      );
      throw error;
    }
  }

  /**
   * Record event in relay's journal as "acked"
   * This creates the event directly in the journal WITHOUT going through outbox
   */
  private static async recordEventInJournal(
    eventData: ReceivedEventData,
    senderDeviceId: string,
    senderUserId: string,
    senderVenueId: string
  ): Promise<void> {
    try {
      console.log("📔 [RelayService] Recording event in journal...");

      const todaysJournal = await JournalService.getOrCreateTodaysJournal();
      console.log(
        "Using journal:",
        todaysJournal.id,
        "for date:",
        todaysJournal.date
      );

      // Create event directly in relay's database
      // CRITICAL: Do NOT associate with any outbox
      await database.write(async () => {
        await eventsCollection.create((event: any) => {
          event.sequence = eventData.sequence;
          event.entity = eventData.entity;
          event.entityId = eventData.entityId;
          event.type = eventData.eventType;
          event.payloadJson = JSON.stringify(eventData.payload);
          event.deviceId = senderDeviceId;
          event.relayId = DeviceService.getDeviceId(); // Use relay's device ID
          event.userId = senderUserId;
          event.venueId = senderVenueId;
          event.lamportClock = eventData.lamportClock;

          // CRITICAL: Set status as "acked" and associate with journal ONLY
          event.status = "acked";
          event.ackedAt = Date.now();
          event.appliedAt = Date.now();

          // Associate with journal (NOT outbox)
          event.journalId = todaysJournal.id;

          // CRITICAL: Do NOT set outboxId - leave it undefined
          // Do NOT set: event.outboxId = null;
          // WatermelonDB will handle it as undefined/null automatically
        });
      });

      console.log(
        "✅ [RelayService] Event recorded in journal as acked (NOT in outbox)"
      );
    } catch (error) {
      console.error(
        "❌ [RelayService] Error recording event in journal:",
        error
      );
      throw error; // Throw error since this is critical
    }
  }

  /**
   * Create acknowledgment with applied event IDs
   * NEW: Returns list of successfully applied events
   */
  static createAppliedMessage(appliedEventIds: string[]) {
    return {
      type: "applied" as const,
      data: {
        appliedEventIds,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Send acknowledgment back to client (DEPRECATED - use createAppliedMessage)
   * Keeping for backward compatibility
   */
  static createAckMessage(eventId: string, success: boolean, error?: string) {
    return {
      type: "ack" as const,
      data: {
        eventId,
        success,
        error,
        timestamp: Date.now(),
      },
    };
  }
}
