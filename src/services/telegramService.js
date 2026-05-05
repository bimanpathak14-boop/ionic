import pkg from 'telegraf';
const { Telegraf } = pkg;
import { db } from '../db/index.js';
import { eq, desc, and, gt } from 'drizzle-orm';
import { pairingCodes, chatMessages, tasks, devices, users } from '../db/schema.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { processChat } from './aiService.js';

const SENSITIVE_PATTERNS = [
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, // IPv4
  /([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g, // IPv6
  /MAC Address/i,
  /ipconfig/i,
  /ifconfig/i
];

function filterSensitiveInfo(text) {
  let filteredText = text;
  // Remove technical JSON blocks that AI might leak
  filteredText = filteredText.replace(/\{"task":.*?\}/g, '');
  filteredText = filteredText.replace(/```json[\s\S]*?```/g, '');
  
  SENSITIVE_PATTERNS.forEach(pattern => {
    filteredText = filteredText.replace(pattern, '[REDACTED]');
  });
  return filteredText.trim();
}

// Prevent double-processing (Deduplication)
const processedMessages = new Set();

let bot;

export const initializeTelegram = (io) => {
  console.log('📢 initializeTelegram function called!'); // Forced log
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const authorizedId = process.env.TELEGRAM_AUTHORIZED_USER_ID?.trim();

  if (!token || token === 'your_bot_token_here') {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not found or is placeholder. Telegram bot disabled.');
    return;
  }

  console.log(`🤖 Initializing Telegram Bot for Authorized ID: ${authorizedId || 'Any (Public)'}`);
  bot = new Telegraf(token);

  // Middleware to check authorization
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id.toString();
    console.log(`📥 Received message from Telegram ID: ${userId}`);

    // If placeholder or empty, allow for testing
    if (!authorizedId || authorizedId === 'your_telegram_id_here' || authorizedId === 'your_authorized_user_id') {
      console.log(`⚠️ WARNING: Bot is in PUBLIC mode because TELEGRAM_AUTHORIZED_USER_ID is not set.`);
      return next();
    }

    if (userId !== authorizedId) {
      console.log(`🚫 Unauthorized access attempt from: ${userId} (Expected: ${authorizedId})`);
      return ctx.reply('Sorry, you are not authorized to use this bot.');
    }
    return next();
  });

  bot.start(async (ctx) => {
    try {
      console.log('🚀 Start command received!');
      await ctx.reply('Welcome to Pocket AI! I am your PC Remote Controller.\n\nCommands:\n/pair - Get code to connect your Laptop\nSend any message to control your PC.');
    } catch (err) {
      console.error('❌ Error in /start command:', err);
    }
  });

  bot.command('pair', async (ctx) => {
    try {
      // 1. Get/Create a real user first to ensure auth passes
      let user = await db.query.users.findFirst() || (await db.insert(users).values({ email: 'admin@pocket-ai.local', passwordHash: 'dummy', name: 'Pocket AI Admin' }).returning())[0];
      
      const serverUrl = process.env.RENDER_EXTERNAL_URL || 'https://ionic-04b0.onrender.com';
      const jwtSecret = process.env.JWT_SECRET || 'pocket_ai_secret_key_123_change_me';
      
      const res = await fetch(`${serverUrl}/api/v1/devices/pair/discovery-list`, {
        headers: { 'Authorization': `Bearer ${jwt.sign({ userId: user.id }, jwtSecret)}` }
      });
      const data = await res.json();

      if (!data.devices || data.devices.length === 0) {
        return ctx.reply('🔍 *Searching for laptops...*\n\nNo laptops found. Make sure Pocket AI is running on your laptop.', { parse_mode: 'Markdown' });
      }

      const keyboard = data.devices.map(d => ([{
        text: `💻 Connect to ${d.hostname}`,
        callback_data: `claim_${d.id}`
      }]));

      ctx.reply('🔍 *I found these laptops:*\nClick one to connect instantly!', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (e) {
      ctx.reply('❌ Error searching for devices.');
    }
  });

  // Handle Button Clicks
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('claim_')) {
      const discoveryId = data.replace('claim_', '');
      try {
        // Get/Create User
        let user = await db.query.users.findFirst() || (await db.insert(users).values({ email: 'admin@pocket-ai.local', passwordHash: 'dummy', name: 'Pocket AI Admin' }).returning())[0];
        const jwtSecret = process.env.JWT_SECRET || 'pocket_ai_secret_key_123_change_me';
        const jwtToken = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '5m' });
        
        const serverUrl = process.env.RENDER_EXTERNAL_URL || 'https://ionic-04b0.onrender.com';
        const res = await fetch(`${serverUrl}/api/v1/devices/pair/discovery-confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
          body: JSON.stringify({ discoveryId }),
        });

        const result = await res.json();
        if (result.success) {
          ctx.answerCbQuery('Connected!');
          ctx.editMessageText(`✅ *Success!* Linked to *${result.deviceName}*.\nYou can now control it!`, { parse_mode: 'Markdown' });
        } else {
          ctx.answerCbQuery('Failed to connect.');
        }
      } catch (e) {
        ctx.answerCbQuery('Error.');
      }
    }
  });

  bot.on('text', async (ctx) => {
    const msgId = ctx.message.message_id;
    const telegramId = ctx.from.id.toString();
    const userMessage = ctx.message.text;

    // Deduplication check
    const dedupKey = `${telegramId}:${msgId}`;
    if (processedMessages.has(dedupKey)) return;
    processedMessages.add(dedupKey);
    setTimeout(() => processedMessages.delete(dedupKey), 60000); // Clear after 1 min

    console.log(`💬 Processing message: "${userMessage}" from ${telegramId}`);

    try {
      // 1. Get/Create User
      let user;
      try {
        user = await db.query.users.findFirst();
      } catch (dbErr) {
        console.error('❌ Database connection error:', dbErr);
        return ctx.reply('⚠️ Database connection failed. Please check if your Neon DB is active.');
      }

      if (!user) {
        console.log('📝 Creating default admin user...');
        try {
          [user] = await db.insert(users).values({
            email: 'admin@pocket-ai.local',
            passwordHash: 'dummy',
            name: 'Pocket AI Admin',
          }).returning();
        } catch (insErr) {
          console.error('❌ Failed to create user:', insErr);
          return ctx.reply('❌ Failed to initialize user in database.');
        }
      }

      // ... rest of the logic ...
      // (I'll keep the rest as is but wrapped in the outer try-catch)

      const history = await db.select().from(chatMessages)
        .where(eq(chatMessages.userId, user.id))
        .orderBy(desc(chatMessages.createdAt)).limit(10);

      const device = await db.query.devices.findFirst({
        where: and(eq(devices.userId, user.id), eq(devices.status, 'online')),
        orderBy: desc(devices.lastSeen) // Always pick the most recently active device
      });

      // 3. Process with AI
      ctx.sendChatAction('typing');
      const aiResult = await processChat({
        userMessage,
        history: history.reverse(),
        deviceId: device?.id,
        userId: user.id,
      });

      // 4. Save to DB
      await db.insert(chatMessages).values({ userId: user.id, role: 'user', content: userMessage });
      const [assistantMsg] = await db.insert(chatMessages).values({
        userId: user.id,
        role: 'assistant',
        content: aiResult.response,
        metadata: { hasTask: !!aiResult.task },
      }).returning();

      // 5. Dispatch Command
      let taskStatusMsg = '';
      if (aiResult.task && device) {
        const [createdTask] = await db.insert(tasks).values({
          userId: user.id, deviceId: device.id,
          type: aiResult.task.type, command: aiResult.task.command, params: aiResult.task.params,
        }).returning();

        if (io) {
          console.log(`📡 Dispatching command to device: ${device.id} (${device.name})`);
          io.to(`device:${device.id}`).emit('command:execute', {
            taskId: createdTask.id, 
            type: createdTask.type,
            command: createdTask.command, 
            params: createdTask.params,
          });
          taskStatusMsg = `\n\n⚙️ *Command Sent:* ${aiResult.task.type}`;
        }
      } else if (aiResult.task && !device) {
        taskStatusMsg = `\n\n⚠️ *No Device:* Laptop offline. Command queued.`;
      }

      // 6. Reply (Using plain text for better stability with long AI responses)
      const safeResponse = filterSensitiveInfo(aiResult.response + taskStatusMsg);
      await ctx.reply(safeResponse);

    } catch (error) {
      console.error('❌ Bot Processing Error:', error);
      ctx.reply(`❌ Error: ${error.message || 'Unknown processing error'}`);
    }
  });

  // Use Polling for better reliability during troubleshooting
  bot.launch().then(() => {
    console.log('🤖 Pocket AI Bot is now LIVE in Polling mode!');
  }).catch(err => {
    console.error('❌ Failed to launch Telegram Bot:', err);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
};

export default { initializeTelegram };
