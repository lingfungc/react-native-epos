import { Model } from "@nozbe/watermelondb";
import { date, field, readonly, text } from "@nozbe/watermelondb/decorators";

export default class Order extends Model {
  static table = "orders";

  // static associations = {
  //   tables: { type: "belongs_to", key: "table_id" },
  //   guests: { type: "has_many", foreignKey: "order_id" },
  //   reservations: { type: "belongs_to", key: "reservation_id" },
  // };

  @text("status") status!: "open" | "closed" | "voided";

  // Relations
  @text("table_id") tableId?: string;
  // @relation("tables", "table_id") table?: any;

  @text("guest_id") guestId?: string;
  @text("reservation_id") reservationId?: string;

  // Items stored as JSON array
  @text("items_json") itemsJson!: string;

  // Timestamps
  @readonly @date("opened_at") openedAt!: number;
  @date("closed_at") closedAt?: number;
  @date("voided_at") voidedAt?: number;

  // Financial fields (in cents)
  @field("subtotal_cents") subtotalCents!: number;
  @field("discount_cents") discountCents!: number;
  @field("tax_cents") taxCents!: number;
  @field("tronc_cents") troncCents!: number;
  @field("total_cents") totalCents!: number;

  // Event sourcing references
  @text("created_by_event_id") createdByEventId!: string;
  @text("updated_by_event_id") updatedByEventId!: string;

  // Standard timestamps
  @readonly @date("created_at") createdAt!: number;
  @readonly @date("updated_at") updatedAt!: number;
}
