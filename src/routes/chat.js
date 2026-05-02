import { Router } from 'express';
import { body } from 'express-validator';
import { db } from '../db/index.js';
import { chatMessages, tasks, devices } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { processChat } from '../services/aiService.js';

const router = Router();
router.use(authenticate);

// ============ Send Message / Chat with AI ============
router.post(
  '/message',
  [
    body('message').isString().trim().isLength({ min: 1 }),
    body('deviceId').optional().isUUID(),
    body('context').optional().isString(),
  ],
  validate,
  async (req, res) => {
    try {
      const { message, deviceId, context } = req.body;

      // Save user message
      const [userMsg] = await db
        .insert(chatMessages)
        .values({
          userId: req.user.id,
          role: 'user',
          content: message,
          metadata: context ? { context } : null,
        })
        .returning();

      // Get recent chat history for context
      const history = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, req.user.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);

      // Process with AI
      const aiResult = await processChat({
        userMessage: message,
        history: history.reverse(),
        deviceId,
        userId: req.user.id,
        context,
      });

      // Save assistant response
      const [assistantMsg] = await db
        .insert(chatMessages)
        .values({
          userId: req.user.id,
          role: 'assistant',
          content: aiResult.response,
          taskId: aiResult.task?.id || null,
          metadata: {
            tokensUsed: aiResult.tokensUsed,
            hasTask: !!aiResult.task,
            suggestions: aiResult.suggestions,
          },
        })
        .returning();

      // If AI determined a task should be created, create it
      let createdTask = null;
      if (aiResult.task && deviceId) {
        const [device] = await db
          .select()
          .from(devices)
          .where(and(eq(devices.id, deviceId), eq(devices.userId, req.user.id)))
          .limit(1);

        if (device && device.status !== 'offline') {
          [createdTask] = await db
            .insert(tasks)
            .values({
              userId: req.user.id,
              deviceId,
              type: aiResult.task.type,
              command: aiResult.task.command,
              params: aiResult.task.params,
              priority: aiResult.task.priority || 'normal',
            })
            .returning();

          // Dispatch to desktop agent
          const io = req.app.get('io');
          if (io) {
            io.to(`device:${deviceId}`).emit('command:execute', {
              taskId: createdTask.id,
              type: createdTask.type,
              command: createdTask.command,
              params: createdTask.params,
            });
            io.to(`user:${req.user.id}`).emit('task:created', { task: createdTask });
          }
        }
      }

      // Emit chat response via WebSocket for real-time
      req.app.get('io')?.to(`user:${req.user.id}`).emit('chat:response', {
        message: assistantMsg,
        task: createdTask,
        suggestions: aiResult.suggestions,
      });

      res.json({
        message: assistantMsg,
        task: createdTask,
        suggestions: aiResult.suggestions || [],
      });
    } catch (error) {
      console.error('Chat message error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  }
);

// ============ Get Chat History ============
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, req.user.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ messages: messages.reverse(), limit, offset });
  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ============ Clear Chat History ============
router.delete('/history', async (req, res) => {
  try {
    await db
      .delete(chatMessages)
      .where(eq(chatMessages.userId, req.user.id));

    res.json({ message: 'Chat history cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

export default router;
