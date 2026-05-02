-- Pocket AI Office - Database Schema (PostgreSQL)

-- Enums
CREATE TYPE device_type AS ENUM ('desktop', 'laptop', 'workstation');
CREATE TYPE device_platform AS ENUM ('windows', 'macos', 'linux');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'pairing', 'busy');
CREATE TYPE task_type AS ENUM ('document_create', 'document_edit', 'presentation_create', 'spreadsheet_create', 'code_project', 'code_edit', 'file_operation', 'app_launch', 'browser_action', 'image_generate', 'image_edit', 'system_command', 'print', 'export');
CREATE TYPE task_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE plan_name AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled', 'trial');
CREATE TYPE template_category AS ENUM ('document', 'presentation', 'spreadsheet', 'resume', 'report', 'notice', 'project', 'creative');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    plan_id plan_name DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Devices Table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type device_type NOT NULL,
    platform device_platform NOT NULL,
    bt_address VARCHAR(64),
    ip_address VARCHAR(45),
    status device_status DEFAULT 'offline' NOT NULL,
    last_seen TIMESTAMP DEFAULT NOW(),
    paired_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Tasks Table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    type task_type NOT NULL,
    command TEXT NOT NULL,
    params JSONB DEFAULT '{}' NOT NULL,
    status task_status DEFAULT 'queued' NOT NULL,
    progress INTEGER DEFAULT 0,
    result JSONB,
    error TEXT,
    priority task_priority DEFAULT 'normal' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Templates Table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category template_category NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    content_schema JSONB DEFAULT '{}' NOT NULL,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Files Table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    name VARCHAR(500) NOT NULL,
    path TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    size INTEGER DEFAULT 0 NOT NULL,
    mime_type VARCHAR(255),
    cloud_url TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Chat Messages Table
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role chat_role NOT NULL,
    content TEXT NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Subscriptions Table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    plan_name plan_name NOT NULL,
    status subscription_status DEFAULT 'trial' NOT NULL,
    started_at TIMESTAMP DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    payment_id VARCHAR(255)
);

-- Pairing Codes Table
CREATE TABLE pairing_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    code VARCHAR(10) NOT NULL,
    device_name VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
