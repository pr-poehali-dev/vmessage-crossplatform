ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_chats
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS members_can_write BOOLEAN NOT NULL DEFAULT TRUE;

-- Для каналов по умолчанию писать могут только админы
UPDATE t_p77366720_vmessage_crossplatfo.vm_chats SET members_can_write = FALSE WHERE type = 'channel';

-- Добавить роль owner в vm_chat_members (владелец)
-- Обновить создателей группп/каналов до роли owner
UPDATE t_p77366720_vmessage_crossplatfo.vm_chat_members cm
SET role = 'owner'
FROM t_p77366720_vmessage_crossplatfo.vm_chats c
WHERE cm.chat_id = c.id AND cm.user_id = c.created_by AND c.type IN ('group', 'channel');