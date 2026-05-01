-- Таблица реакций на сообщения
CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_message_reactions (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_messages(id),
    user_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_vm_reactions_message_id ON t_p77366720_vmessage_crossplatfo.vm_message_reactions(message_id);

-- Таблица стикер-паков
CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_sticker_packs (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    name VARCHAR(100) NOT NULL,
    cover_url TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_stickers (
    id SERIAL PRIMARY KEY,
    pack_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_sticker_packs(id),
    image_url TEXT NOT NULL,
    emoji VARCHAR(10) DEFAULT '',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p77366720_vmessage_crossplatfo.vm_user_sticker_packs (
    user_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_users(id),
    pack_id INTEGER NOT NULL REFERENCES t_p77366720_vmessage_crossplatfo.vm_sticker_packs(id),
    PRIMARY KEY (user_id, pack_id)
);
