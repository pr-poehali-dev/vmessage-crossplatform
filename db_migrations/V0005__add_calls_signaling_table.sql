CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_calls (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    callee_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    call_type VARCHAR(10) NOT NULL DEFAULT 'audio',
    status VARCHAR(20) NOT NULL DEFAULT 'ringing',
    offer TEXT,
    answer TEXT,
    caller_ice TEXT DEFAULT '[]',
    callee_ice TEXT DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);