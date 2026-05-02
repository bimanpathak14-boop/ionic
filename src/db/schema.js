import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// ============ Enums ============
export const deviceTypeEnum = pgEnum('device_type', ['desktop', 'laptop', 'workstation']);
export const devicePlatformEnum = pgEnum('device_platform', ['windows', 'macos', 'linux']);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'pairing', 'busy']);

export const taskTypeEnum = pgEnum('task_type', [
  'document_create', 'document_edit',
  'presentation_create', 'spreadsheet_create',
  'code_project', 'code_edit',
  'file_operation', 'app_launch',
  'browser_action', 'image_generate',
  'image_edit', 'system_command',
  'print', 'export'
]);
export const taskStatusEnum = pgEnum('task_status', ['queued', 'running', 'completed', 'failed', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'normal', 'high', 'urgent']);

export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant', 'system']);
export const planNameEnum = pgEnum('plan_name', ['free', 'pro', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'expired', 'cancelled', 'trial']);

export const templateCategoryEnum = pgEnum('template_category', [
  'document', 'presentation', 'spreadsheet',
  'resume', 'report', 'notice', 'project', 'creative'
]);

// ============ Users ============
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  planId: planNameEnum('plan_id').default('free'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============ Devices ============
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: deviceTypeEnum('type').notNull(),
  platform: devicePlatformEnum('platform').notNull(),
  btAddress: varchar('bt_address', { length: 64 }),
  ipAddress: varchar('ip_address', { length: 45 }),
  status: deviceStatusEnum('status').default('offline').notNull(),
  lastSeen: timestamp('last_seen').defaultNow(),
  pairedAt: timestamp('paired_at').defaultNow().notNull(),
});

// ============ Tasks ============
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  type: taskTypeEnum('type').notNull(),
  command: text('command').notNull(),
  params: jsonb('params').default({}).notNull(),
  status: taskStatusEnum('status').default('queued').notNull(),
  progress: integer('progress').default(0),
  result: jsonb('result'),
  error: text('error'),
  priority: taskPriorityEnum('priority').default('normal').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

// ============ Templates ============
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: templateCategoryEnum('category').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  contentSchema: jsonb('content_schema').default({}).notNull(),
  isPremium: boolean('is_premium').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ Files ============
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 500 }).notNull(),
  path: text('path').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  size: integer('size').default(0).notNull(),
  mimeType: varchar('mime_type', { length: 255 }),
  cloudUrl: text('cloud_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ Chat Messages ============
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============ Subscriptions ============
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  planName: planNameEnum('plan_name').notNull(),
  status: subscriptionStatusEnum('status').default('trial').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  paymentId: varchar('payment_id', { length: 255 }),
});

// ============ Permissions ============
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }).notNull(),
  scope: varchar('scope', { length: 100 }).notNull(),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
});

// ============ Pairing Codes (for Bluetooth handshake) ============
export const pairingCodes = pgTable('pairing_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  code: varchar('code', { length: 10 }).notNull(),
  deviceName: varchar('device_name', { length: 255 }),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
