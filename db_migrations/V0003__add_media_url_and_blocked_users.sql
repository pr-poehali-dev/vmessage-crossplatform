ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_messages ADD COLUMN IF NOT EXISTS media_url TEXT NULL;

CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_blocked_users (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
  blocked_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_id)
);