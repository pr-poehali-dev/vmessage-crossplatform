ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_messages
  ADD COLUMN IF NOT EXISTS reply_to_id integer NULL,
  ADD COLUMN IF NOT EXISTS reply_to_text text NULL,
  ADD COLUMN IF NOT EXISTS reply_to_sender text NULL;