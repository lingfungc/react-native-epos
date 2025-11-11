import { Model, Query } from "@nozbe/watermelondb";
import { children, date, field, text } from "@nozbe/watermelondb/decorators";
import Event from "./Event";

export type JournalStatus = "pending" | "syncing" | "synced";
export type JournalSource = "local" | "relay" | "cloud";

export default class Journal extends Model {
  static table = "journals";

  // Define the relationship: one journal has many events
  static associations = {
    events: { type: "has_many", foreignKey: "journal_id" },
  } as const;

  @text("date") date!: string; // YYYY-MM-DD format
  @text("status") status!: JournalStatus; // pending/syncing/synced
  @field("sequence") sequence!: number;
  @text("source") source!: JournalSource;
  @text("device_id") deviceId!: string;
  @text("venue_id") venueId!: string;
  @date("synced_at") syncedAt?: number;
  @date("created_at") createdAt!: number;
  @date("updated_at") updatedAt!: number;

  // Query to get all events in this journal
  @children("events") events!: Query<Event>;
}
