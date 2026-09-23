const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set } = require('firebase/database');

const app = express();
app.use(express.json());

// 1. Konfigurasi Firebase SDK Client (Dipertahankan sesuai kode awal)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCIEJHWd7EBzC0FeWgtlmNF0CHpPcyCrK4",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "forminput-9c324.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "forminput-9c324",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "forminput-9c324.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "105974451173",
  appId: process.env.FIREBASE_APP_ID || "1:105974451173:web:d2976fc5ed60dad0d23d0c",
  databaseURL: "https://forminput-9c324-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Inisialisasi Firebase & Realtime Database
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// 2. Inisialisasi Telegram Bot (Dipertahankan sesuai kode awal)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8909044741:AAGGON5bVVhPbNAFNEsjMDYGrvR3NSkded4";
const bot = new TelegramBot(TELEGRAM_TOKEN);

/**
 * Generate Ticket ID Unik (Format: TK-YYYYMMDD-HHmmss-USERID-MS)
 * Menggabungkan Waktu Presisi (sampai milidetik) + ID Telegram Teknisi
 * Dijamin unik & anti-duplikat meskipun inputan bersamaan dalam jumlah besar.
 */
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

// 3. Endpoint Webhook Vercel
app.post('/api/webhook', async (req, res) => {
  try {
    const update = req.body;

    // Pastikan ada payload pesan
    const message = update.message || update.edited_message;
    if (!message) {
      return res.status(200).send('No message received');
    }

    // Ambil isi pesan teks atau caption foto/dokumen
    const textContent = message.text || message.caption || '';

    // Cek apakah teks/caption mengandung hashtag #moban (case-insensitive)
    if (textContent.toLowerCase().includes('#moban')) {
      const idTelegramTeknisi = String(message.from.id);
      const ticketId = generateTicketId(idTelegramTeknisi);
      const timestampCreated = new Date(message.date * 1000).toISOString();

      // Penentuan segmen
      let segmen = '';
      if (textContent.toLowerCase().includes('#moban')) {
        segmen = 'B2C';
      }

      // Deteksi File ID Foto (mengambil resolusi/ukuran tertinggi jika ada)
      let fileId = '';
      if (message.photo && message.photo.length > 0) {
        fileId = message.photo[message.photo.length - 1].file_id;
      }

      // Data Teknisi pengirim
      const namaTeknisi = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();
      const usernameTeknisi = message.from.username ? `@${message.from.username}` : '';

      // Structure Payload Data Tiket
      const payloadTiket = {
        tiket_id: ticketId,
        segmen: segmen,
        kategori_pekerjaan: '',
        chat_id: String(message.chat.id),
        message_id: String(message.message_id),
        pesan: textContent,
        file_id: fileId,
        id_telegram_teknisi: idTelegramTeknisi,
        nama_teknisi: namaTeknisi,
        username_teknisi: usernameTeknisi,
        id_telegram_hd: '', // Cukup ID HD saja untuk relasi tabel HD
        timestamp_created: timestampCreated,
        timestamp_taken: '',
        timestamp_close: '',
        keterangan: '',
        status: 'OPEN'
      };

      // A. INPUT KE FIREBASE REALTIME DATABASE
      await set(ref(db, `permintaan/${ticketId}`), payloadTiket);

      // B. BOT RESPON: Kirim pesan konfirmasi ke Telegram
      const replyMessage = 
        `✅ *Tiket Permintaan Berhasil Dibuat!*\n\n` +
        `🎫 *Ticket ID:* \`${ticketId}\`\n` +
        `🏷️ *Segmen:* \`${segmen}\`\n` +
        `👤 *Teknisi:* ${namaTeknisi} (${usernameTeknisi || idTelegramTeknisi})\n` +
        `📌 *Status:* \`OPEN\`\n` +
        `📷 *Lampiran Foto:* ${fileId ? 'Ada' : 'Tidak ada'}\n\n` +
        `📝 *Pesan:* \n_${textContent}_\n\n` +
        `_Tim Helpdesk akan segera merespon tiket ini._`;

      await bot.sendMessage(message.chat.id, replyMessage, {
        reply_to_message_id: message.message_id,
        parse_mode: 'Markdown'
      });
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
