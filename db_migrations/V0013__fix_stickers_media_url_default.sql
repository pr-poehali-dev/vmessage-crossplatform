-- Делаем media_url в vm_stickers с дефолтом (чтобы INSERT без него не падал)
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_stickers
  ALTER COLUMN media_url SET DEFAULT '';