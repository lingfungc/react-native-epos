import { Model, Query } from "@nozbe/watermelondb";
import { children, date, text } from "@nozbe/watermelondb/decorators";
import Event from "./Event";

export type OutboxStatus = "pending" | "syncing" | "synced";

export default class Outbox extends Model {
  static table = "outboxes";

  // Define the relationship: one outbox has many events
  static associations = {
    events: { type: "has_many", foreignKey: "outbox_id" },
  } as const;

  @text("date") date!: string; // YYYY-MM-DD format
  @text("status") status!: OutboxStatus; // pending/syncing/synced
  @date("synced_at") syncedAt?: number;
  @text("device_id") deviceId!: string;
  @text("venue_id") venueId!: string;
  @date("created_at") createdAt!: number;
  @date("updated_at") updatedAt!: number;

  // Query to get all events in this outbox
  @children("events") events!: Query<Event>;
}
