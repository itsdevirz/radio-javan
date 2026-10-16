import { api } from 'sdk';
import { registerUser, getSession, setSession, clearSession, getUserCount, getUserIds } from '../lib/store.js';
import { getFeaturedSongs, searchSongs, getMediaFromShareUrl, getPlaylist, musicCaption } from '../lib/radiojavan.js';

const ADMIN_IDS = [1913245253];
const SUPPORT_CHANNEL = '@RadioMusicIRZ';
const SUPPORT_URL = 'https://t.me/RadioMusicIRZ';

function mainKeyboard() {
  return { inline_keyboard: [
    [{ text: '🎵 جدیدترین آهنگ‌ها', callback_data: 'featured:0' }],
    [{ text: '🔎 جستجوی آهنگ', callback_data: 'search' }, { text: '🔗 دانلود با لینک', callback_data: 'link' }],
    [{ text: '💬 پشتیبانی', url: 'https://t.me/AppModule' }],
  ] };
}

function songKeyboard(index, total, prefix = 'featured') {
  const row = [];
  row.push({ text: '⬇️ دانلود آهنگ', callback_data: `download:${prefix}:${index}` });
  const nav = [];
  if (index > 0) nav.push({ text: '⬅️ قبلی', callback_data: `${prefix}:${index - 1}` });
  if (index + 1 < total) nav.push({ text: 'بعدی ➡️', callback_data: `${prefix}:${index + 1}` });
  const keyboard = [row];
  if (nav.length) keyboard.push(nav);
  keyboard.push([{ text: '🏠 منوی اصلی', callback_data: 'home' }]);
  return { inline_keyboard: keyboard };
}

async function sendHome(chatId) {
  await api.sendMessage({ chat_id: chatId, text: 'سلام! 👋\nبه ربات دانلود و جستجوی موسیقی رادیو جوان خوش آمدی.\nاز منوی زیر استفاده کن:', reply_markup: mainKeyboard() });
}

async function isMember(userId) {
  try {
    const member = await api.getChatMember({ chat_id: SUPPORT_CHANNEL, user_id: userId });
    return !['left', 'kicked'].includes(member.status);
  } catch (error) {
    console.log('Membership check failed:', error?.message ?? error);
    return true; // Do not lock out all users if the channel lookup is unavailable.
  }
}

async function sendSong(chatId, music, index, total, prefix, messageId = undefined) {
  const caption = musicCaption(music, index, total);
  const reply_markup = songKeyboard(index, total, prefix);
  if (music.photo && /^https?:\/\//i.test(music.photo)) {
    if (messageId) {
      await api.editMessageMedia({
        chat_id: chatId, message_id: messageId,
        media: { type: 'photo', media: music.photo, caption },
        reply_markup,
      });
    } else {
      await api.sendPhoto({ chat_id: chatId, photo: music.photo, caption, reply_markup });
    }
  } else if (messageId) {
    await api.editMessageCaption({ chat_id: chatId, message_id: messageId, caption, reply_markup });
  } else {
    await api.sendMessage({ chat_id: chatId, text: caption, reply_markup });
  }
}

async function handleLink(message, text) {
  const chatId = message.chat.id;
  await api.sendChatAction({ chat_id: chatId, action: 'typing' });
  try {
    if (/\/pm\//i.test(text) || /\/playlist\//i.test(text)) {
      const playlist = await getPlaylist(text);
      if (!playlist.items.length) {
        await api.sendMessage({ chat_id: chatId, text: 'در این پلی‌لیست آهنگ قابل دانلودی پیدا نشد.' });
        return;
      }
      if (playlist.photo && /^https?:\/\//i.test(playlist.photo)) {
        await api.sendPhoto({ chat_id: chatId, photo: playlist.photo, caption: `🎶 ${playlist.title}\nتعداد آهنگ‌های قابل ارسال: ${playlist.items.length}` });
      } else {
        await api.sendMessage({ chat_id: chatId, text: `🎶 ${playlist.title}\nتعداد آهنگ‌های قابل ارسال: ${playlist.items.length}` });
      }
      for (const item of playlist.items) {
        try {
          await api.sendAudio({ chat_id: chatId, audio: item.link, title: item.title, performer: item.artist || undefined });
        } catch (error) {
          await api.sendMessage({ chat_id: chatId, text: `ارسال «${item.title}» ناموفق بود. لینک: ${item.link}` });
        }
      }
      return;
    }
    const media = await getMediaFromShareUrl(text);
    if (media.photo && /^https?:\/\//i.test(media.photo)) {
      await api.sendPhoto({ chat_id: chatId, photo: media.photo, caption: `🎵 ${media.title}\n🎤 ${media.artist || 'نامشخص'}` });
    }
    await api.sendAudio({ chat_id: chatId, audio: media.link, title: media.title, performer: media.artist || undefined });
  } catch (error) {
    await api.sendMessage({ chat_id: chatId, text: `نتوانستم این لینک را پردازش کنم.\n${String(error?.message ?? 'خطای ناشناخته').slice(0, 500)}\n\nلطفاً لینک عمومی و معتبر آهنگ یا پلی‌لیست رادیو جوان را بفرست.` });
  }
}

async function handleBroadcast(message, userId) {
  if (!ADMIN_IDS.includes(Number(userId))) {
    await api.sendMessage({ chat_id: message.chat.id, text: '⛔️ دسترسی ندارید.' });
    return;
  }
  const ids = await getUserIds();
  let sent = 0, failed = 0;
  await api.sendMessage({ chat_id: message.chat.id, text: `شروع ارسال همگانی برای ${ids.length} کاربر. این کار ممکن است به محدودیت نرخ تلگرام بخورد.` });
  for (let i = 0; i < ids.length; i += 15) {
    const batch = ids.slice(i, i + 15);
    const results = await Promise.all(batch.map(async id => {
      try {
        await api.copyMessage({ chat_id: id, from_chat_id: message.chat.id, message_id: message.message_id });
        return true;
      } catch { return false; }
    }));
    sent += results.filter(Boolean).length;
    failed += results.length - results.filter(Boolean).length;
  }
  await api.sendMessage({ chat_id: message.chat.id, text: `ارسال همگانی تمام شد.\nموفق: ${sent}\nناموفق: ${failed}` });
}

export default async function (message) {
  if (!message?.chat?.id) return;
  const chatId = Number(message.chat.id);
  const userId = Number(message.from?.id ?? chatId);
  const text = String(message.text ?? '').trim();
  try {
    if (message.from && message.chat.type === 'private') await registerUser(message.from, chatId);
    const session = await getSession(chatId, userId);

    if (text === '/cancel') {
      await clearSession(chatId, userId);
      await api.sendMessage({ chat_id: chatId, text: 'عملیات لغو شد.', reply_markup: mainKeyboard() });
      return;
    }

    if (text.startsWith('/start')) {
      await clearSession(chatId, userId);
      if (message.chat.type === 'private' && !(await isMember(userId))) {
        await api.sendMessage({ chat_id: chatId, text: 'برای استفاده از ربات ابتدا در کانال پشتیبانی عضو شو و دوباره /start را بزن.', reply_markup: { inline_keyboard: [[{ text: 'عضویت در کانال', url: SUPPORT_URL }]] } });
        return;
      }
      await sendHome(chatId);
      return;
    }

    if (text === '/admin') {
      if (!ADMIN_IDS.includes(userId)) {
        await api.sendMessage({ chat_id: chatId, text: '⛔️ دسترسی ندارید.' });
        return;
      }
      await api.sendMessage({ chat_id: chatId, text: `👑 پنل مدیریت\nکاربران ثبت‌شده: ${await getUserCount()}`, reply_markup: { inline_keyboard: [[{ text: '📢 ارسال پیام همگانی', callback_data: 'admin:broadcast' }], [{ text: '🏠 منوی اصلی', callback_data: 'home' }]] } });
      return;
    }

    if (session.state === 'awaiting_search') {
      await clearSession(chatId, userId);
      if (!text || text.startsWith('/')) {
        await api.sendMessage({ chat_id: chatId, text: 'لطفاً نام آهنگ یا خواننده را به صورت متن بفرست.' });
        return;
      }
      await api.sendChatAction({ chat_id: chatId, action: 'typing' });
      const songs = await searchSongs(text);
      if (!songs.length) {
        await api.sendMessage({ chat_id: chatId, text: 'آهنگی پیدا نشد. نام دیگری را امتحان کن.' });
        return;
      }
      await setSession(chatId, userId, 'search_results', { songs });
      await sendSong(chatId, songs[0], 0, songs.length, 'search');
      return;
    }

    if (session.state === 'awaiting_link') {
      await clearSession(chatId, userId);
      await handleLink(message, text);
      return;
    }

    if (session.state === 'awaiting_broadcast' && ADMIN_IDS.includes(userId)) {
      await clearSession(chatId, userId);
      await handleBroadcast(message, userId);
      return;
    }

    if (text && !text.startsWith('/')) {
      await api.sendMessage({ chat_id: chatId, text: 'برای شروع جستجو یا دانلود از منوی زیر استفاده کن.', reply_markup: mainKeyboard() });
    }
  } catch (error) {
    console.log('Radio Javan message handler error:', error?.message ?? error);
    await api.sendMessage({ chat_id: chatId, text: 'یک خطای موقت رخ داد. لطفاً دوباره تلاش کن یا /start را بزن.' });
  }
}