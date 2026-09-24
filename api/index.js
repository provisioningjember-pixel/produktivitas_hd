const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, push, get, update } = require('firebase/database');

const app = express();
app.use(express.json());

// 1. Konfigurasi Firebase SDK Client
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCIEJHWd7EBzC0FeWgtlmNF0CHpPcyCrK4",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "forminput-9c324.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "forminput-9c324",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "forminput-9c324.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "105974451173",
  appId: process.env.FIREBASE_APP_ID || "1:105974451173:web:d2976fc5ed60dad0d23d0c",
  databaseURL: "https://forminput-9c324-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// 2. Inisialisasi Telegram Bot
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8909044741:AAGGON5bVVhPbNAFNEsjMDYGrvR3NSkded4";
const bot = new TelegramBot(TELEGRAM_TOKEN);

function generateTicketId(userId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');

  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}${seconds}`;

  return `TK-${dateStr}-${timeStr}-${userId}-${millis}`;
}

// Helper untuk escape HTML agar pesan caption aman dari error
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper untuk mengekstrak File ID Gambar / Document
function extractFileId(message) {
  if (message.photo && message.photo.length > 0) {
    return message.photo[message.photo.length - 1].file_id;
  }
  if (message.document) {
    return message.document.file_id;
  }
  return '';
}

// Helper Pencarian Tiket berdasarkan Reply Message
async function findTicketIdFromReply(replyMessage) {
  const targetMsgId = String(replyMessage.message_id);
  const textInReply = replyMessage.text || replyMessage.caption || '';

  // STRATEGI 1: Cari Regex ID Tiket (TK-XXXXXXXX...) langsung dari isi teks pesan yang di-reply
  const matchTiket = textInReply.match(/TK-\d{8}-\d{6}-\d+-\d+/);
  if (matchTiket) {
    return matchTiket[0];
  }

  try {
    // STRATEGI 2: Scan node 'permintaan'
    const snapPermintaan = await get(ref(db, 'permintaan'));
    if (snapPermintaan.exists()) {
      const data = snapPermintaan.val();
      for (const key in data) {
        if (String(data[key].message_id) === targetMsgId || data[key].tiket_id === key) {
          return data[key].tiket_id || key;
        }
      }
    }

    // STRATEGI 3: Scan node 'diskusi'
    const snapDiskusi = await get(ref(db, 'diskusi'));
    if (snapDiskusi.exists()) {
      const dataDiskusi = snapDiskusi.val();
      for (const key in dataDiskusi) {
        if (String(dataDiskusi[key].message_id) === targetMsgId) {
          return dataDiskusi[key].id_tiket;
        }
      }
    }
  } catch (err) {
    console.error("Error penelusuran tiket:", err);
  }

  return null;
}

// 3. Endpoint Webhook Vercel
app.post('/api/webhook', async (req, res) => {
  try {
    const update = req.body;
    const message = update.message || update.edited_message;

    if (!message) {
      return res.status(200).send('No message received');
    }

    const textContent = message.text || message.caption || '';
    const fileId = extractFileId(message);
    const idTelegramUser = String(message.from.id);
    const chatId = String(message.chat.id);
    const messageId = String(message.message_id);
    const timestamp = new Date(message.date * 1000).toISOString();

    // =========================================================================
    // PRIORITAS 1: CEK APAKAH PESAN ADALAH REPLY TERHADAP PESAN TIKET / DISKUSI
    // =========================================================================
    if (message.reply_to_message) {
      const targetTiketId = await findTicketIdFromReply(message.reply_to_message);

      if (targetTiketId) {
        // 1. Simpan Data Balasan Baru ke Tabel 'diskusi'
        const payloadDiskusi = {
          chat_id: chatId,
          id_file: fileId,
          id_telegram: idTelegramUser,
          id_tiket: targetTiketId,
          message_id: messageId,
          teks: textContent,
          timestamp: timestamp
        };

        await push(ref(db, 'diskusi'), payloadDiskusi);

        // 2. Update Status Tiket di Tabel 'permintaan' menjadi 'DIKERJAKAN' & Kosongkan timestamp_close
        await update(ref(db, `permintaan/${targetTiketId}`), {
          status: 'DIKERJAKAN',
          timestamp_close: ''
        });

        // 3. Kirim Konfirmasi ke Telegram
        await bot.sendMessage(chatId, `💬 Sanggahan/Balasan diterima.\n\nTiket <code>${targetTiketId}</code> berstatus <b>DIKERJAKAN</b> kembali.`, {
          reply_to_message_id: message.message_id,
          parse_mode: 'HTML'
        });

        return res.status(200).send('OK');
      }
    }

    // =========================================================================
    // PRIORITAS 2: PENGIRIMAN TIKET BARU DENGAN HASHTAG #MOBAN
    // =========================================================================
    if (textContent.toLowerCase().includes('#moban')) {
      const ticketId = generateTicketId(idTelegramUser);
      let segmen = 'B2C';

      const namaTeknisi = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();
      const usernameTeknisi = message.from.username ? `@${message.from.username}` : '';

      const payloadTiket = {
        tiket_id: ticketId,
        segmen: segmen,
        kategori_pekerjaan: '',
        chat_id: chatId,
        message_id: messageId,
        pesan: textContent,
        file_id: fileId,
        id_telegram_teknisi: idTelegramUser,
        nama_teknisi: namaTeknisi,
        username_teknisi: usernameTeknisi,
        id_telegram_hd: '',
        nama_hd: '',
        nik_hd: '',
        timestamp_created: timestamp,
        timestamp_taken: '',
        timestamp_close: '',
        keterangan: '',
        status: 'OPEN'
      };

      await set(ref(db, `permintaan/${ticketId}`), payloadTiket);

      const safePesan = escapeHtml(textContent);
      const safeNama = escapeHtml(namaTeknisi);

      const replyMessage = 
        `✅ <b>Tiket Permintaan Berhasil Dibuat!</b>\n\n` +
        `🎫 <b>Ticket ID:</b> <code>${ticketId}</code>\n` +
        `🏷️ <b>Segmen:</b> <code>${segmen}</code>\n` +
        `👤 <b>Teknisi:</b> ${safeNama} (${usernameTeknisi || idTelegramUser})\n` +
        `📌 <b>Status:</b> <code>OPEN</code>\n` +
        `📷 <b>Lampiran Foto:</b> ${fileId ? 'Ada' : 'Tidak ada'}\n\n` +
        `📝 <b>Pesan:</b>\n<i>${safePesan}</i>\n\n` +
        `<i>Tim Helpdesk akan segera merespon tiket ini.</i>`;

      await bot.sendMessage(chatId, replyMessage, {
        reply_to_message_id: message.message_id,
        parse_mode: 'HTML'
      });

      return res.status(200).send('OK');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/', (req, res) => {
  res.send('Bot Telegram #moban Helpdesk Server Ready!');
});

module.exports = app;
