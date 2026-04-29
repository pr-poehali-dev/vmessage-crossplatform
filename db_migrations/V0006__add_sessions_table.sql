CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    token TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL DEFAULT 'Неизвестное устройство',
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vm_sessions_token ON t_p77366720_vmessage_crossplatfo.vm_sessions(token);
CREATE INDEX IF NOT EXISTS idx_vm_sessions_user_id ON t_p77366720_vmessage_crossplatfo.vm_sessions(user_id);