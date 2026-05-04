import { Router } from 'express';
import { body } from 'express-validator';
import { db } from '../db/index.js';
import { devices, pairingCodes } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import crypto from 'crypto';

const router = Router();

// ============ Public Pairing Verification (NO AUTH REQUIRED) ============
// This allows a new desktop app to exchange a 6-digit code for a real token
router.post('/pair/verify', async (req, res) => {
  try {
    const { pairingCode: code, deviceName, platform } = req.body;
    
    // Find the code regardless of expiry first to give better error messages
    const [pc] = await db.select().from(pairingCodes)
      .where(eq(pairingCodes.code, code))
      .limit(1);

    if (!pc) {
      return res.status(400).json({ error: 'Pairing code not found. Please check the code.' });
    }
    
    if (pc.usedAt) {
      return res.status(400).json({ error: 'This pairing code has already been used.' });
    }

    if (new Date(pc.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Pairing code has expired. Please generate a new one.' });
    }

    // Mark code as used
    await db.update(pairingCodes).set({ usedAt: new Date() }).where(eq(pairingCodes.id, pc.id));

    // Create the device
    const [device] = await db.insert(devices).values({
      userId: pc.userId,
      name: deviceName || 'New Desktop',
      type: 'desktop', // Added missing required field
      platform: (platform || 'windows').toLowerCase(),
      status: 'online',
      pairedAt: new Date(),
    }).returning();

    // Generate a long-term token for this device
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign(
      { userId: pc.userId, deviceId: device.id },
      process.env.JWT_SECRET || 'pocket_ai_secret_key_123_change_me',
      { expiresIn: '365d' } // 1 year session for desktop
    );

    res.json({ token, deviceId: device.id, serverUrl: process.env.SERVER_URL });
  } catch (error) {
    console.error('Verify pairing error:', error);
    res.status(500).json({ error: 'Pairing failed' });
  }
});

// All other device routes require authentication
router.use(authenticate);

// ============ QR Pairing: Initialize Session (Desktop Agent) ============
// Note: This needs to be accessible WITHOUT full auth if the desktop is new, 
// or we use a temporary session. For now, let's allow a "pending" device.
router.post('/pair/init', async (req, res) => {
  try {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes

    // Store a temporary pairing session
    await db.insert(pairingCodes).values({
      userId: req.user.id, // For now, assume user is known or use a global pool
      code: sessionId.substring(0, 8),
      expiresAt,
      deviceName: 'Pending Device',
    });

    res.json({ sessionId, qrData: JSON.stringify({ sessionId, serverUrl: process.env.SERVER_URL }) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to init pairing' });
  }
});

// ============ Generate Pairing Code ============
router.post('/pair/code', async (req, res) => {
  try {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 600000); // 10 minutes expiry (increased from 1m)

    const [pairingCode] = await db
      .insert(pairingCodes)
      .values({
        userId: req.user.id,
        code,
        expiresAt,
      })
      .returning();

    res.json({
      pairingCode: pairingCode.code,
      expiresAt: pairingCode.expiresAt,
    });
  } catch (error) {
    console.error('Pairing code generation error:', error);
    res.status(500).json({ error: 'Failed to generate pairing code' });
  }
});

// ============ Complete Pairing (Desktop Agent calls this) ============
router.post(
  '/pair/complete',
  [
    body('pairingCode').isLength({ min: 6, max: 6 }),
    body('deviceName').trim().isLength({ min: 1 }),
    body('platform').isIn(['windows', 'macos', 'linux']),
    body('type').isIn(['desktop', 'laptop', 'workstation']),
  ],
  validate,
  async (req, res) => {
    try {
      const { pairingCode: code, deviceName, platform, type, btAddress, ipAddress } = req.body;
      console.log(`🔍 Attempting to complete pairing. Code: ${code}, UserID: ${req.user.id}`);

      // Find valid pairing code
      const [pc] = await db
        .select()
        .from(pairingCodes)
        .where(
          and(
            eq(pairingCodes.code, code),
            eq(pairingCodes.userId, req.user.id)
          )
        )
        .limit(1);

      console.log(`📊 Pairing code found:`, pc ? 'Yes' : 'No');
      if (pc) {
        console.log(`⏰ Expiry: ${pc.expiresAt}, Current Time: ${new Date()}, Used: ${!!pc.usedAt}`);
      }

      if (!pc || pc.usedAt || new Date(pc.expiresAt) < new Date()) {
        console.log('❌ Pairing failed: Code invalid, used, or expired');
        return res.status(400).json({ error: 'Invalid or expired pairing code' });
      }

      // Mark code as used
      await db
        .update(pairingCodes)
        .set({ usedAt: new Date(), deviceName })
        .where(eq(pairingCodes.id, pc.id));

      // Create or update device
      const [device] = await db
        .insert(devices)
        .values({
          userId: req.user.id,
          name: deviceName,
          type,
          platform,
          btAddress,
          ipAddress,
          status: 'online',
          pairedAt: new Date(),
        })
        .returning();

      res.status(201).json({ device });
    } catch (error) {
      console.error('Pairing completion error:', error);
      res.status(500).json({ error: 'Pairing failed' });
    }
  }
);

// ============ List Devices ============
router.get('/', async (req, res) => {
  try {
    const userDevices = await db
      .select()
      .from(devices)
      .where(eq(devices.userId, req.user.id));

    res.json({ devices: userDevices });
  } catch (error) {
    console.error('List devices error:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// ============ Get Device ============
router.get('/:id', async (req, res) => {
  try {
    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, req.params.id), eq(devices.userId, req.user.id)))
      .limit(1);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// ============ Update Device Status ============
router.put('/:id/status', [body('status').isIn(['online', 'offline', 'busy'])], validate, async (req, res) => {
  try {
    const [device] = await db
      .update(devices)
      .set({ status: req.body.status, lastSeen: new Date() })
      .where(and(eq(devices.id, req.params.id), eq(devices.userId, req.user.id)))
      .returning();

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Emit WebSocket event
    req.app.get('io')?.to(`user:${req.user.id}`).emit('device:status', {
      deviceId: device.id,
      status: device.status,
    });

    res.json({ device });
  } catch (error) {
    console.error('Update device status error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// ============ Remove Device ============
router.delete('/:id', async (req, res) => {
  try {
    const [deleted] = await db
      .delete(devices)
      .where(and(eq(devices.id, req.params.id), eq(devices.userId, req.user.id)))
      .returning({ id: devices.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Device not found' });
    }

    req.app.get('io')?.to(`user:${req.user.id}`).emit('device:disconnected', {
      deviceId: deleted.id,
    });

    res.json({ message: 'Device removed', deviceId: deleted.id });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

export default router;
