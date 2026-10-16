import { api } from 'sdk';
import { getSession, setSession, clearSession, incrementDownloads, getUserCount } from '../lib/store.js';
import { getFeaturedSongs, searchSongs, musicCaption } from '../lib/radiojavan.js';

const ADMIN_IDS = [1913245253];

function mainKeyboard() {
  return { inline_keyboard: [
    [{ text: '🎵 جدیدترین آهنگ‌ها', callback_data: 'featured:0' }],
    [{ text: '🔎 جستجوی آهنگ', callback_data: 'search' }, { text: '🔗 دانلود با لینک', callback_data: 'link' }],
    [{ text: '💬 پشتیبانی', url: 'https://t.me/AppModule' }],
  ] };
}

function songKeyboard(index, total, prefix) {
  const keyboard = [[{ text: '⬇️ دانلود آهنگ', callback_data: `download:${prefix}:${index}` }]];
  const nav = [];
  if (index > 0) nav.push({ text: '⬅️ قبلی', callback_data: `${prefix}:${index - 1}` });
  if (index + 1 < total) nav.push({ text: 'بعدی ➡️', callback_data: `${prefix}:${index + 1}` });
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '🏠 منوی اصلی', callback_data: 'home' }]);
  return { inline_keyboard: keyboard };
}

async function showSong(chatId, messageId, song, index, total, prefix) {
  const caption = musicCaption(song, index, total);
  const reply_markup = songKeyboard(index, total, prefix);
  if (song.photo && /^https?:\/\//i.test(song.photo)) {
    await api.editMessageMedia({ chat_id: chatId, message_id: messageId, media: { type: 'photo', media: song.photo, caption }, reply_markup });
  } else {
    await api.editMessageText({ chat_id: chatId, message_id: messageId, text: caption, reply_markup });
  }
}

export default async function (query) {
  if (!query?.id || !query?.message?.chat?.id) return;
  const chatId = Number(query.message.chat.id);
  const userId = Number(query.from?.id ?? chatId);
  const messageId = Number(query.message.message_id);
  const data = String(query.data ?? '');
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    if (data === 'home') {
      await clearSession(chatId, userId);
      await api.sendMessage({ chat_id: chatId, text: 'منوی اصلی ربات:', reply_markup: mainKeyboard() });
      return;
    }
    if (data === 'search') {
      await setSession(chatId, userId, 'awaiting_search', {});
      await api.sendMessage({ chat_id: chatId, text: 'نام آهنگ یا خواننده را وارد کن. برای لغو /cancel را بفرست.' });
      return;
    }
    if (data === 'link') {
      await setSession(chatId, userId, 'awaiting_link', {});
      await api.sendMessage({ chat_id: chatId, text: 'لینک آهنگ یا پلی‌لیست رادیو جوان را بفرست. برای لغو /cancel را بفرست.' });
      return;
    }
    if (data === 'admin:broadcast') {
      if (!ADMIN_IDS.includes(userId)) {
        await api.sendMessage({ chat_id: chatId, text: '⛔️ دسترسی ندارید.' });
        return;
      }
      await setSession(chatId, userId, 'awaiting_broadcast', {});
      await api.sendMessage({ chat_id: chatId, text: 'پیامی را که می‌خواهی برای کاربران ارسال شود بفرست. برای لغو /cancel را بزن.' });
      return;
    }
    if (data.startsWith('download:')) {
      const [, prefix, rawIndex] = data.split(':');
      const index = Number(rawIndex);
      const session = await getSession(chatId, userId);
      let songs = [];
      if (prefix === 'search' && session.state === 'search_results') songs = session.data.songs ?? [];
      if (prefix === 'featured' && session.state === 'featured_results') songs = session.data.songs ?? [];
      const song = songs[index];
      if (!song?.link) {
        await api.sendMessage({ chat_id: chatId, text: 'لینک دانلود این آهنگ در دسترس نیست. دوباره جستجو کن.' });
        return;
      }
      await api.sendChatAction({ chat_id: chatId, action: 'upload_audio' });
      await api.sendAudio({ chat_id: chatId, audio: song.link, title: song.title, performer: song.artist || undefined });
      await incrementDownloads(userId);
      return;
    }
    const match = data.match(/^(featured|search):(\d+)$/);
    if (!match) return;
    const prefix = match[1];
    const index = Number(match[2]);
    const session = await getSession(chatId, userId);
    let songs = [];
    if (prefix === 'search' && session.state === 'search_results') songs = session.data.songs ?? [];
    if (prefix === 'featured' && session.state === 'featured_results') songs = session.data.songs ?? [];
    if (!songs.length && prefix === 'featured') {
      songs = await getFeaturedSongs();
      await setSession(chatId, userId, 'featured_results', { songs });
    }
    if (!songs.length || index < 0 || index >= songs.length) {
      await api.sendMessage({ chat_id: chatId, text: 'نتیجه‌ای در دسترس نیست. دوباره تلاش کن.' });
      return;
    }
    await showSong(chatId, messageId, songs[index], index, songs.length, prefix);
  } catch (error) {
    console.log('Radio Javan callback error:', error?.message ?? error);
    await api.sendMessage({ chat_id: chatId, text: 'این عملیات انجام نشد. لطفاً دوباره تلاش کن.' });
  }
}