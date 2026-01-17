import { sqliteTable, varchar, integer, text, json } from "drizzle-orm/better-sqlite3";

export const shipments = sqliteTable("shipments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  carrierIds: json("carrierIds").$type<Record<string, string> | null>().default(null),
  sender: json("sender").$type<object>(),
  recipient: json("recipient").$type<object>(),
  service: varchar("service", { length: 32 }),
  reference: varchar("reference", { length: 128 }).default(""),
  dimensions: json("dimensions").$type<object | null>().default(null),
  totalWeight: integer("totalWeight"),
  metadata: json("metadata").$type<object | null>().default(null),
  createdAt: varchar("createdAt", { length: 64 }),
  updatedAt: varchar("updatedAt", { length: 64 }),
});

export const parcels = sqliteTable("parcels", {
  id: varchar("id", { length: 64 }).primaryKey(),
  shipmentId: varchar("shipmentId", { length: 64 }),
  weight: integer("weight"),
  dimensions: json("dimensions").$type<object | null>().default(null),
  metadata: json("metadata").$type<object | null>().default(null),
  createdAt: varchar("createdAt", { length: 64 }),
  updatedAt: varchar("updatedAt", { length: 64 }),
});

export const carrierResources = sqliteTable("carrier_resources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  internalId: varchar("internalId", { length: 64 }),
  resourceType: varchar("resourceType", { length: 32 }),
  carrierId: varchar("carrierId", { length: 128 }),
  status: varchar("status", { length: 32 }).default(""),
  raw: json("raw").$type<object | null>().default(null),
  createdAt: varchar("createdAt", { length: 64 }),
});

export const labels = sqliteTable("labels", {
  id: varchar("id", { length: 64 }).primaryKey(),
  parcelId: varchar("parcelId", { length: 64 }),
  carrierId: varchar("carrierId", { length: 128 }),
  labelData: text("labelData"),
  createdAt: varchar("createdAt", { length: 64 }),
});

export const events = sqliteTable("events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  internalId: varchar("internalId", { length: 64 }),
  type: varchar("type", { length: 64 }),
  timestamp: varchar("timestamp", { length: 64 }),
  carrierId: varchar("carrierId", { length: 64 }).default(""),
  resource: json("resource").$type<object | null>().default(null),
});
