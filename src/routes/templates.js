import { Router } from 'express';
import { db } from '../db/index.js';
import { templates } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', optionalAuth, async (req, res) => {
  try {
    const category = req.query.category;
    const conditions = category ? [eq(templates.category, category)] : [];
    const result = await db.select().from(templates)
      .where(conditions.length ? conditions[0] : undefined)
      .orderBy(desc(templates.createdAt));

    // Filter premium if user is on free plan
    const filtered = result.filter(t => {
      if (!t.isPremium) return true;
      return req.user && req.user.planId !== 'free';
    });

    res.json({ templates: filtered });
  } catch (error) {
    console.error('Templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [template] = await db.select().from(templates)
      .where(eq(templates.id, req.params.id)).limit(1);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ template });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

export default router;
