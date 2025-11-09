import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "events",
      columns: [
        { name: "sequence", type: "number" },
        { name: "entity", type: "string" },
        { name: "entity_id", type: "string" },
        { name: "type", type: "string" },
        { name: "payload_json", type: "string" },
        { name: "device_id", type: "string" },
        { name: "relay_id", type: "string" },
        { name: "user_id", type: "string" },
        { name: "venue_id", type: "string" },
        { name: "created_at", type: "number" },
        { name: "updated_at", type: "number" },
        { name: "applied_at", type: "number", isOptional: true },
        { name: "lamport_clock", type: "number" },
        { name: "status", type: "string" },
        { name: "error_message", type: "string", isOptional: true },
        { name: "acked_at", type: "number", isOptional: true },
      ],
    }),
  ],
});
