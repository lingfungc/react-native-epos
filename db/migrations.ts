import {
  createTable,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: "orders",
          columns: [
            { name: "status", type: "string", isIndexed: true },
            {
              name: "table_id",
              type: "string",
              isOptional: true,
              isIndexed: true,
            },
            { name: "guest_id", type: "string", isOptional: true },
            {
              name: "reservation_id",
              type: "string",
              isOptional: true,
              isIndexed: true,
            },
            { name: "items_json", type: "string" },
            { name: "opened_at", type: "number" },
            { name: "closed_at", type: "number", isOptional: true },
            { name: "voided_at", type: "number", isOptional: true },
            { name: "subtotal_cents", type: "number" },
            { name: "discount_cents", type: "number" },
            { name: "tax_cents", type: "number" },
            { name: "tronc_cents", type: "number" },
            { name: "total_cents", type: "number" },
            { name: "created_by_event_id", type: "string", isIndexed: true },
            { name: "updated_by_event_id", type: "string", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
  ],
});
