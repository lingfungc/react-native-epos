import { EntityType, EventStatus, EventType } from "@/models/Event";

// Default values for creating events
export const DEFAULT_EVENT_VALUES = {
  entity: "order" as EntityType,
  type: "add_item" as EventType,
  payloadJson: JSON.stringify({ item: "Sample Item", quantity: 1 }),
  deviceId: "device-001",
  relayId: "relay-001",
  userId: "user-001",
  venueId: "venue-001",
  status: "pending" as EventStatus,
};
