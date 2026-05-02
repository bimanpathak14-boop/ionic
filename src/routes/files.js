import { Router } from 'express';
import { db } from '../db/index.js';
import { files } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.use(authenticate);

// ============ Get User Files ============
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const userFiles = await db.select().from(files)
      .where(eq(files.userId, req.user.id))
      .orderBy(desc(files.createdAt)).limit(limit).offset(offset);
    res.json({ files: userFiles, limit, offset });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// ============ Upload File (from Desktop Agent) ============
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { deviceId, taskId, type } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const cloudUrl = `${baseUrl}/uploads/${file.filename}`;

    const [newFile] = await db.insert(files).values({
      userId: req.user.id,
      deviceId,
      taskId,
      name: file.originalname,
      path: req.body.path || file.path, // Local path on desktop
      type: type || 'document',
      size: file.size,
      mimeType: file.mimetype,
      cloudUrl: cloudUrl,
    }).returning();

    req.app.get('io')?.to(`user:${req.user.id}`).emit('file:created', { file: newFile });

    res.status(201).json({ file: newFile });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ============ Register File (Metadata only) ============
router.post('/', async (req, res) => {
  try {
    const { deviceId, taskId, name, path, type, size, mimeType } = req.body;
    const [file] = await db.insert(files).values({
      userId: req.user.id, deviceId, taskId, name, path, type, size: size || 0, mimeType,
    }).returning();
    req.app.get('io')?.to(`user:${req.user.id}`).emit('file:created', { file });
    res.status(201).json({ file });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register file' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.user.id))).limit(1);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [deleted] = await db.delete(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.user.id)))
      .returning({ id: files.id });
    if (!deleted) return res.status(404).json({ error: 'File not found' });
    res.json({ message: 'File removed', fileId: deleted.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
