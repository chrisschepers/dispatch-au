import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core';
export const feedCache = sqliteTable('feed_cache', {
  key: text('key').primaryKey(),
  payload: text('payload').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  retryAfter: integer('retry_after').notNull().default(0),
});
export const places = sqliteTable(
  'places',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    radius: integer('radius').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('places_user_idx').on(t.userId)],
);
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    customerId: text('customer_id').notNull(),
    status: text('status').notNull(),
    periodEnd: integer('period_end').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('subscriptions_user_idx').on(t.userId)],
);
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  receivedAt: integer('received_at').notNull(),
});
