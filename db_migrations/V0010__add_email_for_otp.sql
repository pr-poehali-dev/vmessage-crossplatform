-- Добавляем поле email в таблицу кодов (phone оставляем для обратной совместимости)
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_phone_codes
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Добавляем email в таблицу пользователей
ALTER TABLE t_p77366720_vmessage_crossplatfo.vm_users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_vm_users_email ON t_p77366720_vmessage_crossplatfo.vm_users(email);
