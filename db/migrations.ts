import {
  addColumns,
  createTable,
  schemaMigrations,
  unsafeExecuteSql,
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
    {
      toVersion: 3,
      steps: [
        createTable({
          name: "outbox",
          columns: [
            { name: "entity", type: "string", isIndexed: true },
            { name: "entity_id", type: "string", isIndexed: true },
            { name: "type", type: "string", isIndexed: true },
            { name: "payload_json", type: "string" },
            { name: "event_id", type: "string", isIndexed: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: "events",
          columns: [{ name: "outbox_id", type: "string", isIndexed: true }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        // Drop the old outbox table
        unsafeExecuteSql("DROP TABLE IF EXISTS outbox;"),
        // Recreate with correct structure
        createTable({
          name: "outbox",
          columns: [
            { name: "date", type: "string", isIndexed: true },
            { name: "status", type: "string", isIndexed: true },
            { name: "synced_at", type: "number", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        // Drop the old outbox table
        unsafeExecuteSql("DROP TABLE IF EXISTS outbox;"),
        // Recreate with correct structure
        createTable({
          name: "outboxes",
          columns: [
            { name: "date", type: "string", isIndexed: true },
            { name: "status", type: "string", isIndexed: true },
            { name: "device_id", type: "string" },
            { name: "venue_id", type: "string" },
            { name: "synced_at", type: "number", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: "events",
          columns: [{ name: "journal_id", type: "string", isIndexed: true }],
        }),
        createTable({
          name: "journals",
          columns: [
            { name: "date", type: "string", isIndexed: true },
            { name: "status", type: "string", isIndexed: true },
            { name: "sequence", type: "number" },
            { name: "source", type: "string" },
            { name: "device_id", type: "string" },
            { name: "venue_id", type: "string" },
            { name: "synced_at", type: "number", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: "outboxes",
          columns: [{ name: "sequence", type: "number" }],
        }),
      ],
    },
  ],
});
