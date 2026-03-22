import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { authApi, chatsApi, usersApi, callsApi, getToken, getStoredUser, saveSession, clearSession } from "@/lib/api";
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

// ─── Status helpers ───────────────────────────────────────────────────────────
function statusLabel(status?: string): string {
  if (status === "online") return "в сети";
  if (status === "inactive") return "не активен в сети ✓";
  return "не в сети";
}

function statusColor(status?: string): string {
  if (status === "online") return "bg-emerald-400";
  if (status === "inactive") return "bg-gray-400";
  return "bg-gray-300";
}

// ─── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ label, color, size = 42, status, src }: {
  label: string; color: string; size?: number; status?: string; src?: string;
}) {
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
      {status !== undefined && (
        <span className={`absolute bottom-0 right-0 rounded-full border-2 border-background ${statusColor(status)}`}
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

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-card rounded-2xl shadow-2xl border border-border p-3 z-50 animate-scale-in w-64">
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_LIST.map(e => (
          <button key={e} onClick={() => { onPick(e); onClose(); }}
            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-secondary rounded-lg transition-colors">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Voice Recorder ──────────────────────────────────────────────────────────
function VoiceRecorder({ onSend, onCancel }: {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durRef = useRef(0);
  const committedRef = useRef(false); // флаг — уже отправляем, не трогать

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mrRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      timerRef.current = setInterval(() => {
        durRef.current += 1;
        setSeconds(durRef.current);
      }, 1000);
    }).catch(() => { if (active) onCancel(); });
    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      // Только если НЕ в процессе отправки — просто останавливаем треки
      if (!committedRef.current) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (mrRef.current?.state === "recording") {
          mrRef.current.onstop = null; // сбрасываем чтобы не вызвать onSend
          mrRef.current.stop();
        }
      }
    };
  }, [onCancel]);

  const stop = () => {
    const mr = mrRef.current;
    if (!mr || mr.state !== "recording") return;
    committedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const dur = durRef.current;
    const mimeType = mr.mimeType || "audio/webm";
    mr.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onSend(blob, dur);
    };
    try { mr.requestData(); } catch (_) { /* not all browsers support */ }
    mr.stop();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-2xl px-3 py-2.5">
      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
      <span className="text-red-500 font-mono text-sm font-semibold flex-1">{fmt(seconds)}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-0.5 bg-red-400 rounded-full animate-pulse"
            style={{ height: `${6 + Math.abs(Math.sin(i * 1.2 + seconds)) * 10}px`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <button onClick={onCancel} className="p-1.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 text-muted-foreground flex-shrink-0">
        <Icon name="Trash2" size={15} />
      </button>
      <button onClick={stop} className="p-2 rounded-xl vm-gradient-bg text-white shadow-lg flex-shrink-0">
        <Icon name="Send" size={15} />
      </button>
    </div>
  );
}

// ─── Video Note Recorder ──────────────────────────────────────────────────────
function VideoNoteRecorder({ onSend, onCancel }: {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durRef = useRef(0);
  const committedRef = useRef(false);
  const MAX = 60;

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => { if (active) setError("Нет доступа к камере/микрофону"); });
    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (!committedRef.current) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (mrRef.current?.state === "recording") {
          mrRef.current.onstop = null;
          mrRef.current.stop();
        }
      }
    };
  }, []);

  const stopRec = useCallback(() => {
    const mr = mrRef.current;
    if (!mr || mr.state !== "recording") return;
    committedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const dur = durRef.current;
    const mimeType = mr.mimeType || "video/webm";
    mr.onstop = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onSend(blob, dur);
    };
    try { mr.requestData(); } catch (_) { /* ok */ }
    mr.stop();
  }, [onSend]);

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || !ready) return;
    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
      .find(t => MediaRecorder.isTypeSupported(t)) || "";
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    chunksRef.current = [];
    durRef.current = 0;
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onerror = () => setError("Ошибка записи");
    mr.start(100);
    setRecording(true);
    timerRef.current = setInterval(() => {
      durRef.current += 1;
      setSeconds(durRef.current);
      setProgress((durRef.current / MAX) * 100);
      if (durRef.current >= MAX) stopRec();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-fade-in" onClick={onCancel}>
      <div className="flex flex-col items-center gap-5" onClick={e => e.stopPropagation()}>
        {error ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <Icon name="VideoOff" size={36} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm text-center">{error}</p>
            <button onClick={onCancel} className="px-5 py-2 rounded-xl bg-white/20 text-white text-sm">Закрыть</button>
          </div>
        ) : (
          <>
            <div className="relative w-56 h-56">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                {recording && (
                  <circle cx="50" cy="50" r="47" fill="none" stroke="#8b5cf6" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 47}`}
                    strokeDashoffset={`${2 * Math.PI * 47 * (1 - progress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }} />
                )}
              </svg>
              <div className="absolute inset-[6px] rounded-full overflow-hidden bg-black">
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
                {!ready && !error && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {recording && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 rounded-full px-2 py-0.5">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-[10px] font-bold">{seconds}с</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-5">
              <button onClick={onCancel} className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors">
                <Icon name="X" size={20} />
              </button>
              {!recording ? (
                <button onClick={startRec} disabled={!ready}
                  className="w-16 h-16 rounded-full vm-gradient-bg text-white flex items-center justify-center shadow-2xl shadow-violet-500/50 disabled:opacity-40 hover:opacity-90 transition-opacity">
                  <Icon name="Video" size={26} />
                </button>
              ) : (
                <button onClick={stopRec}
                  className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
                  <Icon name="Square" size={24} />
                </button>
              )}
            </div>
            <p className="text-white/50 text-xs">
              {!ready ? "Инициализация камеры..." : recording ? "Нажмите стоп для отправки" : "Нажмите для записи"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── User Profile Modal ───────────────────────────────────────────────────────
function UserProfileModal({ user: initialUser, onClose, onStartChat, currentUserId }: {
  user: User; onClose: () => void;
  onStartChat: (username: string) => void;
  currentUserId: number;
}) {
  const [user, setUser] = useState<User>(initialUser);
  const [blocked, setBlocked] = useState(false);
  const [inContacts, setInContacts] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      // если id=0 (открыт из шапки чата) — ищем пользователя по username
      let resolvedUser = initialUser;
      if (!initialUser.id && initialUser.username) {
        const res = await usersApi.search(initialUser.username);
        if (res.ok && res.users?.length > 0) {
          resolvedUser = res.users.find((u: User) => u.username === initialUser.username) || initialUser;
          setUser(resolvedUser);
        }
      }
      if (resolvedUser.id && resolvedUser.id !== currentUserId) {
        const [blockRes, contRes] = await Promise.all([
          usersApi.checkBlocked(resolvedUser.id),
          usersApi.contacts(),
        ]);
        if (blockRes.ok) setBlocked(blockRes.blocked);
        if (contRes.ok) {
          setInContacts(contRes.contacts.some((c: User) => c.id === resolvedUser.id));
        }
      }
      setLoading(false);
    };
    loadData();
  }, [initialUser, currentUserId]);

  const toggleBlock = async () => {
    if (blocked) {
      const res = await usersApi.unblockUser(user.id);
      if (res.ok) setBlocked(false);
    } else {
      const res = await usersApi.blockUser(user.id);
      if (res.ok) setBlocked(true);
    }
  };

  const toggleContact = async () => {
    if (inContacts) {
      const res = await usersApi.removeContact(user.id);
      if (res.ok) setInContacts(false);
    } else {
      const res = await usersApi.addContact(user.id);
      if (res.ok) setInContacts(true);
    }
  };

  const uStatus = user.status || (user.online ? "online" : "offline");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Шапка с аватаром */}
        <div className="relative vm-gradient-bg pt-10 pb-10 px-6 flex flex-col items-center flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-colors">
            <Icon name="X" size={16} />
          </button>
          <Avatar label={user.display_name} color={user.avatar_color} size={88} status={uStatus} src={user.avatar_url} />
          <h3 className="text-white font-bold text-2xl mt-4">{user.display_name}</h3>
          <p className="text-white/70 text-sm mt-0.5">@{user.username}</p>
          <div className="flex items-center gap-1.5 mt-2 bg-white/10 rounded-full px-3 py-1">
            <div className={`w-2 h-2 rounded-full ${statusColor(uStatus)}`} />
            <span className="text-white/80 text-xs font-medium">{statusLabel(uStatus)}</span>
          </div>
        </div>

        {/* Контент */}
        <div className="overflow-y-auto flex-1">
          {/* Инфо */}
          {(user.bio || user.username) && (
            <div className="mx-4 mt-4 bg-secondary/50 rounded-2xl p-4 space-y-3">
              {user.bio && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <Icon name="FileText" size={15} className="text-violet-500" />
                  </div>
                  <p className="text-sm text-foreground/80 break-words leading-relaxed pt-1">{user.bio}</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Icon name="AtSign" size={15} className="text-blue-500" />
                </div>
                <span className="text-sm text-foreground/70">@{user.username}</span>
              </div>
            </div>
          )}

          {/* Кнопки действий */}
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : user.id !== currentUserId ? (
            <div className="px-4 py-4 space-y-2.5">
              <button onClick={() => { onStartChat(user.username); onClose(); }}
                className="w-full vm-gradient-bg text-white font-semibold py-3.5 rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2">
                <Icon name="MessageCircle" size={18} />
                Написать сообщение
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={toggleContact}
                  className={`font-semibold py-3 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-sm ${inContacts ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "bg-secondary text-foreground hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-500"}`}>
                  <Icon name={inContacts ? "UserCheck" : "UserPlus"} size={16} />
                  {inContacts ? "В контактах" : "В контакты"}
                </button>
                <button onClick={toggleBlock}
                  className={`font-semibold py-3 rounded-2xl transition-all flex items-center justify-center gap-1.5 text-sm ${blocked ? "bg-secondary text-muted-foreground" : "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"}`}>
                  <Icon name={blocked ? "ShieldCheck" : "ShieldOff"} size={16} />
                  {blocked ? "Разблокировать" : "Заблокировать"}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-2 text-center text-sm text-muted-foreground">Это ваш профиль</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WebRTC helpers ────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

async function getMedia(isVideo: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(
      isVideo ? { video: true, audio: true } : { audio: true }
    );
  } catch {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return new MediaStream(); }
  }
}

// ─── WebRTC Call Modal (caller side) ──────────────────────────────────────────
function CallModal({ chat, calleeId, type, onClose }: {
  chat: Chat; calleeId: number; type: "audio" | "video"; onClose: () => void;
}) {
  const [status, setStatus] = useState<"calling" | "connected" | "ended" | "rejected">("calling");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<number | null>(null);
  const iceSentRef = useRef<Set<string>>(new Set());
  const iceRcvRef = useRef<Set<string>>(new Set());
  const connectedRef = useRef(false);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const stopAll = useCallback((endOnServer = false) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (endOnServer && callIdRef.current) callsApi.end(callIdRef.current);
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const stream = await getMedia(type === "video");
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (localVideoRef.current && type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const initRes = await callsApi.initiate(calleeId, type);
      if (!initRes.ok || !alive) { stopAll(); onClose(); return; }
      callIdRef.current = initRes.call_id;
      console.log("[CALL] initiated", callIdRef.current);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = e => {
        console.log("[CALL] got remote track", e.track.kind);
        const remoteStream = e.streams[0] || new MediaStream([e.track]);
        if (type === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[CALL] connection state:", pc.connectionState);
        if (pc.connectionState === "connected" && !connectedRef.current) {
          connectedRef.current = true;
          setStatus("connected");
          timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          if (alive) { setStatus("ended"); stopAll(true); setTimeout(onClose, 1000); }
        }
      };

      pc.onicecandidate = e => {
        if (!e.candidate || !callIdRef.current) return;
        const cStr = JSON.stringify(e.candidate.toJSON());
        if (!iceSentRef.current.has(cStr)) {
          iceSentRef.current.add(cStr);
          console.log("[CALL] sending ICE", e.candidate.type);
          callsApi.addIce(callIdRef.current, cStr, "caller");
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === "video" });
      await pc.setLocalDescription(offer);
      await callsApi.sendOffer(callIdRef.current, JSON.stringify(pc.localDescription));
      console.log("[CALL] offer sent");

      // Poll для answer + ICE от callee
      pollRef.current = setInterval(async () => {
        if (!callIdRef.current || !alive) return;
        const st = await callsApi.getStatus(callIdRef.current);
        if (!st.ok) return;
        console.log("[CALL] poll status:", st.status, "has_answer:", st.has_answer);

        if (st.status === "rejected" || st.status === "ended") {
          if (alive) {
            setStatus(st.status === "rejected" ? "rejected" : "ended");
            stopAll();
            setTimeout(onClose, 1200);
          }
          return;
        }

        if (st.status === "accepted" && st.has_answer && !pc.remoteDescription) {
          const ansR = await callsApi.getAnswer(callIdRef.current);
          if (ansR.ok && ansR.answer) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(ansR.answer)));
              console.log("[CALL] remote description set");
              if (!connectedRef.current) {
                setStatus("connected");
                connectedRef.current = true;
                timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
              }
            } catch (e) { console.error("[CALL] setRemoteDescription failed", e); }
          }
        }

        // Получаем ICE кандидаты от callee
        if (st.status === "accepted") {
          const iceR = await callsApi.getIce(callIdRef.current, "caller");
          if (iceR.ok && iceR.candidates?.length) {
            for (const c of iceR.candidates) {
              const cand = typeof c === "string" ? JSON.parse(c) : c;
              const key = JSON.stringify(cand);
              if (!iceRcvRef.current.has(key)) {
                iceRcvRef.current.add(key);
                try {
                  if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                    console.log("[CALL] added callee ICE candidate");
                  }
                } catch (e) { console.warn("[CALL] ICE add failed", e); }
              }
            }
          }
        }
      }, 1000);
    };

    run();
    return () => { alive = false; stopAll(true); };
  }, [calleeId, type, stopAll, onClose]);

  const endCall = async () => {
    stopAll(true);
    setStatus("ended");
    setTimeout(onClose, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-violet-900 to-indigo-900 p-8 animate-fade-in">
      {type === "video" && (
        <div className="absolute inset-0">
          <video ref={remoteVideoRef} className="w-full h-full object-cover" playsInline autoPlay />
          <div className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
            {camOff && <div className="absolute inset-0 bg-black/80 flex items-center justify-center"><Icon name="VideoOff" size={24} className="text-white" /></div>}
          </div>
        </div>
      )}
      {type === "audio" && <audio ref={remoteAudioRef} autoPlay playsInline />}
      <div className="relative flex flex-col items-center mt-12 z-10">
        <Avatar label={chat.name} color={chat.avatar_color} size={100} src={chat.avatar_url || undefined} />
        <h2 className="text-white font-bold text-2xl mt-4">{chat.name}</h2>
        <p className="text-white/70 text-sm mt-1">
          {status === "calling" ? "Вызов..." : status === "connected" ? fmt(seconds) : status === "rejected" ? "Недоступен" : "Звонок завершён"}
        </p>
        {status === "calling" && (
          <div className="flex gap-1 mt-3">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>
      <div className="relative flex items-center gap-6 z-10 mb-8">
        {type === "video" && (
          <button onClick={() => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOff(v => !v); }}
            className={`w-14 h-14 rounded-full ${camOff ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center hover:opacity-90 transition-colors`}>
            <Icon name={camOff ? "VideoOff" : "Video"} size={22} />
          </button>
        )}
        <button onClick={() => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMuted(v => !v); }}
          className={`w-14 h-14 rounded-full ${muted ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center hover:opacity-90 transition-colors`}>
          <Icon name={muted ? "MicOff" : "Mic"} size={22} />
        </button>
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
          <Icon name="PhoneOff" size={26} />
        </button>
      </div>
    </div>
  );
}

// ─── Incoming Call Modal (callee side) ────────────────────────────────────────
function IncomingCallModal({ incoming, onAccept, onReject }: {
  incoming: { id: number; caller_name: string; caller_color: string; caller_avatar?: string; call_type: string };
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-gradient-to-b from-violet-900 to-indigo-900 rounded-t-3xl sm:rounded-3xl p-8 flex flex-col items-center gap-5 animate-scale-in">
        <div className="relative">
          <Avatar label={incoming.caller_name} color={incoming.caller_color} size={80} src={incoming.caller_avatar} />
          <div className="absolute inset-0 rounded-full border-4 border-white/30 animate-ping" />
        </div>
        <div className="text-center">
          <p className="text-white/70 text-sm">{incoming.call_type === "video" ? "Видеозвонок" : "Голосовой звонок"}</p>
          <h2 className="text-white font-bold text-2xl mt-1">{incoming.caller_name}</h2>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <button onClick={onReject} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
              <Icon name="PhoneOff" size={26} />
            </button>
            <span className="text-white/60 text-xs">Отклонить</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={onAccept} className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xl shadow-emerald-500/50 hover:bg-emerald-600 transition-colors animate-pulse">
              <Icon name="Phone" size={26} />
            </button>
            <span className="text-white/60 text-xs">Принять</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Active Call (callee side after accept) ────────────────────────────────────
function ActiveCallModal({ callId, callerName, callerColor, callerAvatar, callType, onClose }: {
  callId: number; callerName: string; callerColor: string; callerAvatar?: string;
  callType: string; onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const iceSentRef = useRef<Set<string>>(new Set());
  const iceRcvRef = useRef<Set<string>>(new Set());

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const stopAll = useCallback((endOnServer = false) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    if (endOnServer) callsApi.end(callId);
  }, [callId]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const stream = await getMedia(callType === "video");
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (localVideoRef.current && callType === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const offerRes = await callsApi.getOffer(callId);
      if (!offerRes.ok || !offerRes.offer || !alive) { stopAll(); onClose(); return; }
      console.log("[CALLEE] got offer");

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = e => {
        console.log("[CALLEE] got remote track", e.track.kind);
        const remoteStream = e.streams[0] || new MediaStream([e.track]);
        if (callType === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[CALLEE] connection state:", pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          if (alive) { stopAll(true); onClose(); }
        }
      };

      pc.onicecandidate = e => {
        if (!e.candidate) return;
        const cStr = JSON.stringify(e.candidate.toJSON());
        if (!iceSentRef.current.has(cStr)) {
          iceSentRef.current.add(cStr);
          console.log("[CALLEE] sending ICE", e.candidate.type);
          callsApi.addIce(callId, cStr, "callee");
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerRes.offer)));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await callsApi.accept(callId, JSON.stringify(pc.localDescription));
      console.log("[CALLEE] answer sent via accept");

      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

      pollRef.current = setInterval(async () => {
        if (!alive) return;
        const st = await callsApi.getStatus(callId);
        if (st.status === "ended" || st.status === "rejected") {
          if (alive) { stopAll(); onClose(); }
          return;
        }
        // Получаем ICE кандидаты от caller
        const iceR = await callsApi.getIce(callId, "callee");
        if (iceR.ok && iceR.candidates?.length) {
          for (const c of iceR.candidates) {
            const cand = typeof c === "string" ? JSON.parse(c) : c;
            const key = JSON.stringify(cand);
            if (!iceRcvRef.current.has(key)) {
              iceRcvRef.current.add(key);
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
                console.log("[CALLEE] added caller ICE candidate");
              } catch (e) { console.warn("[CALLEE] ICE add failed", e); }
            }
          }
        }
      }, 1000);
    };

    run();
    return () => { alive = false; stopAll(true); };
  }, [callId, callType, stopAll, onClose]);

  const endCall = () => { stopAll(true); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-violet-900 to-indigo-900 p-8 animate-fade-in">
      {callType === "video" && (
        <div className="absolute inset-0">
          <video ref={remoteVideoRef} className="w-full h-full object-cover" playsInline autoPlay />
          <div className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
          </div>
        </div>
      )}
      {callType === "audio" && <audio ref={remoteAudioRef} autoPlay playsInline />}
      <div className="relative flex flex-col items-center mt-12 z-10">
        <Avatar label={callerName} color={callerColor} size={100} src={callerAvatar} />
        <h2 className="text-white font-bold text-2xl mt-4">{callerName}</h2>
        <p className="text-white/70 text-sm mt-1">{fmt(seconds)}</p>
      </div>
      <div className="relative flex items-center gap-6 z-10 mb-8">
        <button onClick={() => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMuted(v => !v); }}
          className={`w-14 h-14 rounded-full ${muted ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center`}>
          <Icon name={muted ? "MicOff" : "Mic"} size={22} />
        </button>
        {callType === "video" && (
          <button onClick={() => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOff(v => !v); }}
            className={`w-14 h-14 rounded-full ${camOff ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center`}>
            <Icon name={camOff ? "VideoOff" : "Video"} size={22} />
          </button>
        )}
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
          <Icon name="PhoneOff" size={26} />
        </button>
      </div>
    </div>
  );
}

// ─── Active Sessions Modal ────────────────────────────────────────────────────
function ActiveSessionsModal({ onClose }: { onClose: () => void }) {
  const isMobile = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent);
  const browser = navigator.userAgent.includes("Chrome") ? "Chrome" :
                  navigator.userAgent.includes("Firefox") ? "Firefox" :
                  navigator.userAgent.includes("Safari") ? "Safari" : "Браузер";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Активные сессии</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-2xl border border-violet-200 dark:border-violet-800">
            <div className="w-10 h-10 rounded-xl vm-gradient-bg flex items-center justify-center flex-shrink-0">
              <Icon name={isMobile ? "Smartphone" : "Monitor"} size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{isMobile ? "Мобильный браузер" : "Компьютер"}</div>
              <div className="text-xs text-muted-foreground">{browser} · Текущая сессия</div>
            </div>
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">Для завершения всех сессий — выйдите из аккаунта</p>
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
  const [searchResults, setSearchResults] = useState<{users: User[], chats: {id:number,type:string,name:string,avatar_color:string,invite_code:string}[]}>({ users: [], chats: [] });
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (search.length < 2) {
      setSearchResults({ users: [], chats: [] });
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await usersApi.search(search);
      if (res.ok) setSearchResults({ users: res.users || [], chats: res.public_chats || [] });
      setSearching(false);
    }, 500);
  }, [search]);

  const hasGlobal = search.length >= 2 && (searchResults.users.length > 0 || searchResults.chats.length > 0);

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
            placeholder="Поиск чатов, пользователей..."
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
          {searching && <Icon name="Loader" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-0.5">
        {loading && !search && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Icon name="Loader" size={20} className="animate-spin mr-2" /> Загрузка...
          </div>
        )}
        {/* Локальные результаты */}
        {!hasGlobal && filtered.map((c, i) => (
          <button key={c.id} onClick={() => onOpen(c)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 animate-fade-in stagger-${Math.min(i + 1, 5)}`}>
            <Avatar label={c.name} color={c.avatar_color} status={c.user_status} src={c.avatar_url || undefined} />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-semibold text-sm truncate">{c.name}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{c.last_time}</span>
              </div>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{c.type === "group" ? "👥 " : c.type === "channel" ? "📢 " : ""}{c.last_msg || "Нет сообщений"}</span>
                {c.unread > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 vm-gradient-bg text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {!hasGlobal && !loading && filtered.length === 0 && !search && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="text-3xl mb-2">💬</div>
            Нет чатов. Нажмите + чтобы начать переписку
          </div>
        )}
        {/* Глобальный поиск */}
        {hasGlobal && (
          <div className="py-2">
            {searchResults.users.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Пользователи</div>
                {searchResults.users.map(u => (
                  <button key={u.id} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all">
                    <Avatar label={u.display_name} color={u.avatar_color} status={u.status} src={u.avatar_url} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-sm truncate">{u.display_name}</div>
                      <div className="text-xs text-muted-foreground">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {searchResults.chats.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">Группы и каналы</div>
                {searchResults.chats.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all">
                    <Avatar label={c.name} color={c.avatar_color} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.type === "group" ? "Группа" : "Канал"} · публичный</div>
                    </div>
                    <button onClick={async () => {
                      const res = await chatsApi.joinByInvite(c.invite_code);
                      if (res.ok) { setSearch(""); window.location.reload(); }
                    }} className="text-xs vm-gradient-bg text-white px-3 py-1.5 rounded-xl font-semibold">
                      Вступить
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {search.length >= 2 && !searching && !hasGlobal && !filtered.length && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <div className="text-2xl mb-2">🔍</div>
            Ничего не найдено
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────
function NewChatModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (chatId: number) => void;
}) {
  const [tab, setTab] = useState<"private" | "group" | "channel">("private");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joiningInvite, setJoiningInvite] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      const res = await usersApi.search(search);
      if (res.ok) setResults(res.users || []);
      setLoading(false);
    }, 400);
  }, [search]);

  const openPrivate = async (username: string) => {
    setCreating(true);
    const res = await chatsApi.createPrivate(username);
    if (res.ok) onCreated(res.chat_id);
    setCreating(false);
  };

  const createGroup = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const res = await chatsApi.createGroup(name, isPublic);
    if (res.ok) onCreated(res.chat_id);
    setCreating(false);
  };

  const createChannel = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const res = await chatsApi.createChannel(name, description, isPublic);
    if (res.ok) onCreated(res.chat_id);
    setCreating(false);
  };

  const joinByInvite = async () => {
    if (!inviteCode.trim()) return;
    setJoiningInvite(true);
    const res = await chatsApi.joinByInvite(inviteCode.trim());
    if (res.ok) onCreated(res.chat_id);
    else alert("Чат не найден по этой ссылке");
    setJoiningInvite(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scale-in max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Новый чат</h3>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary">
              <Icon name="X" size={18} />
            </button>
          </div>
          <div className="flex bg-secondary rounded-2xl p-1 mb-4">
            {([
              { id: "private", label: "Личный", icon: "User" },
              { id: "group", label: "Группа", icon: "Users" },
              { id: "channel", label: "Канал", icon: "Megaphone" },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 ${tab === t.id ? "vm-gradient-bg text-white shadow-md" : "text-muted-foreground"}`}>
                <Icon name={t.icon as AnyIcon} size={13} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Join by invite */}
          <div className="mb-3">
            <div className="flex gap-2">
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                placeholder="Код приглашения..."
                className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={joinByInvite} disabled={joiningInvite || !inviteCode.trim()}
                className="px-3 py-2 vm-gradient-bg text-white rounded-xl text-xs font-semibold disabled:opacity-60">
                {joiningInvite ? "..." : "Войти"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto vm-scrollbar px-5 pb-5">
          {tab === "private" && (
            <div className="space-y-3">
              <div className="relative">
                <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск по имени или @username..."
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
              </div>
              {loading && <div className="text-center py-4 text-muted-foreground text-sm"><Icon name="Loader" size={16} className="animate-spin inline mr-2" />Поиск...</div>}
              {results.map(u => (
                <button key={u.id} onClick={() => openPrivate(u.username)} disabled={creating}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all text-left">
                  <Avatar label={u.display_name} color={u.avatar_color} status={u.status} src={u.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground">@{u.username} · {statusLabel(u.status)}</div>
                  </div>
                  <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                </button>
              ))}
              {search.length >= 2 && !loading && results.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">Пользователь не найден</p>
              )}
            </div>
          )}

          {(tab === "group" || tab === "channel") && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Название</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder={tab === "group" ? "Название группы" : "Название канала"}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
              </div>
              {tab === "channel" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                  <input value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Описание канала (необязательно)"
                    className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
                </div>
              )}
              <button onClick={() => setIsPublic(v => !v)}
                className="w-full flex items-center gap-3 p-3 bg-secondary rounded-2xl text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-card flex items-center justify-center">
                  <Icon name={isPublic ? "Globe" : "Lock"} size={16} className={isPublic ? "text-violet-500" : "text-muted-foreground"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{isPublic ? "Публичный" : "Закрытый"}</div>
                  <div className="text-xs text-muted-foreground">{isPublic ? "Найти в поиске" : "Только по ссылке"}</div>
                </div>
                <div className={`w-11 h-6 rounded-full transition-all ${isPublic ? "vm-gradient-bg" : "bg-gray-300 dark:bg-gray-600"} flex items-center px-1`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isPublic ? "translate-x-5" : ""}`} />
                </div>
              </button>
              <button onClick={tab === "group" ? createGroup : createChannel} disabled={creating || !name.trim()}
                className="w-full vm-gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 shadow-lg shadow-violet-500/30">
                {creating ? "Создание..." : `Создать ${tab === "group" ? "группу" : "канал"}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contacts Section ─────────────────────────────────────────────────────────
function ContactsSection({ me, onStartChat, onOpenProfile }: {
  me: User;
  onStartChat: (username: string) => void;
  onOpenProfile: (user: User) => void;
}) {
  const [contacts, setContacts] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadContacts = useCallback(async () => {
    const res = await usersApi.contacts();
    if (res.ok) setContacts(res.contacts);
    setLoading(false);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await usersApi.search(search);
      if (res.ok) setSearchResults(res.users || []);
      setSearching(false);
    }, 400);
  }, [search]);

  const filtered = contacts.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  const showGlobal = search.length >= 2;
  const displayList = showGlobal ? searchResults : filtered;

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
          {searching && <Icon name="Loader" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2">
        {loading && <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>}
        {!loading && !showGlobal && contacts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <div className="text-3xl mb-2">👥</div>
            Добавьте контакты через профиль пользователя
          </div>
        )}
        {showGlobal && (
          <div className="px-1 py-1 text-xs font-semibold text-muted-foreground">Результаты поиска</div>
        )}
        {displayList.map((c, i) => {
          const uStatus = c.status || (c.online ? "online" : "offline");
          return (
            <div key={c.id} className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
              onClick={() => onOpenProfile(c)}>
              <Avatar label={c.display_name} color={c.avatar_color} status={uStatus} src={c.avatar_url} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.display_name}</div>
                <div className={`text-xs ${uStatus === "online" ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {statusLabel(uStatus)}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); onStartChat(c.username); }}
                className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-violet-500 transition-colors">
                <Icon name="MessageCircle" size={16} />
              </button>
            </div>
          );
        })}
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
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
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
    setShowAvatarMenu(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const res = await usersApi.updateAvatar(base64, file.type);
      if (res.ok) onUpdate(res.user);
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = async () => {
    setShowAvatarMenu(false);
    const res = await usersApi.removeAvatar();
    if (res.ok) onUpdate(res.user);
  };

  const COLORS = ["#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#3b82f6","#6366f1"];
  const avatarUrl = (me as User & { avatar_url?: string }).avatar_url;

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar">
      <div className="relative vm-gradient-bg pt-10 pb-6 px-6 flex-shrink-0">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 60%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="relative animate-float">
            <div className="w-24 h-24 rounded-full overflow-hidden shadow-2xl cursor-pointer"
              onClick={() => setShowAvatarMenu(v => !v)}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-4xl text-white"
                  style={{ background: me.avatar_color }}>
                  {me.display_name[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/30 rounded-full transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                {uploadingAvatar ? <Icon name="Loader" size={24} className="text-white animate-spin" /> : <Icon name="Camera" size={24} className="text-white" />}
              </div>
            </div>
            <button onClick={() => setShowAvatarMenu(v => !v)}
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

      {/* Avatar Menu */}
      {showAvatarMenu && (
        <div className="mx-4 -mt-3 bg-card rounded-2xl shadow-xl border border-border p-2 z-10 relative flex-shrink-0">
          <button onClick={() => { avatarInputRef.current?.click(); setShowAvatarMenu(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm transition-colors">
            <Icon name="Camera" size={16} className="text-violet-500" /> Загрузить фото
          </button>
          {avatarUrl && (
            <button onClick={removeAvatar}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm transition-colors">
              <Icon name="Trash2" size={16} /> Удалить аватарку
            </button>
          )}
          <button onClick={() => setShowAvatarMenu(false)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm text-muted-foreground transition-colors">
            <Icon name="X" size={16} /> Отмена
          </button>
        </div>
      )}

      {/* Color picker — всегда виден под аватар-меню */}
      <div className="mx-4 mt-3 bg-card rounded-3xl p-4 shadow-lg flex-shrink-0">
        <div className="text-xs text-muted-foreground mb-2">Цвет профиля</div>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(color => (
            <button key={color} onClick={async () => {
              const res = await usersApi.update({ avatar_color: color });
              if (res.ok) onUpdate(res.user);
            }}
              className={`w-9 h-9 rounded-full transition-all duration-200 flex-shrink-0 ${me.avatar_color === color ? "ring-2 ring-offset-2 ring-violet-500 scale-110" : "hover:scale-105"}`}
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
        const notif = new Notification("V-message", { body: "Уведомления включены!", icon: "/favicon.ico" });
        setTimeout(() => notif.close(), 3000);
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
              hint: notifStatus === "denied" ? "Разрешите в настройках браузера" : notifStatus === "granted" ? "Включены" : "Нажмите для включения"
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

// ─── Chat View ────────────────────────────────────────────────────────────────
function ChatView({ chat, me, onBack, onStartChat, onOpenProfile, onDeleteChat }: {
  chat: Chat; me: User; onBack: () => void;
  onStartChat: (u: string) => void;
  onOpenProfile: (user: User) => void;
  onDeleteChat: (chatId: number) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showVideoNote, setShowVideoNote] = useState(false);
  const [showCall, setShowCall] = useState<"audio" | "video" | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const notifEnabledRef = useRef(false);
  const prevMsgCount = useRef(0);


  useEffect(() => {
    notifEnabledRef.current = Notification.permission === "granted";
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await chatsApi.messages(chat.id);
    if (res.ok) {
      const newMsgs: Message[] = res.messages;
      setMessages(prev => {
        if (newMsgs.length > prevMsgCount.current && prevMsgCount.current > 0) {
          const newOnes = newMsgs.slice(prevMsgCount.current);
          newOnes.forEach((m: Message) => {
            if (!m.out && notifEnabledRef.current) {
              const notif = new Notification(`V-message: ${chat.name}`, {
                body: m.type === "voice" ? "🎤 Голосовое сообщение" : m.type === "video_note" ? "⭕ Видеосообщение" : m.text,
                icon: "/favicon.ico",
                silent: false,
              });
              setTimeout(() => notif.close(), 4000);
              try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.type = "sine";
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
              } catch (_e) { void _e; }
            }
          });
        }
        prevMsgCount.current = newMsgs.length;
        return newMsgs;
      });
    }
    setLoading(false);
  }, [chat.id, chat.name]);

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    prevMsgCount.current = 0;
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
    setTimeout(() => inputRef.current?.focus(), 50);
    const res = await chatsApi.send(chat.id, text);
    if (res.ok) {
      setMessages(m => [...m, {
        ...res.message,
        sender_id: me.id, sender_name: me.display_name,
        sender_color: me.avatar_color, sender_username: me.username
      }]);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const sendVoice = async (blob: Blob, duration: number) => {
    setRecording(false);
    if (!blob || blob.size < 100) { console.warn("[VOICE] empty blob", blob?.size); return; }
    const mimeType = blob.type || "audio/webm";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
    console.log("[VOICE] sending", blob.size, "bytes,", mimeType);
    try {
      const base64 = await blobToBase64(blob);
      const res = await chatsApi.sendMedia(chat.id, base64, mimeType, "voice", `🎤 Голосовое ${duration}с`, `voice.${ext}`);
      if (res.ok) setMessages(m => [...m, {
        ...res.message, sender_id: me.id, sender_name: me.display_name,
        sender_color: me.avatar_color, sender_username: me.username
      }]);
      else console.error("[VOICE] send failed", res);
    } catch (e) { console.error("[VOICE] error", e); }
  };

  const sendVideoNote = async (blob: Blob, duration: number) => {
    setShowVideoNote(false);
    if (!blob || blob.size < 100) { console.warn("[VIDEO_NOTE] empty blob", blob?.size); return; }
    const mimeType = blob.type || "video/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    console.log("[VIDEO_NOTE] sending", blob.size, "bytes,", mimeType);
    try {
      const base64 = await blobToBase64(blob);
      const res = await chatsApi.sendMedia(chat.id, base64, mimeType, "video_note", `⭕ Видеосообщение ${duration}с`, `note.${ext}`);
      if (res.ok) setMessages(m => [...m, {
        ...res.message, sender_id: me.id, sender_name: me.display_name,
        sender_color: me.avatar_color, sender_username: me.username
      }]);
      else console.error("[VIDEO_NOTE] send failed", res);
    } catch (e) { console.error("[VIDEO_NOTE] error", e); }
  };

  const sendFile = async (file: File, msgType = "file") => {
    setShowAttachMenu(false);
    // Автоопределение типа по MIME
    let type = msgType;
    if (msgType === "file") {
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "file"; // аудио-файлы как file
    }
    const prefix = type === "image" ? "📷" : type === "video" ? "🎬" : type === "audio" ? "🎵" : "📎";
    const mimeType = file.type || "application/octet-stream";
    const base64 = await blobToBase64(file);
    const res = await chatsApi.sendMedia(chat.id, base64, mimeType, type, `${prefix} ${file.name}`, file.name);
    if (res.ok) setMessages(m => [...m, {
      ...res.message, sender_id: me.id, sender_name: me.display_name,
      sender_color: me.avatar_color, sender_username: me.username
    }]);
  };

  const sendLocation = async () => {
    setShowAttachMenu(false);
    if (!navigator.geolocation) { alert("Геолокация не поддерживается"); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude, longitude } = pos.coords;
      const res = await chatsApi.sendLocation(chat.id, latitude, longitude, `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      if (res.ok) setMessages(m => [...m, {
        ...res.message, sender_id: me.id, sender_name: me.display_name,
        sender_color: me.avatar_color, sender_username: me.username
      }]);
    }, () => alert("Не удалось получить геолокацию"));
  };

  const loadInvite = async () => {
    const res = await chatsApi.getInvite(chat.id);
    if (res.ok) { setInviteCode(res.invite_code); setShowInvite(true); }
  };

  const handleDeleteChat = async () => {
    if (!confirm(chat.type === "private" ? "Удалить чат?" : "Покинуть группу/канал?")) return;
    const res = await chatsApi.deleteChat(chat.id);
    if (res.ok) onDeleteChat(chat.id);
  };



  const renderMessage = (m: Message) => {
    const isVoice = m.type === "voice";
    const isVideoNote = m.type === "video_note";
    const isImage = m.type === "image";
    const isVideo = m.type === "video";
    const isFile = m.type === "file";
    const isLocation = m.type === "location";
    const hasMedia = m.media_url;

    if (isVideoNote) {
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className="flex flex-col items-center gap-1">
            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white dark:border-gray-700 shadow-lg relative">
              {hasMedia ? (
                <video src={m.media_url} className="w-full h-full object-cover" controls playsInline
                  style={{ borderRadius: "50%" }} />
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
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[240px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
            <div className="flex-1 min-w-0">
              {hasMedia ? (
                <audio src={m.media_url} controls className="w-full h-8" style={{ minWidth: 180 }} />
              ) : (
                <div className="flex items-center gap-0.5 h-5">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className={`w-1 rounded-full ${m.out ? "bg-white/60" : "bg-violet-300"}`}
                      style={{ height: `${30 + Math.sin(i * 1.3) * 50}%` }} />
                  ))}
                </div>
              )}
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
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[220px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.out ? "bg-white/20" : "bg-violet-100 dark:bg-violet-900"}`}>
              <Icon name="FileText" size={16} className={m.out ? "text-white" : "text-violet-500"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{m.text?.replace("📎 ", "") || "Файл"}</div>
              <button onClick={() => hasMedia && window.open(m.media_url, "_blank")}
                className={`text-[10px] underline ${m.out ? "text-white/70" : "text-violet-500"}`}>
                Скачать
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (isLocation) {
      let loc = { lat: 0, lon: 0, address: "" };
      try { loc = JSON.parse(m.text || "{}"); } catch (e) { void e; }
      return (
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div className={`rounded-2xl overflow-hidden max-w-[240px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
            <a href={`https://maps.google.com/?q=${loc.lat},${loc.lon}`} target="_blank" rel="noreferrer"
              className="block">
              <div className="relative">
                <img
                  src={`https://static-maps.yandex.ru/1.x/?lang=ru_RU&ll=${loc.lon},${loc.lat}&z=14&l=map&size=240,120&pt=${loc.lon},${loc.lat},pm2rdm`}
                  alt="карта" className="w-full h-24 object-cover" onError={e => { (e.target as HTMLImageElement).style.display="none"; }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                    <Icon name="MapPin" size={16} className="text-white" />
                  </div>
                </div>
              </div>
              <div className="px-3 py-2">
                <div className={`text-xs font-medium ${m.out ? "text-white" : "text-foreground"}`}>📍 Геолокация</div>
                <div className={`text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>{loc.address || `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`}</div>
              </div>
            </a>
            <div className={`flex items-center justify-end gap-1 pb-2 px-3 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
              <span>{m.time}</span>
              {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300" /> : <Icon name="CheckCheck" size={10} />)}
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

  const chatStatus = chat.user_status || (chat.online ? "online" : "offline");

  return (
    <div className="flex flex-col h-full animate-scale-in">
      {showCall && chat.partner_id && <CallModal chat={chat} calleeId={chat.partner_id} type={showCall} onClose={() => setShowCall(null)} />}
      {showVideoNote && <VideoNoteRecorder onSend={sendVideoNote} onCancel={() => setShowVideoNote(false)} />}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowInvite(false)}>
          <div className="bg-card rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3">Ссылка-приглашение</h3>
            <div className="bg-secondary rounded-xl px-4 py-3 font-mono text-sm break-all">{inviteCode}</div>
            <button onClick={() => { navigator.clipboard.writeText(inviteCode); setShowInvite(false); }}
              className="w-full mt-3 vm-gradient-bg text-white font-semibold py-3 rounded-xl">
              Скопировать
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <button onClick={() => {
          if (chat.type === "private" && chat.username) {
            onOpenProfile({ id: 0, username: chat.username, display_name: chat.name, avatar_color: chat.avatar_color, online: chat.online, status: chatStatus as "online"|"offline"|"inactive", avatar_url: chat.avatar_url });
          }
        }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Avatar label={chat.name} color={chat.avatar_color} status={chatStatus} src={chat.avatar_url || undefined} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{chat.name}</div>
            <div className={`text-xs ${chatStatus === "online" ? "text-emerald-500" : "text-muted-foreground"}`}>
              {chat.type === "group" ? "группа" : chat.type === "channel" ? "канал" : statusLabel(chatStatus)}
            </div>
          </div>
        </button>
        {chat.type !== "private" && (
          <button onClick={loadInvite} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground" title="Ссылка-приглашение">
            <Icon name="Link" size={18} />
          </button>
        )}
        {chat.type === "private" && (
          <>
            <button onClick={() => setShowCall("audio")} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
              <Icon name="Phone" size={18} />
            </button>
            <button onClick={() => setShowCall("video")} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
              <Icon name="Video" size={18} />
            </button>
          </>
        )}
        {/* Chat menu */}
        <div className="relative">
          <button onClick={() => setShowChatMenu(v => !v)} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            <Icon name="MoreVertical" size={18} />
          </button>
          {showChatMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card rounded-2xl shadow-2xl border border-border p-1 z-50 min-w-[160px] animate-scale-in">
              <button onClick={() => { setShowChatMenu(false); handleDeleteChat(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm transition-colors">
                <Icon name={chat.type === "private" ? "Trash2" : "LogOut"} size={16} />
                {chat.type === "private" ? "Удалить чат" : "Покинуть"}
              </button>
            </div>
          )}
        </div>
      </div>
      {showChatMenu && <div className="fixed inset-0 z-40" onClick={() => setShowChatMenu(false)} />}

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
      <div className="vm-glass border-t px-2 py-2 flex-shrink-0">
        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <div className="flex items-center gap-1 w-full">
            {/* Attach + Emoji в одном меню */}
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowAttachMenu(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
                <Icon name="Paperclip" size={18} />
              </button>
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-card rounded-2xl shadow-2xl border border-border p-2 z-50 animate-scale-in min-w-[160px]">
                  <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Icon name="Image" size={16} className="text-blue-500" />
                    </div>
                    Фото
                  </button>
                  <button onClick={() => { setShowAttachMenu(false); videoInputRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Icon name="Film" size={16} className="text-purple-500" />
                    </div>
                    Видео
                  </button>
                  <button onClick={() => { setShowAttachMenu(false); docInputRef.current?.click(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Icon name="FileText" size={16} className="text-green-500" />
                    </div>
                    Файл
                  </button>
                  <button onClick={() => { setShowAttachMenu(false); sendLocation(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-sm">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <Icon name="MapPin" size={16} className="text-orange-500" />
                    </div>
                    Геолокация
                  </button>
                </div>
              )}
            </div>

            {/* Emoji — скрыт на маленьких экранах */}
            <div className="relative flex-shrink-0 hidden sm:block">
              <button onClick={() => setShowEmoji(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
                <Icon name="Smile" size={18} />
              </button>
              {showEmoji && (
                <EmojiPicker onPick={e => { setInput(v => v + e); inputRef.current?.focus(); }} onClose={() => setShowEmoji(false)} />
              )}
            </div>

            <div className="flex-1 bg-secondary rounded-2xl px-3 py-2 flex items-center min-h-[38px]">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Написать..."
                className="flex-1 bg-transparent outline-none text-sm min-w-0" />
            </div>

            {input.trim() ? (
              <button onClick={send}
                className="w-9 h-9 flex items-center justify-center rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-md shadow-violet-500/30">
                <Icon name="Send" size={17} />
              </button>
            ) : (
              <>
                <button onClick={() => setRecording(true)} title="Голосовое"
                  className="w-9 h-9 flex items-center justify-center rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-md shadow-violet-500/30">
                  <Icon name="Mic" size={17} />
                </button>
                <button onClick={() => setShowVideoNote(true)} title="Видеозаметка"
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-500 text-white flex-shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-md shadow-indigo-500/30">
                  <Icon name="Video" size={17} />
                </button>
              </>
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "image")} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "video")} />
        <input ref={docInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "file")} />
      </div>

      {(showAttachMenu || showEmoji) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowAttachMenu(false); setShowEmoji(false); }} />
      )}
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
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [incomingCall, setIncomingCall] = useState<{id:number;caller_name:string;caller_color:string;caller_avatar?:string;call_type:string} | null>(null);
  const [activeCall, setActiveCall] = useState<{id:number;caller_name:string;caller_color:string;caller_avatar?:string;call_type:string} | null>(null);

  // Онлайн-статус: сообщаем серверу о присутствии
  useEffect(() => {
    if (!me) return;
    usersApi.setStatus(true);
    const heartbeat = setInterval(() => usersApi.setStatus(true), 15000);
    const handleHide = () => usersApi.setStatus(false);
    const handleShow = () => usersApi.setStatus(true);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { handleHide(); } else { handleShow(); }
    });
    window.addEventListener("beforeunload", handleHide);
    return () => {
      clearInterval(heartbeat);
      usersApi.setStatus(false);
      window.removeEventListener("beforeunload", handleHide);
    };
  }, [me]);

  // Polling входящих звонков
  const seenCallIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!me) return;
    const poll = setInterval(async () => {
      if (incomingCall || activeCall) return;
      const res = await callsApi.getIncoming();
      if (res.ok && res.call) {
        const callId = res.call.id;
        if (seenCallIds.current.has(callId)) return;
        seenCallIds.current.add(callId);
        setIncomingCall(res.call);
        // Звуковой сигнал входящего
        try {
          const ctx = new AudioContext();
          const ring = () => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.value = 440; osc.type = "sine";
            g.gain.setValueAtTime(0.2, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
          };
          ring(); setTimeout(ring, 700);
        } catch (_e) { void _e; }
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [me, incomingCall, activeCall]);

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
    await usersApi.setStatus(false);
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

  const totalUnread = chats.reduce((s, c) => s + (c.unread || 0), 0);
  const isChatOpen = activeTab === "chats" && openChat;

  const openProfile = (user: User) => setProfileUser(user);

  const leftPanel: Record<string, React.ReactNode> = {
    chats: <ChatList chats={chats} loading={chatsLoading} onOpen={c => setOpenChat(c)} onNew={() => setShowNewChat(true)} />,
    contacts: <ContactsSection me={me} onStartChat={u => { handleStartChatWith(u); setActiveTab("chats"); }} onOpenProfile={openProfile} />,
    calls: <CallsSection />,
    profile: <ProfileSection me={me} onUpdate={u => { setMe(u); saveSession(getToken()!, u); }} onLogout={handleLogout} />,
    settings: <SettingsSection />,
  };

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-background font-golos">
      {/* Входящий звонок */}
      {incomingCall && !activeCall && (
        <IncomingCallModal
          incoming={incomingCall}
          onReject={async () => {
            await callsApi.reject(incomingCall.id);
            setIncomingCall(null);
          }}
          onAccept={() => {
            setActiveCall(incomingCall);
            setIncomingCall(null);
          }}
        />
      )}
      {/* Активный звонок (callee) */}
      {activeCall && (
        <ActiveCallModal
          callId={activeCall.id}
          callerName={activeCall.caller_name}
          callerColor={activeCall.caller_color}
          callerAvatar={activeCall.caller_avatar}
          callType={activeCall.call_type}
          onClose={() => setActiveCall(null)}
        />
      )}
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onCreated={handleNewChatCreated} />}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          currentUserId={me.id}
          onClose={() => setProfileUser(null)}
          onStartChat={u => { handleStartChatWith(u); setProfileUser(null); setActiveTab("chats"); }}
        />
      )}

      {/* Desktop Nav (left sidebar) */}
      <nav className="hidden md:flex vm-glass border-r w-16 flex-col items-center py-4 gap-1 z-10 flex-shrink-0">
        <div className="w-10 h-10 rounded-2xl vm-gradient-bg flex items-center justify-center mb-3 shadow-lg shadow-violet-500/30 animate-float">
          <span className="text-white font-black text-lg">V</span>
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); if (item.id !== "chats") setOpenChat(null); }}
            title={item.label}
            className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 ${activeTab === item.id ? "vm-gradient-bg text-white shadow-lg shadow-violet-500/30 scale-110" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
            <Icon name={item.icon as AnyIcon} size={20} />
            {item.id === "chats" && totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Desktop left panel */}
      <div className={`hidden md:flex flex-col w-72 lg:w-80 vm-glass border-r flex-shrink-0 h-full overflow-hidden`}>
        {leftPanel[activeTab]}
      </div>

      {/* Desktop right panel */}
      <div className="hidden md:flex flex-col flex-1 h-full overflow-hidden">
        {openChat ? (
          <ChatView
            chat={openChat} me={me}
            onBack={() => setOpenChat(null)}
            onStartChat={handleStartChatWith}
            onOpenProfile={openProfile}
            onDeleteChat={(id) => { setChats(cs => cs.filter(c => c.id !== id)); setOpenChat(null); }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl vm-gradient-bg flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-violet-500/30 animate-float">
                <span className="text-white font-black text-4xl">V</span>
              </div>
              <h3 className="text-xl font-bold vm-gradient-text">V-message</h3>
              <p className="text-muted-foreground text-sm mt-2">Выберите чат для начала общения</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-col flex-1 h-full overflow-hidden">
        {isChatOpen ? (
          <ChatView
            chat={openChat!} me={me}
            onBack={() => setOpenChat(null)}
            onStartChat={handleStartChatWith}
            onOpenProfile={openProfile}
            onDeleteChat={(id) => { setChats(cs => cs.filter(c => c.id !== id)); setOpenChat(null); }}
          />
        ) : (
          <>
            <div className="flex-1 overflow-hidden">
              {leftPanel[activeTab]}
            </div>
            {/* Mobile bottom nav */}
            <nav className="vm-glass border-t flex items-center justify-around px-2 py-2 flex-shrink-0 safe-area-bottom">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={`relative flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-all duration-200 min-w-0 ${activeTab === item.id ? "text-violet-500" : "text-muted-foreground"}`}>
                  <Icon name={item.icon as AnyIcon} size={20} />
                  <span className="text-[9px] font-medium truncate">{item.label}</span>
                  {item.id === "chats" && totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}