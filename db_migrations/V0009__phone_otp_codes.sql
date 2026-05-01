-- Таблица OTP-кодов для верификации телефона
CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_phone_codes (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(10) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'register', -- register | change_phone
    user_id INTEGER REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
    used BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_vm_phone_codes_phone ON t_p77366720_vmessage_crossplatfo.vm_phone_codes(phone);
