
CREATE TABLE vm_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  bio TEXT DEFAULT '',
  avatar_color VARCHAR(20) DEFAULT '#8B5CF6',
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  session_token VARCHAR(64) UNIQUE,
  is_online BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
