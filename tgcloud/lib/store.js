import { db } from 'sdk';
import { eq } from 'sdk/db';
import { users, sessions } from '../schema.js';

export async function registerUser(from, chatId) {
  if (!from?.id || !chatId) return;
  const values = {
    userId: Number(from.id),
    chatId: Number(chatId),
    firstName: String(from.first_name ?? '').slice(0, 160),
    username: String(from.username ?? '').slice(0, 80),
    joinedAt: Math.floor(Date.now() / 1000),
  };
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.userId,
    set: {
      chatId: values.chatId,
      firstName: values.firstName,
      username: values.username,
    },
  }).run();
}

export async function incrementDownloads(userId) {
  const user = await db.select().from(users).where(eq(users.userId, Number(userId))).get();
  if (!user) return;
  await db.update(users).set({ downloads: Number(user.downloads ?? 0) + 1 })
    .where(eq(users.userId, Number(userId))).run();
}

export async function getUserCount() {
  return await db.$count(users);
}

export async function getUserIds() {
  const rows = await db.select({ userId: users.userId }).from(users).all();
  return rows.map(row => Number(row.userId)).filter(Number.isFinite);
}

export async function getSession(chatId, userId = chatId) {
  const row = await db.select().from(sessions).where(eq(sessions.chatId, Number(chatId))).get();
  if (!row) return { chatId: Number(chatId), userId: Number(userId), state: 'idle', data: {} };
  let data = {};
  try { data = JSON.parse(row.data || '{}'); } catch { data = {}; }
  return { ...row, data };
}

export async function setSession(chatId, userId, state, data = {}) {
  const values = {
    chatId: Number(chatId),
    userId: Number(userId),
    state: String(state || 'idle'),
    data: JSON.stringify(data ?? {}),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await db.insert(sessions).values(values).onConflictDoUpdate({
    target: sessions.chatId,
    set: {
      userId: values.userId,
      state: values.state,
      data: values.data,
      updatedAt: values.updatedAt,
    },
  }).run();
  return { ...values, data: data ?? {} };
}

export async function clearSession(chatId, userId = chatId) {
  return setSession(chatId, userId, 'idle', {});
}