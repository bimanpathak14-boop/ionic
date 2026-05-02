import { Router } from 'express';
import { body, query } from 'express-validator';
import { db } from '../db/index.js';
import { tasks, devices } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

// ============ Create Task ============
router.post(
  '/',
  [
    body('deviceId').isUUID(),
    body('type').isIn([
      'document_create', 'document_edit', 'presentation_create',
      'spreadsheet_create', 'code_project', 'code_edit',
      'file_operation', 'app_launch', 'browser_action',
      'image_generate', 'image_edit', 'system_command', 'print', 'export',
    ]),
    body('command').isString().notEmpty(),
    body('params').optional().isObject(),
    body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
  ],
  validate,
  async (req, res) => {
    try {
      const { deviceId, type, command, params, priority } = req.body;

      // Verify device belongs to user and is online
      const [device] = await db
        .select()
        .from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.userId, req.user.id)))
        .limit(1);

      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      if (device.status === 'offline') {
        return res.status(400).json({ error: 'Device is offline' });
      }

      // Create task
      const [task] = await db
        .insert(tasks)
        .values({
          userId: req.user.id,
          deviceId,
          type,
          command,
          params: params || {},
          priority: priority || 'normal',
          status: 'queued',
        })
        .returning();

      // Emit to desktop agent via WebSocket
      const io = req.app.get('io');
      if (io) {
        io.to(`device:${deviceId}`).emit('command:execute', {
          taskId: task.id,
          type: task.type,
          command: task.command,
          params: task.params,
          priority: task.priority,
        });

        io.to(`user:${req.user.id}`).emit('task:created', { task });
      }

      res.status(201).json({ task });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// ============ List Tasks ============
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;
    const deviceId = req.query.deviceId;

    let conditions = [eq(tasks.userId, req.user.id)];
    if (status) conditions.push(eq(tasks.status, status));
    if (deviceId) conditions.push(eq(tasks.deviceId, deviceId));

    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ tasks: userTasks, limit, offset });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ============ Get Task ============
router.get('/:id', async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, req.params.id), eq(tasks.userId, req.user.id)))
      .limit(1);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ============ Update Task Progress (Desktop Agent calls this) ============
router.put('/:id/progress', [body('progress').isInt({ min: 0, max: 100 })], validate, async (req, res) => {
  try {
    const [task] = await db
      .update(tasks)
      .set({ progress: req.body.progress })
      .where(and(eq(tasks.id, req.params.id), eq(tasks.userId, req.user.id)))
      .returning();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    req.app.get('io')?.to(`user:${req.user.id}`).emit('task:progress', {
      taskId: task.id,
      progress: task.progress,
    });

    res.json({ task });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// ============ Complete Task ============
router.put('/:id/complete', async (req, res) => {
  try {
    const { result, error: taskError } = req.body;
    const status = taskError ? 'failed' : 'completed';

    const [task] = await db
      .update(tasks)
      .set({
        status,
        result: result || null,
        error: taskError || null,
        progress: status === 'completed' ? 100 : undefined,
        completedAt: new Date(),
      })
      .where(and(eq(tasks.id, req.params.id), eq(tasks.userId, req.user.id)))
      .returning();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    const eventType = status === 'completed' ? 'task:completed' : 'task:failed';
    req.app.get('io')?.to(`user:${req.user.id}`).emit(eventType, { task });

    res.json({ task });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// ============ Cancel Task ============
router.put('/:id/cancel', async (req, res) => {
  try {
    const [task] = await db
      .update(tasks)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(
        and(
          eq(tasks.id, req.params.id),
          eq(tasks.userId, req.user.id)
        )
      )
      .returning();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Tell the desktop agent to cancel
    req.app.get('io')?.to(`device:${task.deviceId}`).emit('command:cancel', { taskId: task.id });

    res.json({ task });
  } catch (error) {
    console.error('Cancel task error:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

export default router;
