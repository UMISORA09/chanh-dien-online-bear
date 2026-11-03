// Chánh Điện Tịnh Tâm — LIVE Server (Phiên bản Nâng Cấp Toàn Diện)
// Máy chủ phát sóng: phục vụ overlay 9:16 + bảng điều khiển chuyên nghiệp,
// kết nối phòng TikTok LIVE tự động, quản lý Phật tử an tọa, lưu bảng Công Đức bền vững,
// phát âm thanh chuông mõ Web Audio, tạo giọng đọc tiếng Việt Microsoft Edge TTS mượt mà.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TTS_DIR = path.join(__dirname, 'tts');
const MERIT_FILE = path.join(__dirname, 'merit.json');

// Khởi tạo thư mục TTS và dọn file cũ
fs.mkdirSync(TTS_DIR, { recursive: true });
for (const f of fs.readdirSync(TTS_DIR)) {
  try { fs.unlinkSync(path.join(TTS_DIR, f)); } catch {}
}

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

/* ------------------------------------------------------------------ Lưu trữ Công Đức (Persistence) */
let meritStore = {}; // id -> { id, name, coins, lastAt, avatar }
function loadMerit() {
  try {
    if (fs.existsSync(MERIT_FILE)) {
      meritStore = JSON.parse(fs.readFileSync(MERIT_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('[Merit] Không thể đọc merit.json, khởi tạo mới:', e.message);
    meritStore = {};
  }
}
let meritSaveTimer = null;
function saveMerit() {
  clearTimeout(meritSaveTimer);
  meritSaveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(MERIT_FILE, JSON.stringify(meritStore, null, 2), 'utf8');
    } catch (e) {
      console.error('[Merit] Lỗi ghi file merit.json:', e.message);
    }
  }, 1000);
}
loadMerit();

/* ------------------------------------------------------------------ Trạng thái & Cài đặt */
const settings = {
  title: 'Chánh Điện Tịnh Tâm',
  subtitle: 'Nam Mô A Di Đà Phật',
  voice: 'vi-VN-NamMinhNeural',      // vi-VN-NamMinhNeural hoặc vi-VN-HoaiMyNeural
  pitch: -18,                        // Hz
  rate: -20,                         // %
  music: true,
  mo: true,
  moBpm: 52,
  autoChant: true,
  chantEveryMin: 3,
  seatMode: 'auto',                  // auto | 24 | 36 | 64 | 100
  joinOnEnter: false,                // cho người mới vào phòng an tọa ngay
  autoReconnect: true,               // tự động kết nối lại khi rớt mạng TikTok
  gifts: { readAll: true, minDiamonds: 1 },
  // Bộ mixer âm thanh (0-100%)
  volume: {
    master: 85,
    music: 50,
    mo: 75,
    bell: 85,
    tts: 100
  }
};

const viewers = new Map();           // id -> { id, name, skin, avatar, coins, joinedAt, lastAt, lastText, lastTextAt, demo }
const startedAt = Date.now();
let tiktok = null;
let tiktokState = { status: 'idle', uniqueId: '', error: '', roomId: '' };
let reconnectTimer = null;
let reconnectAttempts = 0;

const log = [];
function addLog(s) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${s}`;
  log.push(line);
  if (log.length > 400) log.shift();
  broadcast({ t: 'log', line }, 'control');
  console.log(line);
}

const CAPS = [24, 36, 64, 100];
function capacity() {
  if (settings.seatMode !== 'auto') return +settings.seatMode;
  const n = viewers.size;
  return CAPS.find(c => n <= c) || 100;
}

/* ------------------------------------------------------------- Nhận diện Y phục (Skins) */
const SKIN_WORDS = [
  ['master', ['cao tăng', 'cao tang', 'hoa thuong', 'hòa thượng']],
  ['monk', ['sư', 'su', 'sư thầy', 'su thay', 'thầy', 'thay', 'chu tang', 'chư tăng']],
  ['nun', ['ni', 'ni cô', 'ni co', 'sư cô', 'su co', 'chư ni']],
  ['child', ['tiểu', 'tieu', 'chú tiểu', 'chu tieu', 'bé', 'be', 'đồng nhi']],
  ['granny', ['bà', 'ba', 'áo nâu', 'ao nau', 'cụ', 'cu', 'bác', 'bac']],
  ['woman', ['nữ', 'nu', 'chị', 'chi', 'gái', 'gai', 'cô', 'co']],
  ['man', ['nam', 'anh', 'trai', 'chu', 'chú']],
];

function skinFromText(t) {
  const w = String(t || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!w || w.split(' ').length > 3) return null;
  for (const [skin, words] of SKIN_WORDS) {
    if (words.some(k => w === k || w.startsWith(k + ' '))) return skin;
  }
  return null;
}

const DEFAULT_SKINS = ['man', 'woman', 'woman', 'man', 'granny'];

function pub(v) {
  return { id: v.id, name: v.name, skin: v.skin, avatar: v.avatar || '', coins: v.coins, demo: !!v.demo };
}

function snapshot() {
  return {
    t: 'state',
    settings,
    viewers: [...viewers.values()].map(pub),
    cap: capacity(),
    startedAt,
    tiktok: tiktokState,
    meritTop: getMeritLeaderboard(10)
  };
}

function getMeritLeaderboard(limit = 10) {
  return Object.values(meritStore)
    .sort((a, b) => (b.coins || 0) - (a.coins || 0))
    .slice(0, limit);
}

/* ------------------------------------------------------------- Xếp chỗ an tọa (Seating) */
function seat(id, name, opts = {}) {
  let v = viewers.get(id);
  const cleanName = String(name || id || 'Phật tử').trim().slice(0, 18);

  if (v) {
    v.lastAt = Date.now();
    if (opts.avatar) v.avatar = opts.avatar;
    if (cleanName && cleanName !== 'ẩn danh') v.name = cleanName;
    return { v, isNew: false };
  }

  // Nếu đã kín 100 chỗ: người không tặng quà và im lặng lâu nhất sẽ nhường chỗ
  if (viewers.size >= 100) {
    const quiet = [...viewers.values()]
      .filter(x => x.coins === 0 && !x.demo)
      .sort((a, b) => a.lastAt - b.lastAt)[0];
    if (quiet) {
      viewers.delete(quiet.id);
      broadcast({ t: 'leave', id: quiet.id });
    }
  }

  // Khôi phục điểm công đức đã lưu nếu có
  const savedMerit = meritStore[id];
  const initialCoins = savedMerit ? (savedMerit.coins || 0) : 0;

  v = {
    id,
    name: cleanName,
    skin: opts.skin || DEFAULT_SKINS[viewers.size % DEFAULT_SKINS.length],
    avatar: opts.avatar || (savedMerit ? savedMerit.avatar : '') || '',
    coins: initialCoins,
    joinedAt: Date.now(),
    lastAt: Date.now(),
    demo: !!opts.demo
  };

  viewers.set(id, v);
  broadcast({ t: 'join', v: pub(v), cap: capacity() });
  return { v, isNew: true };
}

/* ------------------------------------------------------------- Xử lý sự kiện tương tác */
function onChat(id, name, text, avatar) {
  text = String(text || '').slice(0, 120);
  const want = skinFromText(text);
  const { v, isNew } = seat(id, name, { avatar, skin: want || undefined });
  if (!v) return;

  if (!isNew && want && want !== v.skin) {
    v.skin = want;
    broadcast({ t: 'skin', id, skin: want });
  }

  v.lastText = text;
  v.lastTextAt = Date.now();
  broadcast({ t: 'chat', id, name: v.name, text });
}

function onGift(id, name, giftName, count, diamonds, avatar) {
  giftName = String(giftName || 'quà').slice(0, 30);
  count = Math.max(1, Math.min(9999, +count || 1));
  const { v } = seat(id, name, { avatar });
  if (!v) return;

  const coins = Math.max(1, (diamonds || 1) * count);
  v.coins += coins;

  // Cập nhật và lưu bảng công đức lâu dài
  meritStore[id] = {
    id,
    name: v.name,
    coins: v.coins,
    avatar: v.avatar || '',
    lastAt: Date.now()
  };
  saveMerit();

  const prayer = (v.lastText && Date.now() - v.lastTextAt < 90_000 && v.lastText.length > 6)
    ? v.lastText
    : pickPrayer();
  const tier = coins >= 99 ? 3 : coins >= 10 ? 2 : 1;
  const line = `Nam mô A Di Đà Phật. Phật tử ${spoken(v.name)} thành tâm dâng ${giftName}${count > 1 ? ', ' + count + ' lần' : ''}. ${prayer}.`;

  broadcast({
    t: 'gift',
    id,
    name: v.name,
    giftName,
    count,
    coins,
    total: v.coins,
    tier,
    prayer,
    meritTop: getMeritLeaderboard(10)
  });

  // Kích hoạt chuông khi nhận quà lớn
  if (tier >= 3) {
    broadcast({ t: 'bell', big: true });
  } else if (tier >= 2) {
    broadcast({ t: 'bell', big: false });
  }

  if (settings.gifts.readAll || coins >= settings.gifts.minDiamonds) {
    say(line, { tag: 'gift', id });
  }
}

const PRAYERS = [
  'Nguyện cầu gia đạo bình an, vạn sự cát tường hanh thông',
  'Nguyện cầu cha mẹ mạnh khỏe, tăng phúc tăng thọ',
  'Nguyện hồi hướng công đức này cho khắp pháp giới chúng sinh',
  'Nguyện cầu thân tâm an lạc, phiền não đoạn trừ, trí tuệ khai mở',
  'Nguyện cầu công việc thuận buồm xuôi gió, gia đình ấm no hạnh phúc',
  'Nguyện cầu tiêu trừ tai ương bệnh tật, tật ách tiêu tan',
  'Nguyện cầu thế giới hòa bình, nhân dân an lạc',
  'Nguyện cầu sở cầu như ý, sở nguyện tòng tâm, phước duyên tăng trưởng'
];

function pickPrayer() {
  return PRAYERS[Math.floor(Math.random() * PRAYERS.length)];
}

const spoken = s => String(s)
  .replace(/[_@.]+/g, ' ')
  .replace(/[^\p{L}\p{N}\s]/gu, '')
  .trim() || 'ẩn danh';

/* ------------------------------------------------------------------ Giọng đọc Edge TTS */
const ttsQueue = [];
let ttsBusy = false;
let ttsSeq = 0;

function esc(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

function say(text, meta = {}) {
  if (ttsQueue.length >= 20) {
    addLog('Hàng đợi giọng đọc đã đầy, bỏ qua bớt 1 câu');
    return;
  }
  ttsQueue.push({ text: String(text).slice(0, 600), meta });
  pumpTTS();
}

async function pumpTTS() {
  if (ttsBusy || !ttsQueue.length) return;
  ttsBusy = true;
  const { text, meta } = ttsQueue.shift();

  try {
    const file = `tts_${Date.now()}_${++ttsSeq}.mp3`;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(esc(text), {
      pitch: `${settings.pitch >= 0 ? '+' : ''}${settings.pitch}Hz`,
      rate: `${settings.rate >= 0 ? '+' : ''}${settings.rate}%`
    });

    const chunks = [];
    await new Promise((res, rej) => {
      audioStream.on('data', c => chunks.push(c));
      audioStream.on('close', res);
      audioStream.on('error', rej);
    });

    try { tts.close(); } catch {}
    fs.writeFileSync(path.join(TTS_DIR, file), Buffer.concat(chunks));

    broadcast({ t: 'tts', url: `/live/tts/${file}`, text, ...meta });

    // Dọn dẹp file TTS cũ (giữ tối đa 40 file gần nhất)
    const old = fs.readdirSync(TTS_DIR).sort();
    while (old.length > 40) {
      try { fs.unlinkSync(path.join(TTS_DIR, old.shift())); } catch {}
    }
  } catch (e) {
    addLog('TTS lỗi: ' + (e?.message || e));
  }

  ttsBusy = false;
  setTimeout(pumpTTS, 60);
}

/* ------------------------------------------------------------------ Kho Bài Tụng Kinh (Chants) */
const CHANTS = [
  {
    title: 'Hồi Hướng Công Đức',
    text: 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật. Nguyện đem công đức này, hướng về khắp tất cả, đệ tử và chúng sinh, đều trọn thành Phật đạo.'
  },
  {
    title: 'Phát Nguyện Vãng Sanh',
    text: 'Nam mô A Di Đà Phật. Nguyện sanh Tây Phương Tịnh Độ trung, cửu phẩm liên hoa vi phụ mẫu. Hoa khai kiến Phật ngộ vô sanh, bất thoái Bồ Tát vi bạn lữ.'
  },
  {
    title: 'Tâm Kinh Bát Nhã',
    text: 'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách. Xá Lợi Tử, sắc bất dị không, không bất dị sắc.'
  },
  {
    title: 'Đại Bi Thần Chú',
    text: 'Nam mô Đại Bi Quán Thế Âm Bồ Tát. Nguyện cho khắp pháp giới chúng sinh thân tâm thường an lạc, dứt trừ mọi ưu phiền, tai qua nạn khỏi, cát tường như ý.'
  },
  {
    title: 'Sám Hối Hồng Danh',
    text: 'Đệ tử chúng con từ vô thỉ kiếp, do tham sân si, gây bao tội lỗi. Nay đối trước Tam Bảo, chí tâm thành kính phát lồ sám hối, nguyện không tái phạm.'
  },
  {
    title: 'Dược Sư Cầu An',
    text: 'Nam mô Dược Sư Lưu Ly Quang Vương Phật. Nguyện ánh sáng từ quang của ngài xua tan mọi tật bệnh, ban rải an vui, thân tâm thanh tịnh cho muôn loài.'
  }
];

let chantIdx = 0;
let chantTimer = null;

function chant(index) {
  const item = (typeof index === 'number' && CHANTS[index]) ? CHANTS[index] : CHANTS[chantIdx++ % CHANTS.length];
  broadcast({ t: 'chant', text: item.text, title: item.title });
  say(item.text, { tag: 'chant' });
  addLog(`📿 Tụng kinh: ${item.title}`);
}

function scheduleChant() {
  clearInterval(chantTimer);
  if (settings.autoChant) {
    chantTimer = setInterval(() => chant(), Math.max(1, settings.chantEveryMin) * 60_000);
  }
}
scheduleChant();

/* --------------------------------------------------------------- TikTok Connector & Auto-Reconnect */
let TikTokLib = null;

async function connectTikTok(uniqueId) {
  clearTimeout(reconnectTimer);
  uniqueId = String(uniqueId || '')
    .trim()
    .replace(/^.*tiktok\.com\/@?/i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  if (!uniqueId) return;

  await disconnectTikTok(false);
  tiktokState = { status: 'connecting', uniqueId, error: '', roomId: '' };
  broadcast({ t: 'tiktok', ...tiktokState });

  try {
    TikTokLib ||= await import('tiktok-live-connector');
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = TikTokLib;

    const conn = new TikTokLiveConnection(uniqueId, {
      enableExtendedGiftInfo: true,
      processInitialData: false
    });

    const av = u => u?.profilePicture?.url?.[0] || u?.profilePicture?.urlList?.[0] || u?.avatarThumb?.urlList?.[0] || u?.avatarThumb?.url?.[0] || '';
    const nm = u => u?.nickname || u?.uniqueId || 'ẩn danh';

    conn.on(WebcastEvent.CHAT, d => {
      onChat(d.user?.uniqueId || d.user?.userId, nm(d.user), d.comment, av(d.user));
    });

    conn.on(WebcastEvent.GIFT, d => {
      const type = d.giftDetails?.giftType ?? d.extendedGiftInfo?.type;
      if (type === 1 && !d.repeatEnd) return; // Streak vẫn đang nhảy
      const gname = d.giftDetails?.giftName || d.extendedGiftInfo?.name || 'quà';
      const dia = d.giftDetails?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1;
      onGift(d.user?.uniqueId || d.user?.userId, nm(d.user), gname, d.repeatCount || 1, dia, av(d.user));
      addLog(`🎁 ${nm(d.user)} dâng ${gname} x${d.repeatCount || 1} (${dia * (d.repeatCount || 1)} ✧)`);
    });

    conn.on(WebcastEvent.MEMBER, d => {
      if (settings.joinOnEnter) {
        seat(d.user?.uniqueId, nm(d.user), { avatar: av(d.user) });
      }
    });

    conn.on(WebcastEvent.LIKE, d => {
      broadcast({ t: 'like', id: d.user?.uniqueId, n: d.likeCount || 1 });
    });

    conn.on(WebcastEvent.SHARE, d => {
      addLog(`🔗 ${nm(d.user)} đã chia sẻ phòng live!`);
      broadcast({ t: 'share', id: d.user?.uniqueId, name: nm(d.user) });
    });

    conn.on(WebcastEvent.FOLLOW, d => {
      addLog(`🌟 ${nm(d.user)} vừa theo dõi kênh!`);
      broadcast({ t: 'follow', id: d.user?.uniqueId, name: nm(d.user) });
    });

    conn.on(ControlEvent.DISCONNECTED, () => {
      tiktokState = { ...tiktokState, status: 'disconnected' };
      broadcast({ t: 'tiktok', ...tiktokState });
      addLog('TikTok: Mất kết nối phòng live');
      scheduleReconnect(uniqueId);
    });

    conn.on(ControlEvent.ERROR, e => {
      addLog('TikTok cảnh báo: ' + (e?.info || e?.message || e));
    });

    const st = await conn.connect();
    tiktok = conn;
    reconnectAttempts = 0;
    tiktokState = { status: 'connected', uniqueId, error: '', roomId: st?.roomId || '' };
    addLog(`✅ Đã kết nối thành công phòng live @${uniqueId}`);
  } catch (e) {
    tiktokState = { status: 'error', uniqueId, error: String(e?.message || e) };
    addLog(`❌ Không kết nối được @${uniqueId}: ${tiktokState.error}`);
    scheduleReconnect(uniqueId);
  }

  broadcast({ t: 'tiktok', ...tiktokState });
}

function scheduleReconnect(uniqueId) {
  if (!settings.autoReconnect || !uniqueId) return;
  reconnectAttempts++;
  const delay = Math.min(60000, 5000 * Math.pow(1.5, Math.min(reconnectAttempts, 6)));
  addLog(`🔄 Sẽ tự động thử kết nối lại sau ${Math.round(delay / 1000)}s (lần ${reconnectAttempts})...`);
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (tiktokState.status !== 'connected') {
      connectTikTok(uniqueId);
    }
  }, delay);
}

async function disconnectTikTok(userInitiated = true) {
  if (userInitiated) {
    clearTimeout(reconnectTimer);
    reconnectAttempts = 0;
  }
  if (tiktok) {
    try { await tiktok.disconnect(); } catch {}
    tiktok = null;
  }
  tiktokState = { status: 'idle', uniqueId: '', error: '', roomId: '' };
  broadcast({ t: 'tiktok', ...tiktokState });
}

/* ------------------------------------------------------------- Dữ liệu Phật tử mẫu (Demo Crowd) */
const DEMO_NAMES = [
  'Diệu Hạnh', 'Minh Tâm', 'Thiện Đức', 'Huệ An', 'Tịnh Nhã', 'Quảng Trí', 'Chơn Như', 'Pháp Hỷ',
  'Nguyên Thanh', 'Tâm Đăng', 'Diệu Liên', 'Trí Hải', 'Phước Lộc', 'Hạnh Nguyện', 'Như Ý', 'Bảo Châu',
  'Thanh Lương', 'Từ Tâm', 'An Lạc', 'Giác Hoa', 'Tuệ Minh', 'Liên Hương', 'Thu Hà', 'Ngọc Lan',
  'Đức Anh', 'Hải Đăng', 'Mai Anh', 'Phương Thảo', 'Trung Kiên', 'Quang Huy', 'Bảo Ngọc', 'Diệu Linh'
];

function fillDemo(n) {
  const have = [...viewers.values()].filter(v => v.demo).length;
  for (let i = have; i < n && viewers.size < 100; i++) {
    const name = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ' ' + (Math.floor(i / DEMO_NAMES.length) + 1) : '');
    seat('demo_' + i, name, {
      demo: true,
      skin: ['man', 'woman', 'woman', 'man', 'granny', 'monk', 'nun', 'child'][i % 8]
    });
  }
}

function clearSeats() {
  viewers.clear();
  broadcast(snapshot());
  addLog('Đã dọn trống toàn bộ bồ đoàn');
}

function resetMerit() {
  meritStore = {};
  for (const v of viewers.values()) {
    v.coins = 0;
  }
  saveMerit();
  broadcast({ t: 'meritReset', meritTop: [] });
  addLog('✨ Đã làm mới bảng Công Đức về 0');
}

/* ------------------------------------------------------------- Xử lý lệnh từ Bảng Điều Khiển */
function onControl(m) {
  switch (m.cmd) {
    case 'connect':
      connectTikTok(m.uniqueId);
      break;
    case 'disconnect':
      disconnectTikTok(true);
      addLog('Đã ngắt kết nối TikTok');
      break;
    case 'chat': {
      const n = String(m.name || 'Khách').slice(0, 18);
      onChat('sim_' + n, n, String(m.text || 'Nam mô A Di Đà Phật').slice(0, 120));
      break;
    }
    case 'gift': {
      const n = String(m.name || 'Khách').slice(0, 18);
      onGift('sim_' + n, n, String(m.gift || 'Hoa hồng').slice(0, 30), clamp(m.count, 1, 99), clamp(m.diamonds, 1, 50000));
      break;
    }
    case 'fill':
      fillDemo(clamp(m.n, 1, 100));
      addLog(`Đổ Phật tử mẫu: tổng cộng ${viewers.size} người`);
      break;
    case 'clear':
      clearSeats();
      break;
    case 'resetMerit':
      resetMerit();
      break;
    case 'bell':
      broadcast({ t: 'bell', big: !!m.big });
      break;
    case 'deepBell':
      broadcast({ t: 'deepBell' });
      break;
    case 'mo':
      broadcast({ t: 'mo1' });
      break;
    case 'khanh':
      broadcast({ t: 'khanh' });
      break;
    case 'chant':
      chant(m.index);
      break;
    case 'say':
      if (m.text) say(String(m.text).slice(0, 500), { tag: 'say' });
      break;
    case 'settings':
      applySettings(m.settings || {});
      scheduleChant();
      broadcast({ t: 'settings', settings, cap: capacity() });
      break;
    case 'bots':
      setBots(!!m.on, +m.n || 12, m.pace);
      break;
  }
}

const SETTING_RULES = {
  title: v => String(v).slice(0, 40),
  subtitle: v => String(v).slice(0, 60),
  voice: v => ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'].includes(v) ? v : settings.voice,
  pitch: v => clamp(v, -50, 50),
  rate: v => clamp(v, -50, 50),
  moBpm: v => clamp(v, 20, 120),
  chantEveryMin: v => clamp(v, 1, 60),
  music: Boolean,
  mo: Boolean,
  autoChant: Boolean,
  joinOnEnter: Boolean,
  autoReconnect: Boolean,
  seatMode: v => ['auto', '24', '36', '64', '100'].includes(String(v)) ? String(v) : 'auto',
  volume: v => {
    if (!v || typeof v !== 'object') return settings.volume;
    return {
      master: clamp(v.master ?? settings.volume.master, 0, 100),
      music: clamp(v.music ?? settings.volume.music, 0, 100),
      mo: clamp(v.mo ?? settings.volume.mo, 0, 100),
      bell: clamp(v.bell ?? settings.volume.bell, 0, 100),
      tts: clamp(v.tts ?? settings.volume.tts, 0, 100)
    };
  }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));

function applySettings(o) {
  for (const [k, fn] of Object.entries(SETTING_RULES)) {
    if (k in o) settings[k] = fn(o[k]);
  }
}

/* ----------------------------------------------------------------- Bot mô phỏng thông minh */
let botTimer = null;
const BOT_LINES = [
  'Nam mô A Di Đà Phật', 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật', 'Cầu cho gia đình bình an, mạnh khỏe',
  'Con xin thành tâm sám hối', 'nữ', 'nam', 'bà', 'sư', 'tiểu', 'Nguyện cha mẹ tăng long phúc thọ',
  'Mô Phật, an lạc quá', 'Chúc toàn thể đại chúng vạn sự như ý', 'Cầu cho công việc thuận lợi hanh thông',
  'Nam mô Quán Thế Âm Bồ Tát cứu khổ cứu nạn', 'Xin hồi hướng công đức cho tổ tiên ông bà'
];

function setBots(on, n, pace) {
  clearInterval(botTimer);
  botTimer = null;
  if (on) {
    n = clamp(n, 1, 100);
    for (let i = 0; i < n; i++) {
      seat('bot_' + i, DEMO_NAMES[(i + 7) % DEMO_NAMES.length] + ' ·bot', { demo: true });
    }
    const every = { slow: 4000, mid: 1800, fast: 700 }[pace] || 1800;
    botTimer = setInterval(() => {
      const ids = [...viewers.keys()].filter(id => id.startsWith('bot_'));
      if (!ids.length) return;
      const id = ids[Math.floor(Math.random() * ids.length)];
      const v = viewers.get(id);
      const r = Math.random();

      if (r < 0.60) {
        onChat(id, v.name, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]);
      } else if (r < 0.88) {
        broadcast({ t: 'like', id, n: 1 + Math.floor(Math.random() * 4) });
      } else if (r < 0.98) {
        onGift(id, v.name, 'Hoa hồng', 1 + Math.floor(Math.random() * 3), 1);
      } else {
        onGift(id, v.name, 'Đèn hoa sen', 1, 30);
      }
    }, every);
    addLog(`🤖 Đã bật ${n} bot tương tác tự động (${pace})`);
  } else {
    for (const id of [...viewers.keys()]) {
      if (id.startsWith('bot_')) {
        viewers.delete(id);
        broadcast({ t: 'leave', id });
      }
    }
    addLog('🤖 Đã dừng toàn bộ bot mô phỏng');
  }
  broadcast({ t: 'bots', on }, 'control');
}

/* -------------------------------------------------------------- HTTP & WebSocket Server */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const okHost = h => ALLOWED_HOSTS.has(String(h || '').toLowerCase());
const SEP = path.sep;

function resolveStatic(urlPath) {
  let p = urlPath === '/' ? '/live/control.html' : urlPath;
  if (p === '/index.html' || p === '/web') {
    return path.join(ROOT, 'index.html');
  }
  if (!/^\/(assets|live)\//.test(p)) return null;
  if (p.split('/').some(seg => seg.startsWith('.') || seg === 'node_modules')) return null;
  if (/\.(mjs|json|md|log)$/i.test(p) && !p.startsWith('/assets/')) return null;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + SEP)) return null;
  return file;
}

const server = http.createServer((req, res) => {
  if (!okHost(req.headers.host)) {
    res.writeHead(421).end('Host không hợp lệ');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  const file = resolveStatic(p);
  if (!file) {
    res.writeHead(404).end('Không tìm thấy tệp');
    return;
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('Không tìm thấy tệp');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': p.startsWith('/live/tts/') ? 'no-store' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 64 * 1024,
  verifyClient: ({ origin, req }) => {
    if (!okHost(req.headers.host)) return false;
    if (!origin) return true; // OBS / Window capture có thể không gửi Origin
    try {
      return okHost(new URL(origin).host);
    } catch {
      return false;
    }
  }
});

function broadcast(msg, only) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) {
    if (c.readyState === 1 && (!only || c.role === only)) {
      c.send(s);
    }
  }
}

wss.on('connection', (ws, req) => {
  ws.role = new URL(req.url, 'http://x').searchParams.get('role') === 'control' ? 'control' : 'overlay';
  ws.send(JSON.stringify(snapshot()));
  if (ws.role === 'control') {
    ws.send(JSON.stringify({ t: 'logs', lines: log, chants: CHANTS }));
  }

  ws.on('message', buf => {
    if (ws.role !== 'control') return; // Overlay chỉ nhận dữ liệu, không điều khiển
    try {
      const m = JSON.parse(buf);
      if (m && m.t === 'ctl') onControl(m);
    } catch (e) {
      addLog('Lệnh điều khiển lỗi: ' + e.message);
    }
  });
});

server.listen(PORT, HOST, () => {
  addLog(`🌟 Chánh Điện Server đang chạy tại http://localhost:${PORT}`);
  addLog(`🎛 Bảng điều khiển: http://localhost:${PORT}/live/control.html`);
  addLog(`📺 Màn hình Overlay: http://localhost:${PORT}/live/overlay.html`);
});
