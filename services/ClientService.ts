import database, { eventsCollection, ordersCollection } from "@/db";
import { DeviceService } from "./DeviceService";
import { JournalService } from "./JournalService";
import { isRelay } from "./TcpService";

interface BroadcastEventData {
  eventId: string;
  sequence: number;
  entity: string;
  entityId: string;
  eventType: string;
  payload: any;
  lamportClock: number;
  status: string;
  journalId: string;
  createdAt: number;
  ackedAt: number;
}

export class ClientService {
  /**
   * Handle broadcast event received from relay
   * This should only be called when in client mode
   */
  static async onBroadcastReceived(
    eventData: BroadcastEventData,
    relayDeviceId: string,
    relayUserId: string,
    relayVenueId: string
  ): Promise<void> {
    if (isRelay) {
      console.warn("⚠️ ClientService called but running in relay mode");
      return;
    }

    console.log("📡 [ClientService] Broadcast event received from relay");
    console.log("├─ Event ID:", eventData.eventId);
    console.log("├─ Entity:", eventData.entity);
    console.log("├─ Entity ID:", eventData.entityId);
    console.log("├─ Event Type:", eventData.eventType);
    console.log("├─ Sequence:", eventData.sequence);
    console.log("├─ Lamport Clock:", eventData.lamportClock);
    console.log("├─ Status:", eventData.status);
    console.log("├─ Relay Device ID:", relayDeviceId);
    console.log("├─ Relay User ID:", relayUserId);
    console.log("├─ Relay Venue ID:", relayVenueId);
    console.log("├─ Payload:", JSON.stringify(eventData.payload, null, 2));
    console.log(
      "├─ Original Created At:",
      new Date(eventData.createdAt).toISOString()
    );
    console.log("└─ Acked At:", new Date(eventData.ackedAt).toISOString());

    try {
      // Step 1: Check if we already have this event to avoid duplicates
      const existingEvent = await this.checkIfEventExists(eventData.eventId);
      if (existingEvent) {
        console.log("ℹ️ [ClientService] Event already exists, skipping...");
        return;
      }

      // Step 2: Record event in client's journal as "acked"
      await this.recordEventInJournal(
        eventData,
        relayDeviceId,
        relayUserId,
        relayVenueId
      );

      // Step 3: Apply the event to client's database (create/update order)
      switch (eventData.entity) {
        case "order":
          await this.handleOrderEvent(
            eventData,
            relayDeviceId,
            relayUserId,
            relayVenueId
          );
          break;
        default:
          console.warn(`⚠️ Unknown entity type: ${eventData.entity}`);
      }

      console.log("✅ [ClientService] Broadcast event processed successfully");
    } catch (error) {
      console.error("❌ [ClientService] Error handling broadcast:", error);
      throw error;
    }
  }

  /**
   * Check if event already exists in the database
   */
  private static async checkIfEventExists(eventId: string): Promise<boolean> {
    try {
      const event = await eventsCollection.find(eventId).catch(() => null);
      return event !== null;
    } catch (error) {
      console.error("Error checking event existence:", error);
      return false;
    }
  }

  /**
   * Handle order-related events
   */
  private static async handleOrderEvent(
    eventData: BroadcastEventData,
    relayDeviceId: string,
    relayUserId: string,
    relayVenueId: string
  ): Promise<void> {
    console.log(
      "🍽️ [ClientService] Handling order event:",
      eventData.eventType
    );

    switch (eventData.eventType) {
      case "add_item":
        await this.handleAddItemEvent(
          eventData,
          relayDeviceId,
          relayUserId,
          relayVenueId
        );
        break;
      default:
        console.warn(`⚠️ Unknown order event type: ${eventData.eventType}`);
    }
  }

  /**
   * Handle add_item event - Create or update order in client DB
   */
  private static async handleAddItemEvent(
    eventData: BroadcastEventData,
    relayDeviceId: string,
    relayUserId: string,
    relayVenueId: string
  ): Promise<void> {
    console.log("➕ [ClientService] Processing add_item event");

    const { entityId, payload } = eventData;

    try {
      // Check if order already exists in client DB
      const existingOrder = await ordersCollection
        .find(entityId)
        .catch(() => null);

      if (existingOrder) {
        console.log("📝 [ClientService] Order exists, updating...");
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

        console.log("✅ [ClientService] Order updated successfully");
      } else {
        console.log(
          "🆕 [ClientService] Order doesn't exist, creating new order..."
        );
        console.log("Full payload received:", payload);

        // Create new order in client DB
        await database.write(async () => {
          await ordersCollection.create((order) => {
            order._raw.id = entityId; // Use the same ID as the original order

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

        console.log("✅ [ClientService] New order created successfully");
      }

      console.log("✅ [ClientService] add_item event processed successfully");
    } catch (error) {
      console.error(
        "❌ [ClientService] Error processing add_item event:",
        error
      );
      throw error;
    }
  }

  /**
   * Record broadcast event in client's journal as "acked"
   * This creates the event directly in the journal WITHOUT going through outbox
   */
  private static async recordEventInJournal(
    eventData: BroadcastEventData,
    relayDeviceId: string,
    relayUserId: string,
    relayVenueId: string
  ): Promise<void> {
    try {
      console.log("📔 [ClientService] Recording broadcast event in journal...");

      const todaysJournal = await JournalService.getOrCreateTodaysJournal();
      console.log(
        "Using journal:",
        todaysJournal.id,
        "for date:",
        todaysJournal.date
      );

      // Create event directly in client's database
      // CRITICAL: Do NOT associate with any outbox since this came from relay
      await database.write(async () => {
        await eventsCollection.create((event: any) => {
          // Use the same event ID from the relay to maintain consistency
          event._raw.id = eventData.eventId;

          event.sequence = eventData.sequence;
          event.entity = eventData.entity;
          event.entityId = eventData.entityId;
          event.type = eventData.eventType;
          event.payloadJson = JSON.stringify(eventData.payload);

          // Store the original device/user/venue that created the event
          event.deviceId = relayDeviceId;
          event.relayId = relayDeviceId; // Track which relay sent this
          event.userId = relayUserId;
          event.venueId = relayVenueId;
          event.lamportClock = eventData.lamportClock;

          // CRITICAL: Set status as "acked" since it came from relay
          event.status = "acked";
          event.ackedAt = eventData.ackedAt;
          event.appliedAt = Date.now(); // When we applied it locally

          // Associate with journal (NOT outbox)
          event.journalId = todaysJournal.id;

          // CRITICAL: Do NOT set outboxId - leave it undefined
          // This event came from the relay, so it's not in our outbox
        });
      });

      console.log(
        "✅ [ClientService] Broadcast event recorded in journal as acked (NOT in outbox)"
      );
    } catch (error) {
      console.error(
        "❌ [ClientService] Error recording broadcast event in journal:",
        error
      );
      throw error;
    }
  }

  /**
   * Update Lamport clock based on received event
   * Ensures proper causal ordering across distributed system
   */
  static updateLamportClock(receivedClock: number): void {
    try {
      // Check if DeviceService has the required methods
      if (typeof DeviceService.getLamportClock !== "function") {
        console.error("❌ DeviceService.getLamportClock is not available");
        console.error("Make sure DeviceService is properly initialized");
        return;
      }

      const currentClock = DeviceService.getLamportClock();
      const newClock = Math.max(currentClock, receivedClock) + 1;

      if (typeof DeviceService.setLamportClock !== "function") {
        console.error("❌ DeviceService.setLamportClock is not available");
        return;
      }

      DeviceService.setLamportClock(newClock);
      console.log(
        `🕐 [ClientService] Lamport clock updated: ${currentClock} -> ${newClock}`
      );
    } catch (error) {
      console.error("❌ Error updating Lamport clock:", error);
    }
  }

  /**
   * Create acknowledgment message for successful processing
   */
  static createProcessedMessage(
    eventId: string,
    success: boolean,
    error?: string
  ) {
    return {
      type: "processed" as const,
      data: {
        eventId,
        success,
        error,
        deviceId: DeviceService.getDeviceId(),
        timestamp: Date.now(),
      },
    };
  }
}
