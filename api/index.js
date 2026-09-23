const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// 1. Inisialisasi Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.database();

// 2. Inisialisasi Telegram Bot (Webhook Mode)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN);

// Helper function untuk generate Unique Ticket ID (Contoh: TK-20260923-8492)
function generateTicketId() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  
  return `TK-${dateStr}-${randomNum}`;
}

// 3. Endpoint Webhook Vercel
app.post('/api/webhook', async (req, res) => {
  try {
    const update = req.body;

    // Pastikan ada payload pesan (message atau edited_message)
    const message = update.message || update.edited_message;
    if (!message) {
      return res.status(200).send('No message received');
    }

    // Ambil isi pesan teks biasa ATAU caption jika pesan berupa Foto/Dokumen
    const textContent = message.text || message.caption || '';

    // Cek apakah teks/caption mengandung hashtag #moban (case-insensitive)
    if (textContent.toLowerCase().includes('#moban')) {
      const ticketId = generateTicketId();
      const timestampCreated = new Date(message.date * 1000).toISOString();

      // Data Teknisi pengirim
      const idTelegramTeknisi = String(message.from.id);
      const usernameTeknisi = message.from.username ? `@${message.from.username}` : '';
      const namaTeknisi = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();

      // Payload untuk tabel 'permintaan' di Firebase
      const payloadPermintaan = {
        ticket_id: ticketId,
        timestamp_created: timestampCreated,
        id_telegram_teknisi: idTelegramTeknisi,
        username_teknisi: usernameTeknisi,
        nama_teknisi: namaTeknisi,
        perintah: '#moban',
        pesan_awal: textContent,
        status: 'OPEN',
        id_telegram_hd: '',
        timestamp_taken: '',
        timestamp_closed: '',
        solusi_ringkas: ''
      };

      // A. INPUT KE FIREBASE: Simpan data tiket ke path /permintaan/{ticket_id}
      await db.ref(`permintaan/${ticketId}`).set(payloadPermintaan);

      // B. BOT RESPON: Kirim pesan konfirmasi ke grup/chat Telegram
      const replyMessage = `✅ **Tiket Permintaan Berhasil Dibuat!**\n\n` +
                           `🎫 **Ticket ID:** \`${ticketId}\`\n` +
                           `👤 **Teknisi:** ${namaTeknisi} (${usernameTeknisi || idTelegramTeknisi})\n` +
                           `📌 **Status:** \`OPEN\`\n` +
                           `📝 **Pesan:**\n_${textContent}_\n\n` +
                           `*Tim Helpdesk akan segera merespon tiket ini.*`;

      await bot.sendMessage(message.chat.id, replyMessage, {
        reply_to_message_id: message.message_id,
        parse_mode: 'Markdown'
      });
    }

    // Beri respon OK 200 ke Telegram Webhook
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint tes status server
app.get('/', (req, res) => {
  res.send('Bot Telegram #moban Helpdesk Server Ready!');
});

module.exports = app;
