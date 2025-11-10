import { Model, Relation } from "@nozbe/watermelondb";
import {
  date,
  field,
  readonly,
  relation,
  text,
} from "@nozbe/watermelondb/decorators";
import Outbox from "./Outbox";

export type EntityType =
  | "table"
  | "order"
  | "reservation"
  | "guest_profile"
  | "payment"
  | "print";

export type EventType =
  | "add_item"
  | "change_quantity"
  | "close_check"
  | "void_item"
  | "apply_discount"
  | "create_reservation"
  | "update_reservation"
  | "assign_reservation"
  | "move_reservation"
  | "set_reservation_status"
  | "print_ticket"
  | "print_result"
  | "payment_captured"
  | "payment_refund";

export type EventStatus = "pending" | "acked" | "rejected";

export default class Event extends Model {
  static table = "events";

  // Define the relationship: event belongs to an outbox
  static associations = {
    outbox: { type: "belongs_to", key: "outbox_id" },
  } as const;

  @field("sequence") sequence!: number;
  @text("entity") entity!: EntityType;
  @text("entity_id") entityId!: string;
  @text("type") type!: EventType;
  @text("payload_json") payloadJson!: string;
  @text("device_id") deviceId!: string;
  @text("relay_id") relayId!: string;
  @text("user_id") userId!: string;
  @text("venue_id") venueId!: string;
  @readonly @date("created_at") createdAt!: number;
  @readonly @date("updated_at") updatedAt!: number;
  @date("applied_at") appliedAt?: number;
  @field("lamport_clock") lamportClock!: number;
  @text("status") status!: EventStatus;
  @text("error_message") errorMessage?: string;
  @date("acked_at") ackedAt?: number;

  // Foreign key to outbox
  @text("outbox_id") outboxId!: string;

  // Relation to get the parent outbox
  @relation("outbox", "outbox_id") outbox!: Relation<Outbox>;
}
