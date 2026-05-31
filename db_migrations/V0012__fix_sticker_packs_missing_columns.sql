-- Добавляем недостающие поля в vm_sticker_packs
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_sticker_packs
  ADD COLUMN IF NOT EXISTS cover_url text NULL;

-- Добавляем недостающие поля в vm_stickers
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_stickers
  ADD COLUMN IF NOT EXISTS image_url text NULL,
  ADD COLUMN IF NOT EXISTS position integer NULL DEFAULT 0;

-- Синхронизируем image_url и media_url (они одно и то же)
UPDATE t_p77366720_vmessage_crossplatfo.vm_stickers
  SET image_url = media_url
  WHERE image_url IS NULL AND media_url IS NOT NULL;