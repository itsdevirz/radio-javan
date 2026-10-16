import { fetch } from 'sdk';

const API_KEY = '40e87948bd4ef75efe61205ac5f468a9fd2b970511acf58c49706ecb984f1d67';
const RJ_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'x-api-key': API_KEY,
  'x-rj-user-agent': 'Radio Javan/4.0.2 com.radioJavan.rj.web',
  referer: 'https://play.radiojavan.com/browse/songs',
};

async function readJson(url, headers = RJ_HEADERS) {
  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) throw new Error(`Radio Javan returned HTTP ${response.status}`);
  return response.json();
}

function normalizeMusic(item) {
  return {
    id: item?.id ?? null,
    title: String(item?.title ?? 'بدون عنوان'),
    artist: String(item?.artist ?? ''),
    song: String(item?.song ?? item?.title ?? ''),
    link: item?.link ?? item?.url ?? null,
    photo: item?.photo ?? item?.image ?? null,
    plays: item?.plays ?? 0,
    likes: item?.likes ?? 0,
    dislikes: item?.dislikes ?? 0,
    downloads: item?.downloads ?? 0,
    duration: item?.duration ?? '',
  };
}

export async function getFeaturedSongs() {
  const data = await readJson('https://play.radiojavan.com/api/p/mp3s?type=featured&page=1');
  const items = Array.isArray(data) ? data : (data?.mp3s ?? data?.items ?? data?.results ?? []);
  return items.map(normalizeMusic).filter(item => item.link || item.id).slice(0, 30);
}

export async function searchSongs(query) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const data = await readJson('https://play.radiojavan.com/api/p/search?query=' + encodeURIComponent(q));
  const items = Array.isArray(data?.mp3s) ? data.mp3s : (Array.isArray(data?.results) ? data.results : []);
  return items.map(normalizeMusic).filter(item => item.link || item.id).slice(0, 20);
}

export function musicCaption(music, index, total) {
  const safe = value => String(value ?? '—').replace(/[<>]/g, '').slice(0, 250);
  return [
    `🎵 ${safe(music.title)}`,
    music.artist ? `🎤 خواننده: ${safe(music.artist)}` : '',
    music.song && music.song !== music.title ? `🎶 آهنگ: ${safe(music.song)}` : '',
    `👁 پخش: ${safe(music.plays)}  |  👍 پسند: ${safe(music.likes)}`,
    `⬇️ دانلود: ${safe(music.downloads)}`,
    index >= 0 && total > 0 ? `نتیجه ${index + 1} از ${total}` : '',
  ].filter(Boolean).join('\n');
}

export async function getMediaFromShareUrl(url) {
  const input = String(url ?? '').trim();
  if (!/^https?:\/\/(?:www\.)?(?:rj\.app|radiojavan\.com)\//i.test(input)) {
    throw new Error('لینک باید از rj.app یا radiojavan.com باشد.');
  }
  const response = await fetch(input, { headers: { accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`دریافت لینک ناموفق بود (HTTP ${response.status}).`);
  const html = await response.text();
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('اطلاعات آهنگ در این صفحه پیدا نشد؛ ممکن است لینک منقضی یا صفحه تغییر کرده باشد.');
  let root;
  try { root = JSON.parse(match[1]); } catch { throw new Error('اطلاعات صفحه قابل خواندن نیست.'); }
  const media = root?.props?.pageProps?.media;
  if (!media) throw new Error('این لینک به یک فایل موسیقی پشتیبانی‌شده اشاره نمی‌کند.');
  const mediaUrl = media.link || media.url;
  if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) throw new Error('لینک مستقیم فایل در دسترس نیست.');
  return {
    title: String(media.title ?? 'بدون عنوان'),
    artist: String(media.artist ?? media.podcast_artist ?? ''),
    song: String(media.song ?? media.title ?? ''),
    photo: media.photo ?? null,
    link: mediaUrl,
    date: media.date_added ?? media.date ?? '',
  };
}

export async function getPlaylist(url) {
  const input = String(url ?? '').trim();
  if (!/^https?:\/\/(?:www\.)?(?:rj\.app|radiojavan\.com)\//i.test(input)) {
    throw new Error('لینک پلی‌لیست معتبر نیست.');
  }
  const response = await fetch(input, { headers: { accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`دریافت پلی‌لیست ناموفق بود (HTTP ${response.status}).`);
  const html = await response.text();
  const canonical = html.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  const canonicalUrl = canonical?.[1] || input;
  const idMatch = canonicalUrl.match(/\/mp3\/([^/?#]+)/i) || input.match(/\/mp3\/([^/?#]+)/i);
  if (!idMatch) throw new Error('شناسه پلی‌لیست از لینک قابل استخراج نیست.');
  const data = await readJson('https://play.radiojavan.com/api/p/mp3_playlist_with_items?id=' + encodeURIComponent(idMatch[1]));
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    title: String(data?.title ?? 'پلی‌لیست'),
    photo: data?.photo ?? null,
    count: Number(data?.count ?? items.length),
    items: items.map(normalizeMusic).filter(item => item.link).slice(0, 10),
  };
}