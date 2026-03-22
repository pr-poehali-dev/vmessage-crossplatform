-- V0004: contacts table, chat public/private settings, invite codes, user status improvements

-- Add is_active field to vm_users (пользователь удалил аккаунт)
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_users 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Contacts table (manually added contacts by user)
CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
  contact_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

-- Add public/private and invite_code to chats
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_chats
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS username VARCHAR(32) NULL;

-- Generate invite codes for existing groups/channels
UPDATE t_p77366720_vmessage_crossplatfo.vm_chats
  SET invite_code = SUBSTR(MD5(RANDOM()::TEXT), 1, 16)
  WHERE type IN ('group', 'channel') AND invite_code IS NULL;

-- Index for invite_code lookup
CREATE INDEX IF NOT EXISTS idx_vm_chats_invite_code ON t_p77366720_vmessage_crossplatfo.vm_chats(invite_code);
CREATE INDEX IF NOT EXISTS idx_vm_chats_public ON t_p77366720_vmessage_crossplatfo.vm_chats(is_public);
