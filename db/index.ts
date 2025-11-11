import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import Event from "@/models/Event";
import Journal from "@/models/Journal";
import Order from "@/models/Order";
import Outbox from "@/models/Outbox";
import migrations from "./migrations";
import schema from "./schema";

// First, create the adapter to the underlying database:
const adapter = new SQLiteAdapter({
  schema,
  // (You might want to comment it out for development purposes -- see Migrations documentation)
  migrations,
  // (optional database name or file system path)
  // dbName: 'myapp',
  // (recommended option, should work flawlessly out of the box on iOS. On Android,
  // additional installation steps have to be taken - disable if you run into issues...)
  jsi: true /* Platform.OS === 'ios' */,
  // (optional, but you should implement this method)
  onSetUpError: (error) => {
    // Database failed to load -- offer the user to reload the app or log out
  },
});

// Then, make a Watermelon database from it!
const database = new Database({
  adapter,
  modelClasses: [Event, Order, Outbox, Journal],
});

export default database;

export const eventsCollection = database.get<Event>("events");
export const ordersCollection = database.get<Order>("orders");
export const outboxesCollection = database.get<Outbox>("outboxes");
export const journalsCollection = database.get<Journal>("journals");
