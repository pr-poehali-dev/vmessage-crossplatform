import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { authApi, chatsApi, usersApi, getToken, getStoredUser, saveSession, clearSession } from "@/lib/api";
import type { User, Chat, Message } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = any;

const navItems = [
  { id: "chats", label: "Чаты", icon: "MessageCircle" },
  { id: "contacts", label: "Контакты", icon: "Users" },
  { id: "calls", label: "Звонки", icon: "Phone" },
  { id: "profile", label: "Профиль", icon: "User" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

// ─── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ label, color, size = 42, online }: { label: string; color: string; size?: number; online?: boolean }) {
  const ch = (label || "?")[0].toUpperCase();
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="flex items-center justify-center rounded-full font-bold text-white select-none"
        style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
        {ch}
      </div>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 rounded-full border-2 border-background ${online ? "bg-emerald-400" : "bg-gray-300"}`}
          style={{ width: size * 0.28, height: size * 0.28 }} />
      )}
    </div>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      let res;
      if (tab === "login") {
        res = await authApi.login(username.trim(), password);
      } else {
        res = await authApi.register(username.trim(), displayName.trim(), password);
      }
      if (res.ok) {
        saveSession(res.token, res.user);
        onAuth(res.token, res.user);
      } else {
        setError(res.error || "Ошибка");
      }
    } catch {
      setError("Нет соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center vm-chat-bg p-4">
      <div className="w-full max-w-sm animate-scale-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl vm-gradient-bg flex items-center justify-center mb-4 shadow-2xl shadow-violet-500/30 animate-float">
            <span className="text-white font-black text-4xl">V</span>
          </div>
          <h1 className="text-3xl font-black vm-gradient-text">V-message</h1>
          <p className="text-muted-foreground text-sm mt-1">Мессенджер нового поколения</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-3xl shadow-xl p-6 space-y-4">
          {/* Tabs */}
          <div className="flex bg-secondary rounded-2xl p-1">
            {(["login", "register"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${tab === t ? "vm-gradient-bg text-white shadow-md" : "text-muted-foreground"}`}>
                {t === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {tab === "register" && (
              <div className="relative">
                <Icon name="User" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ваше имя (отображаемое)"
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
              </div>
            )}
            <div className="relative">
              <Icon name="AtSign" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Имя пользователя (@username)"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <div className="relative">
              <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                placeholder="Пароль (минимум 6 символов)"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-500 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2">
              <Icon name="AlertCircle" size={15} />
              {error}
            </div>
          )}

          <button onClick={submit} disabled={loading}
            className="w-full vm-gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity active:scale-95 shadow-lg shadow-violet-500/30 disabled:opacity-60">
            {loading ? "Загрузка..." : tab === "login" ? "Войти" : "Создать аккаунт"}
          </button>

          <div className="flex items-center gap-2 justify-center">
            <Icon name="Lock" size={12} className="text-emerald-500" />
            <span className="text-xs text-muted-foreground">End-to-End Encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chat List ────────────────────────────────────────────────────────────────
function ChatList({ chats, loading, onOpen, onNew }: {
  chats: Chat[]; loading: boolean;
  onOpen: (chat: Chat) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Чаты</h2>
          <button onClick={onNew} className="p-2 rounded-xl vm-gradient-bg text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30">
            <Icon name="Plus" size={16} />
          </button>
        </div>
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск чатов..."
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-0.5">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Icon name="Loader" size={20} className="animate-spin mr-2" /> Загрузка...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="text-3xl mb-2">💬</div>
            Нет чатов. Нажмите + чтобы начать переписку
          </div>
        )}
        {filtered.map((c, i) => (
          <button key={c.id} onClick={() => onOpen(c)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 animate-fade-in stagger-${Math.min(i + 1, 5)}`}>
            <Avatar label={c.name} color={c.avatar_color} online={c.online} />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{c.last_time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{c.last_msg || "Нет сообщений"}</span>
                {c.unread > 0 && (
                  <span className="ml-2 flex-shrink-0 vm-gradient-bg text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {c.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────
function NewChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: (chatId: number) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const res = await usersApi.search(q);
    setLoading(false);
    if (res.ok) setResults(res.users);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 400);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const startChat = async (user: User) => {
    setError("");
    const res = await chatsApi.createPrivate(user.username);
    if (res.ok) {
      onCreated(res.chat_id);
    } else {
      setError(res.error || "Ошибка");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Новый чат</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="relative mb-3">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или @username"
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
        </div>
        {error && <div className="text-red-500 text-xs mb-2 px-1">{error}</div>}
        <div className="space-y-1 max-h-64 overflow-y-auto vm-scrollbar">
          {loading && <div className="text-center py-4 text-muted-foreground text-sm">Поиск...</div>}
          {!loading && search.length >= 2 && results.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">Пользователи не найдены</div>
          )}
          {results.map(u => (
            <button key={u.id} onClick={() => startChat(u)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
              <Avatar label={u.display_name} color={u.avatar_color} online={u.online} />
              <div className="text-left">
                <div className="font-semibold text-sm">{u.display_name}</div>
                <div className="text-xs text-muted-foreground">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────
function ChatView({ chat, me, onBack }: { chat: Chat; me: User; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await chatsApi.messages(chat.id);
    if (res.ok) setMessages(res.messages);
    setLoading(false);
  }, [chat.id]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const res = await chatsApi.send(chat.id, text);
    if (res.ok) {
      setMessages(m => [...m, { ...res.message, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    }
  };

  return (
    <div className="flex flex-col h-full animate-scale-in">
      {/* Header */}
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <Avatar label={chat.name} color={chat.avatar_color} online={chat.online} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{chat.name}</div>
          <div className={`text-xs ${chat.online ? "text-emerald-500" : "text-muted-foreground"}`}>
            {chat.online ? "в сети" : "был(а) недавно"}
          </div>
        </div>
        <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
          <Icon name="Phone" size={18} />
        </button>
        <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
          <Icon name="Video" size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto vm-scrollbar vm-chat-bg px-4 py-4 space-y-2">
        <div className="flex items-center justify-center my-3">
          <span className="bg-black/10 dark:bg-white/10 backdrop-blur-md text-xs px-3 py-1 rounded-full text-foreground/60">Сегодня</span>
        </div>
        {loading && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Icon name="Loader" size={20} className="animate-spin" />
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id} className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}
            style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
            <div className={`max-w-[72%] px-4 py-2.5 text-sm ${m.out ? "vm-msg-out" : "vm-msg-in dark:text-white text-gray-800"}`}>
              {!m.out && chat.type === "group" && (
                <div className="text-xs font-semibold mb-1" style={{ color: m.sender_color }}>{m.sender_name}</div>
              )}
              <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
              <div className={`flex items-center justify-end gap-1 mt-1 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                <span className="text-[10px]">{m.time}</span>
                {m.out && (
                  m.status === "read" ? <Icon name="CheckCheck" size={12} className="text-cyan-300" /> :
                  m.status === "delivered" ? <Icon name="CheckCheck" size={12} /> :
                  <Icon name="Check" size={12} />
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="vm-glass border-t px-3 py-3 flex items-end gap-2 flex-shrink-0">
        <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500 flex-shrink-0">
          <Icon name="Paperclip" size={20} />
        </button>
        <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500 flex-shrink-0">
          <Icon name="Smile" size={20} />
        </button>
        <div className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 flex items-center min-h-[42px]">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Написать сообщение..."
            className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <button onClick={send}
          className="p-2.5 rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-violet-500/30">
          {input.trim() ? <Icon name="Send" size={18} /> : <Icon name="Mic" size={18} />}
        </button>
      </div>
    </div>
  );
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
function ContactsSection({ me, onStartChat }: { me: User; onStartChat: (username: string) => void }) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.contacts().then(res => {
      if (res.ok) setContacts(res.contacts);
      setLoading(false);
    });
  }, []);

  const filtered = contacts.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Контакты</h2>
        </div>
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск..." className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2">
        {loading && <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <div className="text-3xl mb-2">👥</div>
            Начните чат с кем-то — они появятся здесь
          </div>
        )}
        {filtered.map((c, i) => (
          <div key={c.id} className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}>
            <Avatar label={c.display_name} color={c.avatar_color} online={c.online} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{c.display_name}</div>
              <div className="text-xs text-muted-foreground">@{c.username}</div>
            </div>
            <button onClick={() => onStartChat(c.username)}
              className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-violet-500 transition-colors">
              <Icon name="MessageCircle" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfileSection({ me, onUpdate, onLogout }: { me: User; onUpdate: (u: User) => void; onLogout: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await usersApi.update({ display_name: name, bio });
    if (res.ok) {
      onUpdate(res.user);
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar">
      <div className="relative vm-gradient-bg pt-10 pb-16 px-6 flex-shrink-0">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 60%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="relative animate-float">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl text-white font-black text-4xl"
              style={{ background: me.avatar_color }}>
              {me.display_name[0]?.toUpperCase()}
            </div>
          </div>
          <h2 className="text-white font-bold text-xl mt-3">{me.display_name}</h2>
          <p className="text-white/70 text-sm mt-1">@{me.username}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-white/80 text-xs">в сети</span>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm">Личные данные</span>
          {editing ? (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-secondary">Отмена</button>
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 rounded-xl text-xs font-medium vm-gradient-bg text-white shadow-lg shadow-violet-500/30">
                {saving ? "..." : "Сохранить"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-secondary hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">
              Изменить
            </button>
          )}
        </div>
        {[
          { label: "Имя", value: name, set: setName, icon: "User" },
          { label: "Имя пользователя", value: me.username, set: () => {}, icon: "AtSign", readonly: true },
          { label: "О себе", value: bio, set: setBio, icon: "FileText" },
        ].map(({ label, value, set, icon, readonly }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <div className="relative">
              <Icon name={icon as AnyIcon} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              {editing && !readonly ? (
                <input value={value} onChange={e => set(e.target.value)}
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
              ) : (
                <div className="bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground/80">{value || "—"}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-4 mb-4 bg-card rounded-3xl p-2 flex-shrink-0">
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Icon name="LogOut" size={16} className="text-red-500" />
          </div>
          <span className="text-sm font-medium">Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsSection() {
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar pb-4">
      <div className="p-4 pb-2"><h2 className="text-lg font-bold">Настройки</h2></div>
      {[
        {
          title: "Внешний вид",
          items: [
            { label: "Тёмная тема", icon: "Moon", color: "text-indigo-500", isToggle: true, value: darkMode, onClick: () => { setDarkMode(v => !v); document.documentElement.classList.toggle("dark"); } },
          ]
        },
        {
          title: "Уведомления",
          items: [
            { label: "Push-уведомления", icon: "Bell", color: "text-orange-500", isToggle: true, value: notifications, onClick: () => setNotifications(v => !v) },
          ]
        },
        {
          title: "Конфиденциальность",
          items: [
            { label: "Секретные чаты (E2EE)", icon: "Lock", color: "text-yellow-500", isToggle: false, value: "", onClick: undefined },
            { label: "Активные сессии", icon: "Monitor", color: "text-blue-500", isToggle: false, value: "", onClick: undefined },
          ]
        },
      ].map(group => (
        <div key={group.title} className="mx-4 mt-4 bg-card rounded-3xl p-2">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</div>
          {group.items.map(({ label, icon, color, isToggle, value, onClick }) => (
            <button key={label} onClick={onClick}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-secondary transition-colors text-left">
              <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon name={icon as AnyIcon} size={16} className={color} />
              </div>
              <span className="text-sm font-medium flex-1">{label}</span>
              {isToggle ? (
                <div className={`w-11 h-6 rounded-full transition-all duration-300 flex items-center px-1 ${value ? "vm-gradient-bg" : "bg-secondary"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${value ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              ) : (
                <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function Index() {
  const [me, setMe] = useState<User | null>(getStoredUser());
  const [activeTab, setActiveTab] = useState("chats");
  const [openChat, setOpenChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);

  // Auth check on load
  useEffect(() => {
    if (getToken() && !me) {
      authApi.me().then(res => {
        if (res.ok) setMe(res.user);
        else { clearSession(); setMe(null); }
      });
    }
  }, []);

  // Load chats
  const loadChats = useCallback(async () => {
    if (!me) return;
    const res = await chatsApi.list();
    if (res.ok) setChats(res.chats);
    setChatsLoading(false);
  }, [me]);

  useEffect(() => {
    if (me) {
      loadChats();
      const t = setInterval(loadChats, 5000);
      return () => clearInterval(t);
    }
  }, [me, loadChats]);

  const handleLogout = async () => {
    await authApi.logout();
    clearSession();
    setMe(null);
    setChats([]);
    setOpenChat(null);
  };

  const handleNewChatCreated = async (chatId: number) => {
    setShowNewChat(false);
    await loadChats();
    const res = await chatsApi.list();
    if (res.ok) {
      setChats(res.chats);
      const found = res.chats.find((c: Chat) => c.id === chatId);
      if (found) { setOpenChat(found); setActiveTab("chats"); }
    }
  };

  const handleStartChatWith = async (username: string) => {
    const res = await chatsApi.createPrivate(username);
    if (res.ok) handleNewChatCreated(res.chat_id);
  };

  if (!me) return <AuthScreen onAuth={(_, user) => setMe(user)} />;

  const activeNav = navItems.find(n => n.id === activeTab);

  const leftPanel: Record<string, React.ReactNode> = {
    chats: <ChatList chats={chats} loading={chatsLoading} onOpen={c => setOpenChat(c)} onNew={() => setShowNewChat(true)} />,
    contacts: <ContactsSection me={me} onStartChat={u => { handleStartChatWith(u); setActiveTab("chats"); }} />,
    calls: (
      <div className="flex flex-col h-full">
        <div className="p-4"><h2 className="text-lg font-bold">Звонки</h2></div>
        <div className="flex-1 flex items-center justify-center text-center px-6">
          <div>
            <div className="text-4xl mb-3">📞</div>
            <p className="text-muted-foreground text-sm">Звонки появятся здесь.<br/>Откройте чат и нажмите на иконку звонка.</p>
          </div>
        </div>
      </div>
    ),
    profile: <ProfileSection me={me} onUpdate={u => { setMe(u); saveSession(getToken()!, u); }} onLogout={handleLogout} />,
    settings: <SettingsSection />,
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background font-golos">
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onCreated={handleNewChatCreated} />}

      {/* Nav */}
      <nav className="vm-glass border-r w-16 flex flex-col items-center py-4 gap-1 z-10 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl vm-gradient-bg flex items-center justify-center mb-3 shadow-lg shadow-violet-500/30 animate-float">
          <span className="text-white font-black text-lg">V</span>
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); if (item.id !== "chats") setOpenChat(null); }}
            title={item.label}
            className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 ${
              activeTab === item.id ? "vm-gradient-bg text-white shadow-lg shadow-violet-500/30 scale-105" : "text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-500"
            }`}>
            <Icon name={item.icon as AnyIcon} size={19} />
            {item.id === "chats" && chats.reduce((s, c) => s + (c.unread || 0), 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {Math.min(chats.reduce((s, c) => s + (c.unread || 0), 0), 9)}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => document.documentElement.classList.toggle("dark")}
          className="w-10 h-10 rounded-2xl text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-500 transition-all flex items-center justify-center">
          <Icon name="Sun" size={18} />
        </button>
      </nav>

      {/* Left Panel */}
      <div className={`w-80 vm-glass border-r flex-shrink-0 ${openChat && activeTab === "chats" ? "hidden md:flex" : "flex"} flex-col`}>
        {leftPanel[activeTab]}
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTab === "chats" && openChat ? (
          <ChatView chat={openChat} me={me} onBack={() => setOpenChat(null)} />
        ) : activeTab === "chats" ? (
          <div className="flex-1 vm-chat-bg flex flex-col items-center justify-center text-center p-8 animate-fade-in">
            <div className="w-24 h-24 rounded-3xl vm-gradient-bg flex items-center justify-center mb-6 shadow-2xl shadow-violet-500/30 animate-float">
              <span className="text-white font-black text-5xl">V</span>
            </div>
            <h2 className="text-2xl font-bold mb-2 vm-gradient-text">Добро пожаловать, {me.display_name.split(" ")[0]}!</h2>
            <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
              Выберите чат или нажмите + чтобы начать новую беседу
            </p>
            <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-black/5 dark:bg-white/5">
              <Icon name="Lock" size={14} className="text-emerald-500" />
              <span className="text-xs text-muted-foreground">End-to-End Encryption</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 vm-chat-bg flex items-center justify-center animate-fade-in">
            <div className="text-center">
              <div className="w-16 h-16 rounded-3xl vm-gradient-bg flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-500/20">
                <Icon name={(activeNav?.icon ?? "Circle") as AnyIcon} size={28} className="text-white" />
              </div>
              <h3 className="font-bold text-lg vm-gradient-text">{activeNav?.label}</h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
