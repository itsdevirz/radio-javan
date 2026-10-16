import { table, integer, text } from 'sdk/db';

export const users = table('users', {
  userId: integer('user_id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  firstName: text('first_name'),
  username: text('username'),
  downloads: integer('downloads').notNull().default(0),
  joinedAt: integer('joined_at').notNull(),
});

export const sessions = table('sessions', {
  chatId: integer('chat_id').primaryKey(),
  userId: integer('user_id').notNull(),
  state: text('state').notNull().default('idle'),
  data: text('data').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
});