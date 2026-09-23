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







// Inisialisasi Firebase & Realtime Database

const firebaseApp = initializeApp(firebaseConfig);

const db = getDatabase(firebaseApp);



// 2. Inisialisasi Telegram Bot (Webhook Mode)

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8909044741:AAGGON5bVVhPbNAFNEsjMDYGrvR3NSkded4";

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



    // Pastikan ada payload pesan

    const message = update.message || update.edited_message;

    if (!message) {

      return res.status(200).send('No message received');

    }



    // Ambil isi pesan teks atau caption foto/dokumen

    const textContent = message.text || message.caption || '';



    // Cek apakah teks/caption mengandung hashtag #moban (case-insensitive)

    if (textContent.toLowerCase().includes('#moban')) {

      const ticketId = generateTicketId();

      const timestampCreated = new Date(message.date * 1000).toISOString();



      // Data Teknisi pengirim

      const idTelegramTeknisi = String(message.from.id);

      const usernameTeknisi = message.from.username ? `@${message.from.username}` : '';

      const namaTeknisi = `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim();



      // Payload data tiket

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



      // A. INPUT KE FIREBASE REALTIME DATABASE

      await set(ref(db, `permintaan/${ticketId}`), payloadPermintaan);



      // B. BOT RESPON: Kirim pesan konfirmasi ke Telegram

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

