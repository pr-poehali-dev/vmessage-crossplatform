
CREATE TABLE vm_chats (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'private',
  name VARCHAR(100),
  description TEXT DEFAULT '',
  avatar_color VARCHAR(20) DEFAULT '#8B5CF6',
  created_by INTEGER REFERENCES vm_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vm_chat_members (
  chat_id INTEGER REFERENCES vm_chats(id),
  user_id INTEGER REFERENCES vm_users(id),
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE vm_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES vm_chats(id),
  sender_id INTEGER REFERENCES vm_users(id),
  msg_text TEXT,
  msg_type VARCHAR(20) DEFAULT 'text',
  msg_status VARCHAR(20) DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  is_hidden BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_vm_messages_chat ON vm_messages(chat_id, created_at DESC);
CREATE INDEX idx_vm_chat_members_user ON vm_chat_members(user_id);
CREATE INDEX idx_vm_users_username ON vm_users(username);
