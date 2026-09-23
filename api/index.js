const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set } = require('firebase/database');

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

// Generator Ticket ID Anti-Duplikat
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

// 3. Endpoint Webhook
app.post('/api/webhook', async (req, res) => {
  try {
    const update = req.body;
    const message = update.message || update.edited_message;

    if (!message) {
      return res.status(200).send('No message received');
    }

    const textContent = message.text || message.caption || '';

    // Filter hashtag #moban
    if (textContent.toLowerCase().includes('#moban')) {
      const idTelegramTeknisi = String(message.from.id);
      const ticketId = generateTicketId(idTelegramTeknisi);
      const timestampCreated = new Date(message.date * 1000).toISOString();

      let segmen = 'B2C';

      // Ambil file_id jika pesan mengandung foto
      let fileId = '';
      if (message.photo && message.photo.length > 0) {
        fileId = message.photo[message.photo.length - 1].file_id;
      }

      const namaTeknisi = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();
      const usernameTeknisi = message.from.username ? `@${message.from.username}` : '';

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
        id_telegram_hd: '',
        timestamp_created: timestampCreated,
        timestamp_taken: '',
        timestamp_close: '',
        keterangan: '',
        status: 'OPEN'
      };

      // Simpan ke Firebase
      await set(ref(db, `permintaan/${ticketId}`), payloadTiket);

      // Balas ke Telegram
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

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(500).send('Internal Server Error');
  }
});

app.get('/', (req, res) => {
  res.send('Bot Telegram #moban Helpdesk Server Ready!');
});

module.exports = app;
