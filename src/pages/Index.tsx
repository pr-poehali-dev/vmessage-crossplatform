import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { authApi, chatsApi, usersApi, getToken, getStoredUser, saveSession, clearSession } from "@/lib/api";
import type { User, Chat, Message } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = any;

const EMOJI_LIST = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","🎉","✅","💯","🙏","😊","🤣","😅","😭","🥳","😴","🤯","👀","💪","🚀","⭐","🌟","💎","🎵","🍕","🍔","🍺","☕","🌈","🌺","🦋","🐱","🐶","🎮"];

const navItems = [
  { id: "chats", label: "Чаты", icon: "MessageCircle" },
  { id: "contacts", label: "Контакты", icon: "Users" },
  { id: "calls", label: "Звонки", icon: "Phone" },
  { id: "profile", label: "Профиль", icon: "User" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

// ─── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ label, color, size = 42, online, src }: { label: string; color: string; size?: number; online?: boolean; src?: string }) {
  const ch = (label || "?")[0].toUpperCase();
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={label} className="rounded-full object-cover w-full h-full" style={{ width: size, height: size }} />
      ) : (
        <div className="flex items-center justify-center rounded-full font-bold text-white select-none"
          style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
          {ch}
        </div>
      )}
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
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl vm-gradient-bg flex items-center justify-center mb-4 shadow-2xl shadow-violet-500/30 animate-float">
            <span className="text-white font-black text-4xl">V</span>
          </div>
          <h1 className="text-3xl font-black vm-gradient-text">V-message</h1>
          <p className="text-muted-foreground text-sm mt-1">Мессенджер нового поколения</p>
        </div>
        <div className="bg-card rounded-3xl shadow-xl p-6 space-y-4">
          <div className="flex bg-secondary rounded-2xl p-1">
            {(["login", "register"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${tab === t ? "vm-gradient-bg text-white shadow-md" : "text-muted-foreground"}`}>
                {t === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>
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
                <span className="text-xs text-muted-foreground truncate">
                  {c.last_msg?.startsWith("🎤") ? "🎤 Голосовое" :
                   c.last_msg?.startsWith("📷") ? "📷 Фото" :
                   c.last_msg?.startsWith("🎬") ? "🎬 Видео" :
                   c.last_msg?.startsWith("📎") ? "📎 Файл" :
                   c.last_msg?.startsWith("⭕") ? "⭕ Видеосообщение" :
                   c.last_msg || "Нет сообщений"}
                </span>
                {c.unread > 0 && (
                  <span className="ml-2 flex-shrink-0 min-w-[18px] h-[18px] vm-gradient-bg rounded-full text-[10px] text-white flex items-center justify-center font-bold px-1">
                    {Math.min(c.unread, 99)}
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
  const [tab, setTab] = useState<"private" | "group" | "channel">("private");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupName, setGroupName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [creating, setCreating] = useState(false);

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

  const startPrivate = async (user: User) => {
    setError("");
    const res = await chatsApi.createPrivate(user.username);
    if (res.ok) onCreated(res.chat_id);
    else setError(res.error || "Ошибка");
  };

  const createGroup = async () => {
    if (!groupName.trim()) { setError("Введите название группы"); return; }
    setCreating(true);
    const res = await chatsApi.createGroup(groupName.trim());
    setCreating(false);
    if (res.ok) onCreated(res.chat_id);
    else setError(res.error || "Ошибка");
  };

  const createChannel = async () => {
    if (!channelName.trim()) { setError("Введите название канала"); return; }
    setCreating(true);
    const res = await chatsApi.createChannel(channelName.trim(), channelDesc.trim());
    setCreating(false);
    if (res.ok) onCreated(res.chat_id);
    else setError(res.error || "Ошибка");
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

        {/* Tabs */}
        <div className="flex bg-secondary rounded-2xl p-1 mb-4 gap-0.5">
          {([["private","Личный","User"],["group","Группа","Users"],["channel","Канал","Megaphone"]] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => { setTab(id); setError(""); }}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${tab === id ? "vm-gradient-bg text-white shadow-md" : "text-muted-foreground"}`}>
              <Icon name={icon as AnyIcon} size={13} />
              {label}
            </button>
          ))}
        </div>

        {error && <div className="text-red-500 text-xs mb-3 px-1 flex items-center gap-1"><Icon name="AlertCircle" size={13} />{error}</div>}

        {tab === "private" && (
          <>
            <div className="relative mb-3">
              <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени или @username"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto vm-scrollbar">
              {loading && <div className="text-center py-4 text-muted-foreground text-sm">Поиск...</div>}
              {!loading && search.length >= 2 && results.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">Пользователи не найдены</div>
              )}
              {results.map(u => (
                <button key={u.id} onClick={() => startPrivate(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                  <Avatar label={u.display_name} color={u.avatar_color} online={u.online} />
                  <div className="text-left">
                    <div className="font-semibold text-sm">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground">@{u.username}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "group" && (
          <div className="space-y-3">
            <div className="text-center text-4xl py-2">👥</div>
            <p className="text-xs text-muted-foreground text-center">Создайте группу для общения нескольких людей</p>
            <div className="relative">
              <Icon name="Users" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={groupName} onChange={e => setGroupName(e.target.value)}
                placeholder="Название группы"
                onKeyDown={e => e.key === "Enter" && createGroup()}
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <button onClick={createGroup} disabled={creating}
              className="w-full vm-gradient-bg text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 shadow-lg shadow-violet-500/30">
              {creating ? "Создание..." : "Создать группу"}
            </button>
          </div>
        )}

        {tab === "channel" && (
          <div className="space-y-3">
            <div className="text-center text-4xl py-2">📢</div>
            <p className="text-xs text-muted-foreground text-center">Канал для публикации новостей и анонсов</p>
            <div className="relative">
              <Icon name="Megaphone" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={channelName} onChange={e => setChannelName(e.target.value)}
                placeholder="Название канала"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <div className="relative">
              <Icon name="FileText" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={channelDesc} onChange={e => setChannelDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <button onClick={createChannel} disabled={creating}
              className="w-full vm-gradient-bg text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 shadow-lg shadow-violet-500/30">
              {creating ? "Создание..." : "Создать канал"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-card rounded-2xl shadow-2xl border border-border p-3 z-50 animate-scale-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">Эмодзи</span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors"><Icon name="X" size={14} /></button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_LIST.map(e => (
          <button key={e} onClick={() => { onPick(e); onClose(); }}
            className="text-xl p-1 rounded-lg hover:bg-secondary transition-colors text-center">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Voice Message Recorder ───────────────────────────────────────────────────
function VoiceRecorder({ onSend, onCancel }: { onSend: (blob: Blob, duration: number) => void; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
    }).catch(() => onCancel());

    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      mediaRef.current?.stream?.getTracks().forEach(t => t.stop());
    };
  }, [onCancel]);

  const stop = () => {
    const dur = seconds;
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current) {
      mediaRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onSend(blob, dur);
        mediaRef.current?.stream?.getTracks().forEach(t => t.stop());
      };
      mediaRef.current.stop();
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 flex-1 animate-fade-in">
      <button onClick={onCancel} className="p-2 rounded-xl hover:bg-secondary transition-colors text-red-500 flex-shrink-0">
        <Icon name="Trash2" size={20} />
      </button>
      <div className="flex-1 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-2xl px-4 py-2.5">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm text-red-500 font-mono">{fmt(seconds)}</span>
        <span className="text-xs text-muted-foreground ml-1">Запись...</span>
      </div>
      <button onClick={stop} className="p-2.5 rounded-xl vm-gradient-bg text-white flex-shrink-0 shadow-lg shadow-violet-500/30">
        <Icon name="Send" size={18} />
      </button>
    </div>
  );
}

// ─── Video Note Recorder (кружки) ─────────────────────────────────────────────
function VideoNoteModal({ onSend, onClose }: { onSend: (blob: Blob, duration: number) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true }).then(stream => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }).catch(() => onClose());
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onClose]);

  const startRec = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current);
    mediaRef.current = mr;
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(100);
    setRecording(true);
    timerRef.current = setInterval(() => setSeconds(s => {
      if (s >= 59) { stopRec(); return s; }
      return s + 1;
    }), 1000);
  };

  const stopRec = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      const dur = seconds;
      mediaRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        streamRef.current?.getTracks().forEach(t => t.stop());
        onSend(blob, dur);
      };
      mediaRef.current.stop();
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-56 h-56 rounded-full overflow-hidden border-4 border-white shadow-2xl">
          <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
          {recording && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white text-xs font-mono">{fmt(seconds)}</span>
              </div>
            </div>
          )}
          {recording && (
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" fill="none" stroke="#8b5cf6" strokeWidth="4"
                strokeDasharray={`${(seconds / 60) * 301.6} 301.6`}
                strokeLinecap="round" transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dasharray 1s linear" }} />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors">
            <Icon name="X" size={22} />
          </button>
          {!recording ? (
            <button onClick={startRec} className="w-16 h-16 rounded-full vm-gradient-bg text-white flex items-center justify-center shadow-2xl shadow-violet-500/50 hover:opacity-90 transition-opacity">
              <Icon name="Video" size={28} />
            </button>
          ) : (
            <button onClick={stopRec} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
              <Icon name="Square" size={24} />
            </button>
          )}
        </div>
        <p className="text-white/60 text-sm">{recording ? "Нажмите стоп для отправки" : "Нажмите для записи"}</p>
      </div>
    </div>
  );
}

// ─── User Profile Modal ───────────────────────────────────────────────────────
function UserProfileModal({ user, onClose, onStartChat, onBlock }: {
  user: User; onClose: () => void;
  onStartChat: (username: string) => void;
  onBlock: (userId: number) => void;
}) {
  const [blocking, setBlocking] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="relative vm-gradient-bg pt-8 pb-12 px-6 flex flex-col items-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors">
            <Icon name="X" size={16} />
          </button>
          <Avatar label={user.display_name} color={user.avatar_color} size={80} online={user.online} />
          <h3 className="text-white font-bold text-xl mt-3">{user.display_name}</h3>
          <p className="text-white/70 text-sm">@{user.username}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-2 h-2 rounded-full ${user.online ? "bg-emerald-400" : "bg-white/40"}`} />
            <span className="text-white/70 text-xs">{user.online ? "в сети" : "не в сети"}</span>
          </div>
        </div>
        <div className="mx-4 -mt-6 bg-card rounded-2xl shadow-lg p-4 mb-4">
          {user.bio && (
            <div className="flex items-start gap-2 mb-3">
              <Icon name="FileText" size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground/80">{user.bio}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Icon name="AtSign" size={16} className="text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground">@{user.username}</span>
          </div>
        </div>
        <div className="px-4 pb-4 space-y-2">
          <button onClick={() => { onStartChat(user.username); onClose(); }}
            className="w-full vm-gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2">
            <Icon name="MessageCircle" size={18} />
            Написать сообщение
          </button>
          <button onClick={async () => { setBlocking(true); await onBlock(user.id); setBlocking(false); onClose(); }}
            disabled={blocking}
            className="w-full bg-red-50 dark:bg-red-900/20 text-red-500 font-semibold py-3 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            <Icon name="ShieldOff" size={18} />
            {blocking ? "..." : "Добавить в чёрный список"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Call Modal ───────────────────────────────────────────────────────────────
function CallModal({ chat, type, onClose }: { chat: Chat; type: "audio" | "video"; onClose: () => void }) {
  const [status, setStatus] = useState<"calling" | "connected" | "ended">("calling");
  const [seconds, setSeconds] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setStatus("connected");
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    }, 2000);

    if (type === "video") {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play();
        }
      }).catch(() => {});
    }

    return () => {
      clearTimeout(t);
      if (timerRef.current) clearInterval(timerRef.current);
      if (localVideoRef.current?.srcObject) {
        (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [type]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const endCall = () => {
    setStatus("ended");
    setTimeout(onClose, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-violet-900 to-indigo-900 p-8 animate-fade-in">
      {type === "video" && (
        <div className="absolute inset-0">
          <div className="w-full h-full bg-black/60 flex items-center justify-center">
            <div className="text-white/20 text-9xl">👤</div>
          </div>
          <div className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
          </div>
        </div>
      )}

      <div className="relative flex flex-col items-center mt-12 z-10">
        <Avatar label={chat.name} color={chat.avatar_color} size={100} />
        <h2 className="text-white font-bold text-2xl mt-4">{chat.name}</h2>
        <p className="text-white/70 text-sm mt-1">
          {status === "calling" ? (type === "video" ? "Видеозвонок..." : "Голосовой звонок...") :
           status === "connected" ? fmt(seconds) : "Звонок завершён"}
        </p>
        {status === "calling" && (
          <div className="flex gap-1 mt-3">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-6 z-10 mb-8">
        {type === "video" && (
          <button className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors">
            <Icon name="VideoOff" size={22} />
          </button>
        )}
        <button className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors">
          <Icon name="MicOff" size={22} />
        </button>
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
          <Icon name="PhoneOff" size={26} />
        </button>
        <button className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors">
          <Icon name="Speaker" size={22} />
        </button>
      </div>
    </div>
  );
}

// ─── Active Sessions Modal ────────────────────────────────────────────────────
function ActiveSessionsModal({ onClose }: { onClose: () => void }) {
  const sessions = [
    { id: 1, device: "Этот браузер", os: navigator.userAgent.includes("Mobile") ? "Мобильное устройство" : "Компьютер", browser: navigator.userAgent.includes("Chrome") ? "Chrome" : navigator.userAgent.includes("Firefox") ? "Firefox" : "Браузер", time: "Сейчас", current: true, icon: "Monitor" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Активные сессии</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="space-y-2 mb-4">
          {sessions.map(s => (
            <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl ${s.current ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" : "bg-secondary"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.current ? "vm-gradient-bg" : "bg-muted"}`}>
                <Icon name={s.icon as AnyIcon} size={18} className={s.current ? "text-white" : "text-muted-foreground"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{s.device}</span>
                  {s.current && <span className="text-[10px] vm-gradient-bg text-white px-2 py-0.5 rounded-full">текущая</span>}
                </div>
                <div className="text-xs text-muted-foreground">{s.os} · {s.browser}</div>
                <div className="text-xs text-muted-foreground">{s.time}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 mb-3">
          <div className="flex items-start gap-2">
            <Icon name="Info" size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-600 dark:text-blue-400">Если вы видите незнакомые сессии — смените пароль и завершите все другие сессии.</p>
          </div>
        </div>
        <button className="w-full bg-red-50 dark:bg-red-900/20 text-red-500 font-semibold py-2.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2">
          <Icon name="LogOut" size={16} />
          Завершить все другие сессии
        </button>
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────
function ChatView({ chat, me, onBack, onStartChat }: { chat: Chat; me: User; onBack: () => void; onStartChat: (u: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showVideoNote, setShowVideoNote] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showCall, setShowCall] = useState<"audio" | "video" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const loadMessages = useCallback(async () => {
    const res = await chatsApi.messages(chat.id);
    if (res.ok) setMessages(res.messages);
    setLoading(false);
  }, [chat.id]);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
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

  const sendVoice = async (blob: Blob, duration: number) => {
    setRecording(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const res = await chatsApi.sendMedia(chat.id, base64, "audio/webm", "voice", `🎤 Голосовое ${duration}с`);
      if (res.ok) setMessages(m => [...m, { ...res.message, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    };
    reader.readAsDataURL(blob);
  };

  const sendVideoNote = async (blob: Blob, duration: number) => {
    setShowVideoNote(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const res = await chatsApi.sendMedia(chat.id, base64, "video/webm", "video_note", `⭕ Видеосообщение ${duration}с`);
      if (res.ok) setMessages(m => [...m, { ...res.message, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    };
    reader.readAsDataURL(blob);
  };

  const sendFile = async (file: File, msgType = "file") => {
    setShowAttachMenu(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const prefix = msgType === "image" ? "📷" : msgType === "video" ? "🎬" : "📎";
      const res = await chatsApi.sendMedia(chat.id, base64, file.type, msgType, `${prefix} ${file.name}`);
      if (res.ok) setMessages(m => [...m, { ...res.message, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    };
    reader.readAsDataURL(file);
  };

  const handleBlock = async (userId: number) => {
    await usersApi.blockUser(userId);
  };

  const renderMessage = (m: Message) => {
    const isVoice = m.type === "voice";
    const isVideoNote = m.type === "video_note";
    const isImage = m.type === "image";
    const isVideo = m.type === "video";
    const isFile = m.type === "file";
    const hasMedia = m.media_url;

    if (isVideoNote) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className="flex flex-col items-center gap-1">
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white dark:border-gray-700 shadow-lg relative">
              {hasMedia ? (
                <video src={m.media_url} className="w-full h-full object-cover" controls={false}
                  onClick={e => { const v = e.target as HTMLVideoElement; if (v.paused) { v.play(); } else { v.pause(); } }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-violet-100 dark:bg-violet-900">
                  <Icon name="Video" size={32} className="text-violet-500" />
                </div>
              )}
              <button className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity rounded-full">
                <Icon name="Play" size={24} className="text-white" />
              </button>
            </div>
            <div className={`flex items-center gap-1 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
              <span>{m.time}</span>
              {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-400" /> : <Icon name="CheckCheck" size={10} />)}
            </div>
          </div>
        </div>
      );
    }

    if (isVoice) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[220px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
            <button onClick={() => {
              if (hasMedia) {
                const audio = new Audio(m.media_url);
                audio.play();
              }
            }} className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${m.out ? "bg-white/20" : "bg-violet-100 dark:bg-violet-900"}`}>
              <Icon name="Play" size={16} className={m.out ? "text-white" : "text-violet-500"} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-0.5 h-5">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className={`w-1 rounded-full ${m.out ? "bg-white/60" : "bg-violet-300"}`}
                    style={{ height: `${30 + Math.sin(i * 1.3) * 50}%` }} />
                ))}
              </div>
              <div className={`text-[10px] mt-0.5 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                {m.text?.replace("🎤 Голосовое ", "") || "0с"} · {m.time}
                {m.out && " "}
                {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300 inline" /> : <Icon name="CheckCheck" size={10} className="inline" />)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (isImage && hasMedia) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className="max-w-[240px]">
            <img src={m.media_url} alt="фото" className="rounded-2xl w-full object-cover max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(m.media_url, "_blank")} />
            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
              <span>{m.time}</span>
              {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300" /> : <Icon name="CheckCheck" size={10} />)}
            </div>
          </div>
        </div>
      );
    }

    if (isVideo && hasMedia) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className="max-w-[240px]">
            <video src={m.media_url} className="rounded-2xl w-full max-h-48 object-cover" controls />
            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
              <span>{m.time}</span>
              {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300" /> : <Icon name="CheckCheck" size={10} />)}
            </div>
          </div>
        </div>
      );
    }

    if (isFile) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[240px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${m.out ? "bg-white/20" : "bg-violet-100 dark:bg-violet-900"}`}>
              <Icon name="FileText" size={18} className={m.out ? "text-white" : "text-violet-500"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${m.out ? "text-white" : ""}`}>{m.text?.replace("📎 ", "") || "Файл"}</div>
              {hasMedia && (
                <a href={m.media_url} target="_blank" rel="noreferrer"
                  className={`text-xs underline ${m.out ? "text-white/70" : "text-violet-500"}`}>Скачать</a>
              )}
              <div className={`text-[10px] mt-0.5 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>{m.time}</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
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
    );
  };

  return (
    <div className="flex flex-col h-full animate-scale-in">
      {showCall && <CallModal chat={chat} type={showCall} onClose={() => setShowCall(null)} />}
      {showVideoNote && <VideoNoteModal onSend={sendVideoNote} onClose={() => setShowVideoNote(false)} />}
      {showUserProfile && chat.username && (
        <UserProfileModal
          user={{ id: 0, username: chat.username, display_name: chat.name, avatar_color: chat.avatar_color, online: chat.online }}
          onClose={() => setShowUserProfile(false)}
          onStartChat={u => { onStartChat(u); setShowUserProfile(false); }}
          onBlock={handleBlock}
        />
      )}

      {/* Header */}
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <button onClick={() => chat.type === "private" && setShowUserProfile(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Avatar label={chat.name} color={chat.avatar_color} online={chat.online} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{chat.name}</div>
            <div className={`text-xs ${chat.online ? "text-emerald-500" : "text-muted-foreground"}`}>
              {chat.type === "group" ? "группа" : chat.type === "channel" ? "канал" : chat.online ? "в сети" : "был(а) недавно"}
            </div>
          </div>
        </button>
        <button onClick={() => setShowCall("audio")} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
          <Icon name="Phone" size={18} />
        </button>
        <button onClick={() => setShowCall("video")} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
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
          <div key={m.id} style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
            {renderMessage(m)}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="vm-glass border-t px-3 py-3 flex-shrink-0">
        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <div className="flex items-end gap-2">
            {/* Attach menu */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowAttachMenu(v => !v)} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
                <Icon name="Paperclip" size={20} />
              </button>
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-card rounded-2xl shadow-2xl border border-border p-2 z-50 animate-scale-in min-w-[160px]">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Icon name="Image" size={16} className="text-blue-500" />
                    </div>
                    Фото
                  </button>
                  <button onClick={() => videoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Icon name="Film" size={16} className="text-purple-500" />
                    </div>
                    Видео
                  </button>
                  <button onClick={() => docInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Icon name="FileText" size={16} className="text-green-500" />
                    </div>
                    Файл
                  </button>
                  <button onClick={() => { setShowAttachMenu(false); setShowVideoNote(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      <span className="text-base">⭕</span>
                    </div>
                    Видеозаметка
                  </button>
                </div>
              )}
            </div>

            {/* Emoji */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowEmoji(v => !v)} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
                <Icon name="Smile" size={20} />
              </button>
              {showEmoji && (
                <EmojiPicker onPick={e => { setInput(v => v + e); inputRef.current?.focus(); }} onClose={() => setShowEmoji(false)} />
              )}
            </div>

            <div className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 flex items-center min-h-[42px]">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Написать сообщение..."
                className="flex-1 bg-transparent outline-none text-sm" />
            </div>

            {input.trim() ? (
              <button onClick={send}
                className="p-2.5 rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-violet-500/30">
                <Icon name="Send" size={18} />
              </button>
            ) : (
              <button onClick={() => setRecording(true)}
                className="p-2.5 rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-violet-500/30">
                <Icon name="Mic" size={18} />
              </button>
            )}
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "image")} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "video")} />
        <input ref={docInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "file")} />
      </div>

      {/* Click outside to close menus */}
      {(showAttachMenu || showEmoji) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowAttachMenu(false); setShowEmoji(false); }} />
      )}
    </div>
  );
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
function ContactsSection({ me, onStartChat }: { me: User; onStartChat: (username: string) => void }) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    usersApi.contacts().then(res => {
      if (res.ok) setContacts(res.contacts);
      setLoading(false);
    });
  }, [me]);

  const filtered = contacts.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleBlock = async (userId: number) => {
    await usersApi.blockUser(userId);
    setContacts(c => c.filter(u => u.id !== userId));
  };

  return (
    <div className="flex flex-col h-full">
      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onStartChat={u => { onStartChat(u); setSelectedUser(null); }}
          onBlock={handleBlock}
        />
      )}
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
          <div key={c.id} className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
            onClick={() => setSelectedUser(c)}>
            <Avatar label={c.display_name} color={c.avatar_color} online={c.online} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{c.display_name}</div>
              <div className="text-xs text-muted-foreground">@{c.username}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); onStartChat(c.username); }}
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    const res = await usersApi.update({ display_name: name, bio });
    if (res.ok) {
      onUpdate(res.user);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleAvatarChange = async (file: File) => {
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const res = await usersApi.updateAvatar(base64, file.type);
      if (res.ok) onUpdate(res.user);
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const COLORS = ["#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#3b82f6","#6366f1"];

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar">
      <div className="relative vm-gradient-bg pt-10 pb-16 px-6 flex-shrink-0">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 60%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="relative animate-float">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl text-white font-black text-4xl cursor-pointer"
              style={{ background: me.avatar_color }}
              onClick={() => avatarInputRef.current?.click()}>
              {(me as User & { avatar_url?: string }).avatar_url ? (
                <img src={(me as User & { avatar_url?: string }).avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : me.display_name[0]?.toUpperCase()}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/30 rounded-full transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                {uploadingAvatar ? <Icon name="Loader" size={24} className="text-white animate-spin" /> : <Icon name="Camera" size={24} className="text-white" />}
              </div>
            </div>
            <button onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors">
              {uploadingAvatar ? <Icon name="Loader" size={14} className="text-violet-500 animate-spin" /> : <Icon name="Camera" size={14} className="text-violet-500" />}
            </button>
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleAvatarChange(e.target.files[0])} />
          <h2 className="text-white font-bold text-xl mt-3">{me.display_name}</h2>
          <p className="text-white/70 text-sm mt-1">@{me.username}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-white/80 text-xs">в сети</span>
          </div>
        </div>
      </div>

      {/* Color picker */}
      <div className="mx-4 -mt-6 bg-card rounded-3xl p-4 shadow-lg flex-shrink-0">
        <div className="text-xs text-muted-foreground mb-2">Цвет профиля</div>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(color => (
            <button key={color} onClick={async () => {
              const res = await usersApi.update({ avatar_color: color });
              if (res.ok) onUpdate(res.user);
            }}
              className={`w-8 h-8 rounded-full transition-all duration-200 ${me.avatar_color === color ? "ring-2 ring-offset-2 ring-violet-500 scale-110" : "hover:scale-105"}`}
              style={{ background: color }} />
          ))}
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
  const [notifications, setNotifications] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied">("default");

  useEffect(() => {
    if ("Notification" in window) {
      setNotifStatus(Notification.permission as "default" | "granted" | "denied");
      setNotifications(Notification.permission === "granted");
    }
  }, []);

  const toggleNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Ваш браузер не поддерживает уведомления");
      return;
    }
    if (notifStatus === "denied") {
      alert("Уведомления заблокированы в настройках браузера. Разрешите их вручную.");
      return;
    }
    if (notifStatus !== "granted") {
      const perm = await Notification.requestPermission();
      setNotifStatus(perm as "default" | "granted" | "denied");
      if (perm === "granted") {
        setNotifications(true);
        new Notification("V-message", { body: "Уведомления включены!", icon: "/favicon.ico" });
      }
    } else {
      setNotifications(v => !v);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar pb-4">
      {showSessions && <ActiveSessionsModal onClose={() => setShowSessions(false)} />}
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
            {
              label: notifStatus === "denied" ? "Уведомления заблокированы" : "Push-уведомления",
              icon: "Bell", color: "text-orange-500", isToggle: true,
              value: notifications,
              onClick: toggleNotifications,
              hint: notifStatus === "denied" ? "Разрешите в браузере" : notifStatus === "granted" ? "Включены" : "Нажмите для включения"
            },
          ]
        },
        {
          title: "Конфиденциальность",
          items: [
            { label: "Секретные чаты (E2EE)", icon: "Lock", color: "text-yellow-500", isToggle: false, value: "", onClick: undefined, hint: "Скоро" },
            { label: "Активные сессии", icon: "Monitor", color: "text-blue-500", isToggle: false, value: "", onClick: () => setShowSessions(true), hint: "" },
          ]
        },
      ].map(group => (
        <div key={group.title} className="mx-4 mt-4 bg-card rounded-3xl p-2">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</div>
          {group.items.map(({ label, icon, color, isToggle, value, onClick, hint }) => (
            <button key={label} onClick={onClick}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-secondary transition-colors text-left">
              <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon name={icon as AnyIcon} size={16} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{label}</span>
                {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
              </div>
              {isToggle ? (
                <div className={`w-11 h-6 rounded-full transition-all duration-300 flex items-center px-1 flex-shrink-0 ${value ? "vm-gradient-bg" : "bg-secondary"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${value ? "translate-x-5" : "translate-x-0"}`} />
                </div>
              ) : (
                <Icon name="ChevronRight" size={16} className="text-muted-foreground flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      ))}

      <div className="mx-4 mt-4 bg-card rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="Info" size={15} className="text-violet-500" />
          <span className="text-sm font-medium">О приложении</span>
        </div>
        <p className="text-xs text-muted-foreground ml-6">V-message v1.0 · Мессенджер нового поколения</p>
      </div>
    </div>
  );
}

// ─── Calls Section ─────────────────────────────────────────────────────────────
function CallsSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4"><h2 className="text-lg font-bold">Звонки</h2></div>
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div>
          <div className="text-4xl mb-3">📞</div>
          <p className="text-muted-foreground text-sm">История звонков появится здесь.<br/>Откройте чат и нажмите на иконку звонка.</p>
        </div>
      </div>
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

  useEffect(() => {
    if (getToken() && !me) {
      authApi.me().then(res => {
        if (res.ok) setMe(res.user);
        else { clearSession(); setMe(null); }
      });
    }
  }, []);

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
  const totalUnread = chats.reduce((s, c) => s + (c.unread || 0), 0);
  const isChatOpen = activeTab === "chats" && openChat;

  const leftPanel: Record<string, React.ReactNode> = {
    chats: <ChatList chats={chats} loading={chatsLoading} onOpen={c => setOpenChat(c)} onNew={() => setShowNewChat(true)} />,
    contacts: <ContactsSection me={me} onStartChat={u => { handleStartChatWith(u); setActiveTab("chats"); }} />,
    calls: <CallsSection />,
    profile: <ProfileSection me={me} onUpdate={u => { setMe(u); saveSession(getToken()!, u); }} onLogout={handleLogout} />,
    settings: <SettingsSection />,
  };

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-background font-golos">
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onCreated={handleNewChatCreated} />}

      {/* Desktop Nav (left sidebar) */}
      <nav className="hidden md:flex vm-glass border-r w-16 flex-col items-center py-4 gap-1 z-10 flex-shrink-0">
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
            {item.id === "chats" && totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {Math.min(totalUnread, 9)}
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

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Panel */}
        <div className={`vm-glass border-r flex-shrink-0 flex flex-col
          w-full md:w-80
          ${isChatOpen ? "hidden md:flex" : "flex"}
        `}>
          {leftPanel[activeTab]}
        </div>

        {/* Right Panel */}
        <div className={`flex-1 flex-col min-w-0
          ${isChatOpen ? "flex" : "hidden md:flex"}
        `}>
          {activeTab === "chats" && openChat ? (
            <ChatView chat={openChat} me={me} onBack={() => setOpenChat(null)} onStartChat={handleStartChatWith} />
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

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden flex-shrink-0 vm-glass border-t z-10" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-around px-1 py-1.5">
          {navItems.map(item => (
            <button key={item.id}
              onClick={() => { setActiveTab(item.id); if (item.id !== "chats") setOpenChat(null); }}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-0 ${
                activeTab === item.id ? "vm-gradient-bg text-white shadow-lg shadow-violet-500/30" : "text-muted-foreground"
              }`}>
              <Icon name={item.icon as AnyIcon} size={19} />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
              {item.id === "chats" && totalUnread > 0 && (
                <span className="absolute -top-0.5 right-0.5 w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                  {Math.min(totalUnread, 9)}
                </span>
              )}
            </button>
          ))}
          <button onClick={() => document.documentElement.classList.toggle("dark")}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-muted-foreground min-w-0">
            <Icon name="Sun" size={19} />
            <span className="text-[9px] font-medium leading-none">Тема</span>
          </button>
        </div>
      </nav>
    </div>
  );
}