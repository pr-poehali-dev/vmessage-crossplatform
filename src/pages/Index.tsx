import { useState, useEffect, useRef, useCallback, Component } from "react";
import type { ReactNode } from "react";
import Icon from "@/components/ui/icon";
import { authApi, chatsApi, usersApi, callsApi, getToken, getStoredUser, saveSession, clearSession, setUnauthorizedHandler } from "@/lib/api";
import type { User, Chat, Message } from "@/lib/api";
import { e2eeAvailable, getOrCreateKeyPair, exportPublicKey, getSharedKey, encryptText, decryptText, isEncrypted } from "@/lib/crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = any;

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <Icon name="AlertTriangle" size={32} className="text-red-400" />
          <p className="text-sm text-muted-foreground">Что-то пошло не так. Попробуйте обновить страницу.</p>
          <button onClick={() => this.setState({ error: null })} className="px-4 py-2 rounded-xl bg-secondary text-sm">Повторить</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EMOJI_LIST = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","🎉","✅","💯","🙏","😊","🤣","😅","😭","🥳","😴","🤯","👀","💪","🚀","⭐","🌟","💎","🎵","🍕","🍔","🍺","☕","🌈","🌺","🦋","🐱","🐶","🎮"];

interface VoiceMessageProps {
  mediaUrl: string;
  dur: number;
  time: string;
  isOut: boolean;
  status?: string;
}
const SPEEDS = [0.5, 1, 1.5, 2] as const;

const VoiceMessage = ({ mediaUrl, dur, time, isOut, status }: VoiceMessageProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(dur);
  const [speed, setSpeed] = useState<number>(1);
  const endedRef = useRef(false);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      if (endedRef.current) {
        endedRef.current = false;
        setProgress(0);
        setCurrentTime(0);
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        audio.play().catch(() => {});
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    endedRef.current = false;
    audio.currentTime = ratio * audio.duration;
    if (!playing) audio.play().catch(() => {});
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    const next = SPEEDS[(SPEEDS.indexOf(speed as typeof SPEEDS[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio) audio.playbackRate = next;
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl max-w-[280px] w-[250px] ${isOut ? "vm-msg-out" : "vm-msg-in"}`}>
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onLoadedMetadata={e => { setDuration(Math.round(e.currentTarget.duration) || dur); e.currentTarget.playbackRate = speed; }}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          setCurrentTime(a.currentTime);
          setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
        }}
        onEnded={() => { endedRef.current = true; setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onPause={() => setPlaying(false)}
        onPlay={() => { endedRef.current = false; setPlaying(true); }}
      />
      <button
        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center vm-gradient-bg text-white"
        onClick={toggle}
      >
        <Icon name={playing ? "Pause" : "Play"} size={14} className={playing ? "" : "translate-x-0.5"} />
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`relative h-2 rounded-full overflow-hidden cursor-pointer ${isOut ? "bg-white/20" : "bg-violet-200 dark:bg-violet-800"}`}
          onClick={handleSeek}
        >
          <div className={`h-full rounded-full transition-none ${isOut ? "bg-white/80" : "bg-violet-500"}`} style={{ width: `${progress}%` }} />
        </div>
        <div className={`text-[10px] mt-1 flex items-center justify-between ${isOut ? "text-white/60" : "text-muted-foreground"}`}>
          <span>{playing || progress > 0 ? fmt(currentTime) : (duration ? fmt(duration) : "голосовое")}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={cycleSpeed}
              className={`text-[10px] font-bold px-1 rounded transition-colors ${isOut ? "text-white/70 hover:text-white" : "text-violet-500 hover:text-violet-700"}`}
            >
              {speed}x
            </button>
            <span className="flex items-center gap-0.5">
              {time}
              {isOut && (status === "read"
                ? <Icon name="CheckCheck" size={9} className="text-cyan-300" />
                : <Icon name="CheckCheck" size={9} />
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  // Шаги: 1 = ввод телефона+email, 2 = ввод кода (+ данные для регистрации)
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const reset = (newTab: "login" | "register") => {
    setTab(newTab); setStep(1); setCode(""); setError("");
  };

  const sendCode = async () => {
    setError(""); setLoading(true);
    try {
      const purpose = tab === "register" ? "register" : "login";
      const res = await authApi.sendCode(email.trim(), purpose, phone.trim() || undefined);
      if (res.ok) { setStep(2); setCooldown(60); }
      else setError(res.error || "Ошибка отправки кода");
    } catch { setError("Нет соединения с сервером"); }
    finally { setLoading(false); }
  };

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      let res;
      if (tab === "register") {
        res = await authApi.register(phone.trim(), email.trim(), code.trim(), displayName.trim(), password);
      } else {
        res = await authApi.login(phone.trim(), email.trim(), code.trim());
      }
      if (res.ok) { saveSession(res.token, res.user); onAuth(res.token, res.user); }
      else setError(res.error || "Ошибка");
    } catch { setError("Нет соединения с сервером"); }
    finally { setLoading(false); }
  };

  const ic = "w-full bg-secondary rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all";
  const errEl = error ? <div className="bg-red-50 dark:bg-red-900/20 text-red-500 text-sm px-4 py-2.5 rounded-xl flex items-center gap-2"><Icon name="AlertCircle" size={15} />{error}</div> : null;

  return (
    <div className="flex items-center justify-center vm-chat-bg p-4" style={{ height: "100dvh" }}>
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
              <button key={t} onClick={() => reset(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${tab === t ? "vm-gradient-bg text-white shadow-md" : "text-muted-foreground"}`}>
                {t === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>

          {/* ── ШАГ 1: телефон + email ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                {tab === "register" ? "Введи номер телефона и email — пришлём код" : "Введи номер телефона и email для входа"}
              </p>
              <div className="relative">
                <Icon name="Phone" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67"
                  type="tel" className={ic} />
              </div>
              <div className="relative">
                <Icon name="Mail" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
                  type="email" className={ic} onKeyDown={e => e.key === "Enter" && sendCode()} />
              </div>
              {errEl}
              <button onClick={sendCode} disabled={loading || !phone.trim() || !email.trim()}
                className="w-full vm-gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-95 shadow-lg shadow-violet-500/30 disabled:opacity-60 transition-all">
                {loading ? "Отправляем код..." : "Получить код на email"}
              </button>
            </div>
          )}

          {/* ── ШАГ 2: код (+ данные при регистрации) ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Код отправлен на</p>
                  <p className="text-sm font-semibold">{email}</p>
                </div>
                <button onClick={() => { setStep(1); setCode(""); setError(""); }} className="text-xs text-violet-500 hover:underline">Изменить</button>
              </div>

              <div className="relative">
                <Icon name="ShieldCheck" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Код из письма (6 цифр)" inputMode="numeric" maxLength={6}
                  className={ic + " tracking-widest text-center text-lg font-bold"} />
              </div>

              {tab === "register" && (
                <>
                  <div className="relative">
                    <Icon name="User" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                      placeholder="Ваше имя" className={ic} />
                  </div>
                  <div className="relative">
                    <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && submit()}
                      placeholder="Придумайте пароль (мин. 6 символов)" className={ic} />
                  </div>
                </>
              )}

              {errEl}

              <button onClick={submit}
                disabled={loading || code.length < 6 || (tab === "register" && (!displayName.trim() || password.length < 6))}
                className="w-full vm-gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-95 shadow-lg shadow-violet-500/30 disabled:opacity-60 transition-all">
                {loading ? (tab === "register" ? "Создаём аккаунт..." : "Входим...") : (tab === "register" ? "Создать аккаунт" : "Войти")}
              </button>

              <button onClick={async () => {
                if (cooldown > 0) return;
                const purpose = tab === "register" ? "register" : "login";
                setLoading(true);
                const res = await authApi.sendCode(email.trim(), purpose, phone.trim() || undefined);
                if (res.ok) setCooldown(60); else setError(res.error || "Ошибка");
                setLoading(false);
              }} disabled={cooldown > 0 || loading} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                {cooldown > 0 ? `Отправить снова через ${cooldown} сек.` : "Отправить код повторно"}
              </button>
            </div>
          )}

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
  const [bars, setBars] = useState<number[]>(Array(20).fill(3));
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Храним колбэки в рефах чтобы useEffect не перезапускался при их смене
  const onCancelRef = useRef(onCancel);
  const onSendRef = useRef(onSend);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  useEffect(() => {
    let alive = true;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const mimeTypes = isIOS
      ? ["audio/mp4", "audio/aac", ""]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", ""];
    const mimeType = mimeTypes.find(t => !t || MediaRecorder.isTypeSupported(t)) ?? "";

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(stream => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      // AnalyserNode для визуализации уровня звука
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const drawBars = () => {
          if (!alive) return;
          analyser.getByteFrequencyData(data);
          const count = 20;
          const step = Math.max(1, Math.floor(data.length / count));
          const newBars = Array.from({ length: count }, (_, i) => {
            const val = data[i * step] ?? 0;
            return Math.max(3, Math.round((val / 255) * 24));
          });
          setBars(newBars);
          animFrameRef.current = requestAnimationFrame(drawBars);
        };
        animFrameRef.current = requestAnimationFrame(drawBars);
      } catch (_) { /* AudioContext недоступен */ }

      const opts = mimeType ? { mimeType } : {};
      const mr = new MediaRecorder(stream, opts);
      mrRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };

      // Стартуем без timeslice — данные соберём через requestData при остановке
      mr.start();

      // Таймер строго после mr.start()
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (!alive) return;
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
    }).catch(() => { if (alive) onCancelRef.current(); });

    return () => {
      alive = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
      if (mrRef.current && mrRef.current.state !== "inactive") {
        mrRef.current.onstop = null;
        try { mrRef.current.stop(); } catch (_) { /* ok */ }
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
      analyserRef.current?.context.close().catch(() => {});
    };
   
  }, []);

  const stop = async () => {
    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const dur = Math.floor((Date.now() - startedAtRef.current) / 1000);
    const mimeType = mr.mimeType || "audio/mp4";

    const collected = new Promise<void>(resolve => {
      mr.addEventListener("stop", resolve, { once: true });
    });
    if (mr.state === "recording") {
      try { mr.requestData(); } catch (_) { /* ok */ }
      try { mr.stop(); } catch (_) { /* ok */ }
    }
    await collected;

    const blob = new Blob(chunksRef.current, { type: mimeType });
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current?.context.close().catch(() => {});
    onSendRef.current(blob, Math.max(1, dur));
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-2xl px-3 py-2.5">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
      <span className="text-red-500 font-mono text-sm font-semibold w-10 flex-shrink-0">{fmt(seconds)}</span>
      <div className="flex items-end gap-px flex-1 h-6 overflow-hidden">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-red-400 rounded-sm"
            style={{ height: `${h}px`, transition: "height 80ms ease" }}
          />
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
  const [phase, setPhase] = useState<"init" | "ready" | "recording" | "sending" | "error">("init");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSendRef = useRef(onSend);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  const MAX = 60;

  // Инициализация камеры — один раз при монтировании
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
      .then(stream => {
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setPhase("ready");
      })
      .catch(() => { if (alive) setPhase("error"); });
    return () => {
      alive = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (mrRef.current && mrRef.current.state !== "inactive") {
        mrRef.current.onstop = null;
        try { mrRef.current.stop(); } catch (_) { /* ok */ }
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
   
  }, []);

  const stopRec = async () => {
    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const dur = Math.floor((Date.now() - startedAtRef.current) / 1000);
    const mimeType = (mr.mimeType || "video/webm").split(";")[0].trim();
    setPhase("sending");

    const collected = new Promise<void>(resolve => {
      mr.addEventListener("stop", resolve, { once: true });
    });
    if (mr.state === "recording") {
      try { mr.requestData(); } catch (_) { /* ok */ }
      try { mr.stop(); } catch (_) { /* ok */ }
    }
    await collected;

    streamRef.current?.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunksRef.current, { type: mimeType });
    onSendRef.current(blob, Math.max(1, dur));
  };

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || phase !== "ready") return;
    // Порядок приоритета: mp4 (совместим с Safari/iOS/Chrome), затем webm
    const mimeType = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      ""
    ].find(t => !t || MediaRecorder.isTypeSupported(t)) ?? "";
    console.log("[VIDEO REC] selected mimeType:", mimeType || "(default)");
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start();
    startedAtRef.current = Date.now();
    setPhase("recording");
    setSeconds(0);
    setProgress(0);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      setProgress((elapsed / MAX) * 100);
      if (elapsed >= MAX) stopRec();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-fade-in">
      <div className="flex flex-col items-center gap-5" onClick={e => e.stopPropagation()}>
        {phase === "error" ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <Icon name="VideoOff" size={36} className="text-red-400" />
            </div>
            <p className="text-white/70 text-sm text-center">Нет доступа к камере/микрофону</p>
            <button onClick={onCancelRef.current} className="px-5 py-2 rounded-xl bg-white/20 text-white text-sm">Закрыть</button>
          </div>
        ) : (
          <>
            <div className="relative w-56 h-56">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
                {phase === "recording" && (
                  <circle cx="50" cy="50" r="47" fill="none" stroke="#8b5cf6" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 47}`}
                    strokeDashoffset={`${2 * Math.PI * 47 * (1 - progress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }} />
                )}
              </svg>
              <div className="absolute inset-[6px] rounded-full overflow-hidden bg-black">
                <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
                {phase === "init" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {phase === "recording" && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 rounded-full px-2 py-0.5">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-[10px] font-bold">{seconds}с</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-5">
              <button onClick={onCancelRef.current} disabled={phase === "sending"}
                className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors disabled:opacity-30 disabled:pointer-events-none">
                <Icon name="X" size={20} />
              </button>
              {phase === "sending" ? (
                <div className="w-16 h-16 rounded-full bg-violet-500/30 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              ) : phase === "recording" ? (
                <button onClick={stopRec}
                  className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 hover:bg-red-600 transition-colors">
                  <Icon name="Square" size={24} />
                </button>
              ) : (
                <button onClick={startRec} disabled={phase !== "ready"}
                  className="w-16 h-16 rounded-full vm-gradient-bg text-white flex items-center justify-center shadow-2xl shadow-violet-500/50 disabled:opacity-40 hover:opacity-90 transition-opacity">
                  <Icon name="Video" size={26} />
                </button>
              )}
            </div>
            <p className="text-white/50 text-xs">
              {phase === "sending" ? "Отправка..." : phase === "init" ? "Инициализация камеры..." : phase === "recording" ? "Нажмите стоп для отправки" : "Нажмите для записи"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Video Note Message ───────────────────────────────────────────────────────
function VideoNoteMessage({ m }: { m: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const dur = m.text?.match(/(\d+)с/) ? parseInt(m.text.match(/(\d+)с/)![1]) : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, "0")}`;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || videoError) return;
    if (!expanded) setExpanded(true);
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  };

  const close = () => {
    videoRef.current?.pause();
    setExpanded(false);
    setPlaying(false);
  };

  const size = expanded ? 260 : 140;

  return (
    <>
      {/* Затемнение фона при увеличении */}
      {expanded && (
        <div className="fixed inset-0 z-40 bg-black/60 animate-fade-in" onClick={close} />
      )}

      <div className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in ${expanded ? "relative z-50" : ""}`}>
        <div className="flex flex-col items-center gap-1">
          <div
            style={{ width: size, height: size, transition: "width 0.25s ease, height 0.25s ease" }}
            className={`rounded-full overflow-hidden relative shadow-xl cursor-pointer flex-shrink-0
              ${m.out ? "border-[3px] border-violet-400/60" : "border-[3px] border-white dark:border-gray-600"}`}
            onClick={togglePlay}
          >
            {m.media_url && !videoError ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  preload="metadata"
                  onError={() => setVideoError(true)}
                  onTimeUpdate={e => {
                    const v = e.currentTarget;
                    setCurrentSec(v.currentTime);
                    setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
                  }}
                  onEnded={() => { setPlaying(false); setProgress(0); setCurrentSec(0); if (videoRef.current) videoRef.current.currentTime = 0; setTimeout(() => setExpanded(false), 400); }}
                  onPause={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                >
                  <source src={m.media_url} type="video/mp4" />
                  <source src={m.media_url} type="video/webm" />
                </video>
                {/* Кольцо прогресса */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle cx="50" cy="50" r="47" fill="none" stroke="white" strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 47}`}
                    strokeDashoffset={`${2 * Math.PI * 47 * (1 - progress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.2s linear" }} />
                </svg>
                {/* Play/Pause overlay */}
                <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${playing ? "opacity-0 hover:opacity-100" : "opacity-100"}`}>
                  <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <Icon name={playing ? "Pause" : "Play"} size={expanded ? 28 : 20} className="text-white translate-x-0.5" />
                  </div>
                </div>
                {/* Время */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="text-white text-[11px] font-semibold drop-shadow">
                    {playing ? fmt(currentSec) : (dur > 0 ? fmt(dur) : "")}
                  </span>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-violet-900/60 gap-2">
                <Icon name="Video" size={expanded ? 48 : 32} className="text-white/70" />
                {m.media_url && (
                  <a href={m.media_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="text-white text-[11px] underline">Открыть</a>
                )}
              </div>
            )}
          </div>

          {/* Кнопка закрыть + скачать при раскрытии */}
          {expanded && (
            <div className="flex items-center gap-2 mt-1 z-50">
              {m.media_url && (
                <a href={m.media_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                  <Icon name="Download" size={14} />
                </a>
              )}
              <button onClick={close}
                className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                <Icon name="X" size={14} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{m.time}</span>
            {m.out && (m.status === "read"
              ? <Icon name="CheckCheck" size={10} className="text-violet-500" />
              : <Icon name="CheckCheck" size={10} className="text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </>
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
const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await callsApi.getIceConfig();
    if (res.ok && Array.isArray(res.ice_servers) && res.ice_servers.length > 0) {
      console.log("[ICE] got", res.ice_servers.length, "servers from backend");
      return res.ice_servers;
    }
  } catch (e) {
    console.warn("[ICE] failed to fetch from backend:", e);
  }
  console.log("[ICE] using fallback servers");
  return FALLBACK_ICE_SERVERS;
}

async function getMedia(isVideo: boolean): Promise<{ stream: MediaStream; error?: string }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: new MediaStream(), error: "Браузер не поддерживает медиа" };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      isVideo ? { video: true, audio: true } : { audio: true }
    );
    return { stream };
  } catch (e1) {
    console.warn("[MEDIA] video/audio failed, trying audio only:", e1);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream, error: isVideo ? "Камера недоступна, только аудио" : undefined };
    } catch (e2) {
      console.error("[MEDIA] all getUserMedia failed:", e2);
      return { stream: new MediaStream(), error: "Нет доступа к микрофону. Разрешите доступ в браузере." };
    }
  }
}

// ─── Wait for ICE gathering helper ──────────────────────────────────────────
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise(resolve => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    // Timeout 3s — быстрее, достаточно для большинства сетей
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 3000);
  });
}

// ─── WebRTC Call Modal (caller side) ──────────────────────────────────────────
function CallModal({ chat, calleeId, type, onClose }: {
  chat: Chat; calleeId: number; type: "audio" | "video"; onClose: () => void;
}) {
  const [status, setStatus] = useState<"calling" | "connected" | "ended" | "rejected">("calling");
  const [logs, setLogs] = useState<string[]>([]);
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
  const connectedRef = useRef(false);
  const aliveRef = useRef(true);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const log = (msg: string) => { console.log("[CALL]", msg); setLogs(l => [...l.slice(-6), msg]); };

  const stopAll = useCallback((endOnServer = false) => {
    aliveRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch (_e) { void _e; }
    if (endOnServer && callIdRef.current) callsApi.end(callIdRef.current);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const run = async () => {
      log("Запрос микрофона...");
      const { stream, error: mediaErr } = await getMedia(type === "video");
      if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      if (mediaErr) log("⚠️ " + mediaErr);
      else log(`Микрофон OK (треков: ${stream.getTracks().length})`);
      streamRef.current = stream;
      if (localVideoRef.current && type === "video" && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      log("Initiate + ICE config...");
      const [initRes, iceServers] = await Promise.all([
        callsApi.initiate(calleeId, type),
        getIceServers(),
      ]);
      if (!initRes.ok || !aliveRef.current) {
        log("❌ Initiate failed: " + (initRes.error || "net error"));
        setTimeout(onClose, 3000);
        return;
      }
      callIdRef.current = initRes.call_id;
      log(`Call ID: ${initRes.call_id}, ICE: ${iceServers.length} серверов`);

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const remoteStream = new MediaStream();
      pc.ontrack = e => {
        log(`Remote track: ${e.track.kind}`);
        (e.streams[0] ? e.streams[0].getTracks() : [e.track]).forEach(t => remoteStream.addTrack(t));
        const src = e.streams[0] || remoteStream;
        if (type === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = src; remoteVideoRef.current.play().catch(() => {});
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = src; remoteAudioRef.current.play().catch(() => {});
        }
      };

      const onConnected = () => {
        if (connectedRef.current) return;
        connectedRef.current = true;
        setStatus("connected");
        setLogs([]);
        if (!timerRef.current) timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      };
      pc.oniceconnectionstatechange = () => {
        log(`ICE: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") onConnected();
      };
      pc.onconnectionstatechange = () => {
        log(`Conn: ${pc.connectionState}`);
        if (pc.connectionState === "connected" || pc.connectionState === "completed") onConnected();
        if (pc.connectionState === "failed" && aliveRef.current) {
          setStatus("ended"); stopAll(true); setTimeout(onClose, 4000);
        }
      };
      pc.onicegatheringstatechange = () => log(`Gather: ${pc.iceGatheringState}`);

      log("Создаю offer...");
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === "video" });
      await pc.setLocalDescription(offer);
      log("Жду ICE gathering...");
      await waitForIceGathering(pc);
      log(`SDP готов (${pc.localDescription?.sdp?.length} байт), отправляю...`);
      await callsApi.sendOffer(callIdRef.current!, JSON.stringify(pc.localDescription));
      log("Offer отправлен. Жду ответ...");

      pollRef.current = setInterval(async () => {
        if (!callIdRef.current || !aliveRef.current) return;
        const st = await callsApi.getStatus(callIdRef.current);
        if (!st.ok) return;
        if (st.status === "rejected") { if (aliveRef.current) { setStatus("rejected"); stopAll(); setTimeout(onClose, 1500); } return; }
        if (st.status === "ended") { if (aliveRef.current) { setStatus("ended"); stopAll(); setTimeout(onClose, 1000); } return; }
        if (st.status === "accepted" && st.has_answer && !pc.remoteDescription) {
          log(`Статус: accepted, получаю answer...`);
          const ansR = await callsApi.getAnswer(callIdRef.current!);
          if (ansR.ok && ansR.answer) {
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(ansR.answer)));
              log("Remote desc установлен. ICE идёт...");
            } catch (e) { log("❌ setRemoteDesc: " + String((e as Error)?.message || e)); }
          } else { log("❌ getAnswer failed: " + JSON.stringify(ansR)); }
        }
      }, 1500);
    };

    run().catch(e => { log("❌ Exception: " + String((e as Error)?.message || e)); });
    return () => { stopAll(true); };
  }, [calleeId, type, stopAll, onClose]);

  const endCall = () => { stopAll(true); setStatus("ended"); setTimeout(onClose, 600); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-violet-900 to-indigo-900 p-4 animate-fade-in">
      {type === "video" && (
        <div className="absolute inset-0">
          <video ref={remoteVideoRef} className="w-full h-full object-cover" playsInline autoPlay />
          <div className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
            {camOff && <div className="absolute inset-0 bg-black/80 flex items-center justify-center"><Icon name="VideoOff" size={24} className="text-white" /></div>}
          </div>
        </div>
      )}
      {type === "audio" && <audio ref={remoteAudioRef} autoPlay />}
      <div className="relative flex flex-col items-center mt-8 z-10 text-center px-4 w-full">
        <Avatar label={chat.name} color={chat.avatar_color} size={80} src={chat.avatar_url || undefined} />
        <h2 className="text-white font-bold text-xl mt-3">{chat.name}</h2>
        <p className="text-white/70 text-sm mt-1">
          {status === "connected" ? fmt(seconds) : status === "rejected" ? "Недоступен" : status === "ended" ? "Завершён" : "Вызов..."}
        </p>
        {status !== "connected" && logs.length > 0 && (
          <div className="mt-3 w-full max-w-xs bg-black/40 rounded-xl p-2 text-left">
            {logs.map((l, i) => (
              <p key={i} className={`text-xs font-mono leading-5 ${l.startsWith("❌") ? "text-red-400" : l.startsWith("⚠️") ? "text-yellow-400" : "text-white/60"}`}>{l}</p>
            ))}
          </div>
        )}
      </div>
      <div className="relative flex items-center gap-6 z-10 mb-6">
        {type === "video" && (
          <button onClick={() => { streamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamOff(v => !v); }}
            className={`w-14 h-14 rounded-full ${camOff ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center`}>
            <Icon name={camOff ? "VideoOff" : "Video"} size={22} />
          </button>
        )}
        <button onClick={() => { streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMuted(v => !v); }}
          className={`w-14 h-14 rounded-full ${muted ? "bg-red-500" : "bg-white/20"} text-white flex items-center justify-center`}>
          <Icon name={muted ? "MicOff" : "Mic"} size={22} />
        </button>
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50">
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
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const connectedRef = useRef(false);
  const aliveRef = useRef(true);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const log = (msg: string) => { console.log("[CALLEE]", msg); setLogs(l => [...l.slice(-6), msg]); };

  const stopAll = useCallback((endOnServer = false) => {
    aliveRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { pcRef.current?.close(); } catch (_e) { void _e; }
    if (endOnServer) callsApi.end(callId);
  }, [callId]);

  useEffect(() => {
    aliveRef.current = true;
    const run = async () => {
      log("Запрос микрофона...");
      const [{ stream, error: mediaErr }, iceServers, firstOffer] = await Promise.all([
        getMedia(callType === "video"),
        getIceServers(),
        callsApi.getOffer(callId),
      ]);
      if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      if (mediaErr) log("⚠️ " + mediaErr);
      else log(`Микрофон OK (треков: ${stream.getTracks().length})`);
      streamRef.current = stream;
      if (localVideoRef.current && callType === "video" && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream; localVideoRef.current.play().catch(() => {});
      }

      log(`ICE: ${iceServers.length} серверов`);
      let offerRes = firstOffer;
      log(`Оффер: ok=${offerRes.ok} has=${!!offerRes.offer}`);

      // Ждём оффер до 40 секунд (caller собирает ICE — это занимает время)
      let waited = 0;
      while ((!offerRes.ok || !offerRes.offer) && waited < 40 && aliveRef.current) {
        await new Promise(r => setTimeout(r, 1500));
        offerRes = await callsApi.getOffer(callId);
        waited += 1.5;
        if (!offerRes.offer) log(`Жду оффер... ${Math.round(waited)}с`);
      }
      if (!offerRes.ok || !offerRes.offer || !aliveRef.current) {
        log("❌ Оффер не получен за 40с");
        stopAll(); setTimeout(onClose, 3000); return;
      }
      log("Оффер получен!");

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const remoteStream = new MediaStream();
      pc.ontrack = e => {
        log(`Remote track: ${e.track.kind}`);
        (e.streams[0] ? e.streams[0].getTracks() : [e.track]).forEach(t => remoteStream.addTrack(t));
        const src = e.streams[0] || remoteStream;
        if (callType === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = src; remoteVideoRef.current.play().catch(() => {});
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = src; remoteAudioRef.current.play().catch(() => {});
        }
      };

      const onConnected = () => {
        if (connectedRef.current) return;
        connectedRef.current = true;
        setConnected(true);
        setLogs([]);
        if (!timerRef.current) timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      };
      pc.oniceconnectionstatechange = () => {
        log(`ICE: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") onConnected();
      };
      pc.onconnectionstatechange = () => {
        log(`Conn: ${pc.connectionState}`);
        if (pc.connectionState === "connected" || pc.connectionState === "completed") onConnected();
        if (pc.connectionState === "failed" && aliveRef.current) {
          stopAll(true); setTimeout(onClose, 4000);
        }
      };
      pc.onicegatheringstatechange = () => log(`Gather: ${pc.iceGatheringState}`);

      log("setRemoteDescription...");
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerRes.offer)));
        log("Remote desc OK");
      } catch (e) {
        log("❌ RemoteDesc: " + String((e as Error)?.message || e));
        stopAll(); setTimeout(onClose, 3000); return;
      }

      log("createAnswer...");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("Жду ICE gathering...");
      await waitForIceGathering(pc);
      log(`Answer SDP (${pc.localDescription?.sdp?.length} байт), отправляю...`);
      await callsApi.accept(callId, JSON.stringify(pc.localDescription));
      log("Answer отправлен. ICE идёт...");

      pollRef.current = setInterval(async () => {
        if (!aliveRef.current) return;
        const st = await callsApi.getStatus(callId);
        if (st.status === "ended" || st.status === "rejected") {
          if (aliveRef.current) { stopAll(); onClose(); }
        }
      }, 2000);
    };

    run().catch(e => { log("❌ Exception: " + String((e as Error)?.message || e)); });
    return () => { stopAll(true); };
  }, [callId, callType, stopAll, onClose]);

  const endCall = () => { stopAll(true); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-violet-900 to-indigo-900 p-4 animate-fade-in">
      {callType === "video" && (
        <div className="absolute inset-0">
          <video ref={remoteVideoRef} className="w-full h-full object-cover" playsInline autoPlay />
          <div className="absolute bottom-32 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl">
            <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
          </div>
        </div>
      )}
      {callType === "audio" && <audio ref={remoteAudioRef} autoPlay />}
      <div className="relative flex flex-col items-center mt-8 z-10 text-center px-4 w-full">
        <Avatar label={callerName} color={callerColor} size={80} src={callerAvatar} />
        <h2 className="text-white font-bold text-xl mt-3">{callerName}</h2>
        <p className="text-white/70 text-sm mt-1">{connected ? fmt(seconds) : "Соединение..."}</p>
        {!connected && logs.length > 0 && (
          <div className="mt-3 w-full max-w-xs bg-black/40 rounded-xl p-2 text-left">
            {logs.map((l, i) => (
              <p key={i} className={`text-xs font-mono leading-5 ${l.startsWith("❌") ? "text-red-400" : l.startsWith("⚠️") ? "text-yellow-400" : "text-white/60"}`}>{l}</p>
            ))}
          </div>
        )}
      </div>
      <div className="relative flex items-center gap-6 z-10 mb-6">
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
        <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/50">
          <Icon name="PhoneOff" size={26} />
        </button>
      </div>
    </div>
  );
}

// ─── Active Sessions Modal ────────────────────────────────────────────────────
function ActiveSessionsModal({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<{ id: number; device: string; ip: string; created_at: string; last_active: string; is_current: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState(false);

  useEffect(() => {
    authApi.sessions().then(res => {
      if (res.ok) setSessions(res.sessions);
      setLoading(false);
    });
  }, []);

  const logoutOther = async () => {
    setTerminating(true);
    await authApi.logoutOther();
    const res = await authApi.sessions();
    if (res.ok) setSessions(res.sessions);
    setTerminating(false);
  };

  const deviceIcon = (device: string) => {
    if (device.includes("iPhone") || device.includes("iPad") || device.includes("Android")) return "Smartphone";
    if (device.includes("Windows") || device.includes("Mac") || device.includes("Linux")) return "Monitor";
    return "Globe";
  };

  const otherCount = sessions.filter(s => !s.is_current).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-3xl shadow-2xl p-5 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Активные сессии</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <Icon name="X" size={18} />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="Loader" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto vm-scrollbar">
            {sessions.map(s => (
              <div key={s.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${s.is_current ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800" : "bg-secondary/50 border-border"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.is_current ? "vm-gradient-bg" : "bg-secondary"}`}>
                  <Icon name={deviceIcon(s.device) as AnyIcon} size={20} className={s.is_current ? "text-white" : "text-muted-foreground"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    {s.device}
                    {s.is_current && <span className="text-[10px] bg-violet-100 dark:bg-violet-800 text-violet-600 dark:text-violet-300 px-1.5 py-0.5 rounded-full">Текущая</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{s.ip && `${s.ip} · `}Активна: {s.last_active}</div>
                </div>
                {s.is_current && <div className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}
        {otherCount > 0 && (
          <button onClick={logoutOther} disabled={terminating}
            className="w-full mt-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-500 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2">
            {terminating ? <Icon name="Loader" size={16} className="animate-spin" /> : <Icon name="LogOut" size={16} />}
            Завершить другие сессии ({otherCount})
          </button>
        )}
        {!loading && otherCount === 0 && (
          <p className="text-xs text-muted-foreground mt-4 text-center">Других активных сессий нет</p>
        )}
      </div>
    </div>
  );
}

// ─── Chat Settings Modal ──────────────────────────────────────────────────────
function ChatSettingsModal({ chat, onClose, onUpdated }: { chat: Chat; onClose: () => void; onUpdated: (c: Chat) => void }) {
  const [tab, setTab] = useState<"info" | "members">("info");
  const [name, setName] = useState(chat.name);
  const [description, setDescription] = useState("");
  const [membersCanWrite, setMembersCanWrite] = useState(chat.members_can_write ?? true);
  const [members, setMembers] = useState<{ id: number; username: string; display_name: string; avatar_color: string; avatar_url?: string; role: string; online: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [membersCount, setMembersCount] = useState(chat.members_count ?? 0);
  const [myRole, setMyRole] = useState(chat.my_role ?? "member");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    chatsApi.getChatInfo(chat.id).then(res => {
      if (res.ok) {
        setDescription(res.chat.description || "");
        setMembersCanWrite(res.chat.members_can_write ?? true);
        setMembersCount(res.chat.members_count);
        setMyRole(res.chat.my_role);
      }
    });
    chatsApi.getMembers(chat.id).then(res => {
      if (res.ok) setMembers(res.members);
    });
  }, [chat.id]);

  const save = async () => {
    setSaving(true);
    const res = await chatsApi.updateChat(chat.id, { name, description, members_can_write: membersCanWrite });
    if (res.ok) onUpdated({ ...chat, name, members_can_write: membersCanWrite, avatar_url: res.chat.avatar_url || chat.avatar_url });
    setSaving(false);
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await chatsApi.updateChat(chat.id, { avatar_data: base64, avatar_mime: file.type });
    if (res.ok) onUpdated({ ...chat, avatar_url: res.chat.avatar_url });
    setUploadingAvatar(false);
  };

  const setRole = async (userId: number, role: string) => {
    await chatsApi.setMemberRole(chat.id, userId, role);
    setMembers(m => m.map(mb => mb.id === userId ? { ...mb, role } : mb));
  };

  const kick = async (userId: number) => {
    await chatsApi.kickMember(chat.id, userId);
    setMembers(m => m.filter(mb => mb.id !== userId));
    setMembersCount(c => c - 1);
  };

  const roleLabel = (r: string) => r === "owner" ? "Владелец" : r === "admin" ? "Админ" : "Участник";
  const roleColor = (r: string) => r === "owner" ? "text-violet-500" : r === "admin" ? "text-blue-500" : "text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-scale-in">
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 safe-area-top">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <span className="font-semibold flex-1">Настройки {chat.type === "channel" ? "канала" : "группы"}</span>
      </div>

      <div className="flex border-b">
        {(["info", "members"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? "border-b-2 border-violet-500 text-violet-500" : "text-muted-foreground"}`}>
            {t === "info" ? "Основное" : `Участники (${membersCount})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto vm-scrollbar p-4">
        {tab === "info" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="relative cursor-pointer" onClick={() => isAdmin && avatarInputRef.current?.click()}>
                <div className="w-20 h-20 rounded-full overflow-hidden shadow-xl">
                  {chat.avatar_url ? (
                    <img src={chat.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white" style={{ background: chat.avatar_color }}>
                      {chat.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center shadow">
                    {uploadingAvatar ? <Icon name="Loader" size={14} className="text-white animate-spin" /> : <Icon name="Camera" size={14} className="text-white" />}
                  </div>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Название</label>
              <input value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin}
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 ring-violet-500/30 disabled:opacity-60" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!isAdmin} rows={3}
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 ring-violet-500/30 resize-none disabled:opacity-60" />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary rounded-2xl">
              <div>
                <div className="text-sm font-medium">Участники могут писать</div>
                <div className="text-xs text-muted-foreground">{chat.type === "channel" ? "В канале пишут все подписчики" : "В группе пишут все участники"}</div>
              </div>
              <button onClick={() => isAdmin && setMembersCanWrite(v => !v)} disabled={!isAdmin}
                className={`w-11 h-6 rounded-full transition-all duration-300 flex items-center px-1 disabled:opacity-60 ${membersCanWrite ? "vm-gradient-bg" : "bg-muted"}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${membersCanWrite ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {chat.invite_code && (
              <div className="bg-secondary rounded-2xl p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ссылка-приглашение</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono flex-1 truncate text-violet-500">{chat.invite_code}</span>
                  <button onClick={() => navigator.clipboard.writeText(chat.invite_code!)} className="p-2 rounded-xl hover:bg-background transition-colors">
                    <Icon name="Copy" size={16} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}

            {isAdmin && (
              <button onClick={save} disabled={saving}
                className="w-full py-3 rounded-2xl vm-gradient-bg text-white text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Icon name="Loader" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
                Сохранить изменения
              </button>
            )}
          </div>
        )}

        {tab === "members" && (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-2xl">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ background: m.avatar_color }}>
                      {m.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.display_name}</div>
                  <div className={`text-xs ${roleColor(m.role)}`}>{roleLabel(m.role)}</div>
                </div>
                {isAdmin && m.role !== "owner" && (
                  <div className="flex gap-1">
                    <button onClick={() => setRole(m.id, m.role === "admin" ? "member" : "admin")}
                      className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground" title={m.role === "admin" ? "Снять права" : "Сделать админом"}>
                      <Icon name={m.role === "admin" ? "ShieldOff" : "Shield"} size={14} />
                    </button>
                    <button onClick={() => kick(m.id)}
                      className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-red-500" title="Исключить">
                      <Icon name="UserMinus" size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chat Profile Modal (view info about group/channel) ───────────────────────
function ChatProfileModal({ chat, me, onClose, onOpenSettings }: {
  chat: Chat; me: User; onClose: () => void; onOpenSettings: () => void;
}) {
  const [info, setInfo] = useState<{ description?: string; members_count?: number; my_role?: string } | null>(null);
  const [members, setMembers] = useState<{ id: number; display_name: string; avatar_color: string; avatar_url?: string; role: string; online: boolean }[]>([]);
  const [tab, setTab] = useState<"info" | "members">("info");

  useEffect(() => {
    chatsApi.getChatInfo(chat.id).then(res => {
      if (res.ok) setInfo(res.chat);
    });
    chatsApi.getMembers(chat.id).then(res => {
      if (res.ok) setMembers(res.members);
    });
  }, [chat.id]);

  const isAdmin = info?.my_role === "owner" || info?.my_role === "admin";
  const count = info?.members_count ?? chat.members_count ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-scale-in">
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 safe-area-top">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <span className="font-semibold flex-1">{chat.type === "channel" ? "Канал" : "Группа"}</span>
        {isAdmin && (
          <button onClick={() => { onClose(); onOpenSettings(); }} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            <Icon name="Settings" size={18} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto vm-scrollbar">
        {/* Header with avatar */}
        <div className="vm-gradient-bg pt-8 pb-6 px-4 flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full overflow-hidden shadow-2xl border-4 border-white/20">
            {chat.avatar_url ? (
              <img src={chat.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white" style={{ background: chat.avatar_color }}>
                {chat.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-white font-bold text-xl">{chat.name}</h2>
            <p className="text-white/70 text-sm mt-1">
              {chat.type === "channel" ? `${count} подписчиков` : `${count} участников`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(["info", "members"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? "border-b-2 border-violet-500 text-violet-500" : "text-muted-foreground"}`}>
              {t === "info" ? "О чате" : `Участники (${count})`}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <div className="p-4 space-y-3">
            {info?.description ? (
              <div className="bg-secondary rounded-2xl p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Описание</div>
                <p className="text-sm leading-relaxed">{info.description}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Описание не добавлено</p>
            )}
            {chat.invite_code && (
              <div className="bg-secondary rounded-2xl p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ссылка-приглашение</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono flex-1 truncate text-violet-500">{chat.invite_code}</span>
                  <button onClick={() => navigator.clipboard.writeText(chat.invite_code!)} className="p-2 rounded-xl hover:bg-background transition-colors">
                    <Icon name="Copy" size={16} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "members" && (
          <div className="p-4 space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-2xl">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ background: m.avatar_color }}>
                      {m.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  {m.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-background" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.display_name}</div>
                  <div className={`text-xs ${m.role === "owner" ? "text-violet-500" : m.role === "admin" ? "text-blue-500" : "text-muted-foreground"}`}>
                    {m.role === "owner" ? "Владелец" : m.role === "admin" ? "Администратор" : "Участник"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
      <div className="p-4 pb-2 safe-area-top">
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
      <div className="p-4 pb-2 safe-area-top">
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
          <div className="px-1 py-1 text-xs font-semibold text-muted-foreground">Результаты поиска — нажми чтобы написать</div>
        )}
        {displayList.map((c, i) => {
          const uStatus = c.status || (c.online ? "online" : "offline");
          return (
            <div key={c.id} className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
              onClick={() => showGlobal ? onStartChat(c.username) : onOpenProfile(c)}>
              <Avatar label={c.display_name} color={c.avatar_color} status={uStatus} src={c.avatar_url} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.display_name}</div>
                <div className={`text-xs ${uStatus === "online" ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {showGlobal ? `@${c.username}` : statusLabel(uStatus)}
                </div>
              </div>
              {showGlobal ? (
                <div className="px-2.5 py-1 rounded-xl vm-gradient-bg text-white text-xs font-medium flex items-center gap-1 flex-shrink-0">
                  <Icon name="MessageCircle" size={12} />
                  Написать
                </div>
              ) : (
                <button onClick={e => { e.stopPropagation(); onStartChat(c.username); }}
                  className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-violet-500 transition-colors">
                  <Icon name="MessageCircle" size={16} />
                </button>
              )}
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
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  // Смена email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailStep, setEmailStep] = useState<1|2>(1);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailCooldown, setEmailCooldown] = useState(0);
  // Смена телефона
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  // Удаление аккаунта
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const t = setTimeout(() => setEmailCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [emailCooldown]);

  const save = async () => {
    setSaving(true);
    const res = await usersApi.update({ display_name: name, bio });
    if (res.ok) { onUpdate(res.user); setEditing(false); }
    setSaving(false);
  };

  const saveUsername = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) { setUsernameError("Введите имя пользователя"); return; }
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(trimmed)) { setUsernameError("Только латиница, цифры и _, от 3 до 32 символов"); return; }
    setSavingUsername(true);
    setUsernameError("");
    const res = await authApi.changeUsername(trimmed);
    if (res.ok) {
      onUpdate({ ...me, username: res.username });
      setNewUsername("");
    } else {
      setUsernameError(res.error || "Не удалось сменить имя пользователя");
    }
    setSavingUsername(false);
  };

  const sendEmailCode = async () => {
    setEmailError("");
    setEmailLoading(true);
    const res = await authApi.sendCode(newEmail.trim(), "register");
    if (res.ok) { setEmailStep(2); setEmailCooldown(60); }
    else setEmailError(res.error || "Ошибка отправки кода");
    setEmailLoading(false);
  };

  const confirmEmailChange = async () => {
    setEmailError("");
    setEmailLoading(true);
    const res = await authApi.changeEmail(newEmail.trim(), emailCode.trim());
    if (res.ok) {
      onUpdate({ ...me, email: res.email });
      setShowChangeEmail(false);
      setNewEmail(""); setEmailCode(""); setEmailStep(1);
    } else setEmailError(res.error || "Ошибка");
    setEmailLoading(false);
  };

  const savePhone = async () => {
    setPhoneError("");
    const digits = newPhone.replace(/\D/g, "");
    if (digits.length < 7) { setPhoneError("Введите корректный номер телефона"); return; }
    setPhoneLoading(true);
    const res = await authApi.changePhone("+" + digits);
    if (res.ok) {
      onUpdate({ ...me, phone: res.phone });
      setShowChangePhone(false); setNewPhone("");
    } else setPhoneError(res.error || "Ошибка");
    setPhoneLoading(false);
  };

  const confirmDeleteAccount = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    const res = await authApi.deleteAccount(deletePassword);
    if (res.ok) onLogout();
    else setDeleteError(res.error || "Ошибка");
    setDeleteLoading(false);
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
      <div className="relative vm-gradient-bg pt-10 pb-6 px-6 flex-shrink-0 safe-area-top">
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

      {/* Личные данные */}
      <div className="mx-4 mt-4 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm">Личные данные</span>
          {editing ? (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-secondary">Отмена</button>
              <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-xl text-xs font-medium vm-gradient-bg text-white shadow-lg shadow-violet-500/30">
                {saving ? "..." : "Сохранить"}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-secondary hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors">Изменить</button>
          )}
        </div>
        {[
          { label: "Имя", value: name, set: setName, icon: "User" },
          { label: "О себе", value: bio, set: setBio, icon: "FileText" },
        ].map(({ label, value, set, icon }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <div className="relative">
              <Icon name={icon as AnyIcon} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              {editing ? (
                <input value={value} onChange={e => set(e.target.value)} className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
              ) : (
                <div className="bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground/80">{value || "—"}</div>
              )}
            </div>
          </div>
        ))}
        {/* Телефон — отображение + кнопка смены */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Номер телефона</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="Phone" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <div className="bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground/80">{me.phone || "—"}</div>
            </div>
            <button onClick={() => { setShowChangePhone(v => !v); setShowChangeEmail(false); setPhoneError(""); setNewPhone(""); }}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-secondary hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors whitespace-nowrap">
              Сменить
            </button>
          </div>
        </div>
        {/* Email — отображение + кнопка смены */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="Mail" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <div className="bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground/80">{me.email || "—"}</div>
            </div>
            <button onClick={() => { setShowChangeEmail(v => !v); setShowChangePhone(false); setEmailError(""); setEmailStep(1); setNewEmail(""); setEmailCode(""); }}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-secondary hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors whitespace-nowrap">
              Сменить
            </button>
          </div>
        </div>
      </div>

      {/* Смена телефона */}
      {showChangePhone && (
        <div className="mx-4 mt-3 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0 border border-violet-500/30">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Новый номер телефона</span>
            <button onClick={() => { setShowChangePhone(false); setNewPhone(""); setPhoneError(""); }} className="p-1 rounded-lg hover:bg-secondary">
              <Icon name="X" size={16} className="text-muted-foreground" />
            </button>
          </div>
          <div className="relative">
            <Icon name="Phone" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+7 999 123-45-67" type="tel"
              className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
          </div>
          {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
          <button onClick={savePhone} disabled={phoneLoading || !newPhone.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold vm-gradient-bg text-white disabled:opacity-60">
            {phoneLoading ? "Сохраняем..." : "Сохранить номер"}
          </button>
        </div>
      )}

      {/* Смена email */}
      {showChangeEmail && (
        <div className="mx-4 mt-3 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0 border border-violet-500/30">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Новый email</span>
            <button onClick={() => { setShowChangeEmail(false); setEmailStep(1); setNewEmail(""); setEmailCode(""); setEmailError(""); }} className="p-1 rounded-lg hover:bg-secondary"><Icon name="X" size={16} className="text-muted-foreground" /></button>
          </div>
          {emailStep === 1 ? (
            <>
              <div className="relative">
                <Icon name="Mail" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="новый@email.com" type="email"
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
              </div>
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              <button onClick={sendEmailCode} disabled={emailLoading || !newEmail.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold vm-gradient-bg text-white disabled:opacity-60">
                {emailLoading ? "Отправляем..." : "Получить код"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Код отправлен на {newEmail}</p>
              <div className="relative">
                <Icon name="ShieldCheck" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Код из письма" inputMode="numeric" maxLength={6}
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 tracking-widest text-center font-bold" />
              </div>
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              <button onClick={confirmEmailChange} disabled={emailLoading || emailCode.length < 6} className="w-full py-2.5 rounded-xl text-sm font-semibold vm-gradient-bg text-white disabled:opacity-60">
                {emailLoading ? "Подтверждаем..." : "Подтвердить"}
              </button>
              <button onClick={async () => { if (emailCooldown > 0) return; await sendEmailCode(); }} disabled={emailCooldown > 0} className="w-full text-xs text-muted-foreground disabled:opacity-50">
                {emailCooldown > 0 ? `Повторно через ${emailCooldown} сек.` : "Отправить снова"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Смена username */}
      <div className="mx-4 mt-4 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0">
        <span className="font-semibold text-sm">Имя пользователя</span>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Текущий: @{me.username}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon name="AtSign" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={newUsername} onChange={e => { setNewUsername(e.target.value); setUsernameError(""); }} placeholder="новый_юзернейм"
                className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all" />
            </div>
            <button onClick={saveUsername} disabled={savingUsername || !newUsername.trim()} className="px-3 py-2 rounded-xl text-xs font-semibold vm-gradient-bg text-white shadow-lg shadow-violet-500/30 disabled:opacity-60 whitespace-nowrap">
              {savingUsername ? "..." : "Сменить"}
            </button>
          </div>
          {usernameError && <p className="text-xs text-red-400 mt-1">{usernameError}</p>}
        </div>
      </div>

      {/* Выйти + Удалить аккаунт */}
      <div className="mx-4 mt-4 mb-4 bg-card rounded-3xl p-2 flex-shrink-0">
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Icon name="LogOut" size={16} className="text-red-500" />
          </div>
          <span className="text-sm font-medium">Выйти из аккаунта</span>
        </button>
        <button onClick={() => setShowDeleteAccount(v => !v)} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Icon name="Trash2" size={16} className="text-red-500" />
          </div>
          <span className="text-sm font-medium">Удалить аккаунт</span>
        </button>
      </div>

      {/* Удаление аккаунта — подтверждение */}
      {showDeleteAccount && (
        <div className="mx-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded-3xl p-4 space-y-3 flex-shrink-0 border border-red-300/50">
          <div className="flex items-center gap-2 text-red-600">
            <Icon name="AlertTriangle" size={18} />
            <span className="font-semibold text-sm">Удаление аккаунта</span>
          </div>
          <p className="text-xs text-red-500">Это действие необратимо. Все данные будут удалены. Введи пароль для подтверждения.</p>
          <div className="relative">
            <Icon name="Lock" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" />
            <input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Твой пароль"
              className="w-full bg-white dark:bg-red-900/30 border border-red-300/50 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-400/40" />
          </div>
          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowDeleteAccount(false); setDeletePassword(""); setDeleteError(""); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white dark:bg-red-900/30 border border-red-300/50">Отмена</button>
            <button onClick={confirmDeleteAccount} disabled={deleteLoading || !deletePassword} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 transition-colors">
              {deleteLoading ? "..." : "Удалить навсегда"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sticker Packs Manager ────────────────────────────────────────────────────
function StickerPacksManager() {
  const [packs, setPacks] = useState<{id: number; name: string; cover_url: string|null; sticker_count: number; is_public: boolean; owner_id: number; stickers?: {id:number;image_url:string;emoji:string}[]}[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [expandedPack, setExpandedPack] = useState<number|null>(null);
  const [addingSticker, setAddingSticker] = useState<number|null>(null);
  const [stickerEmoji, setStickerEmoji] = useState("");
  const stickerFileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await chatsApi.getMyPacks();
      if (res.ok) setPacks(res.packs || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createPack = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await chatsApi.createPack(createName.trim(), isPublic);
      if (res.ok) {
        await load();
        setShowCreate(false);
        setCreateName("");
        setIsPublic(false);
      } else {
        setCreateError(res.error || "Не удалось создать пак");
      }
    } catch {
      setCreateError("Ошибка соединения");
    }
    setCreating(false);
  };

  const uploadSticker = async (packId: number, file: File) => {
    setAddingSticker(packId);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const res = await chatsApi.addSticker(packId, base64, file.type, stickerEmoji);
      if (res.ok) { await load(); setStickerEmoji(""); }
      setAddingSticker(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-4 mt-4 bg-card rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Мои стикер-паки</span>
        <button onClick={() => setShowCreate(v => !v)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium vm-gradient-bg text-white shadow-md shadow-violet-500/30">
          + Создать
        </button>
      </div>

      {showCreate && (
        <div className="bg-secondary rounded-2xl p-3 space-y-2">
          <input value={createName} onChange={e => setCreateName(e.target.value)}
            placeholder="Название пака"
            className="w-full bg-card rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400/40" />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-violet-500" />
            Публичный (виден всем)
          </label>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <button onClick={createPack} disabled={creating || !createName.trim()}
            className="w-full py-2 rounded-xl text-sm font-medium vm-gradient-bg text-white disabled:opacity-60">
            {creating ? "Создание..." : "Создать пак"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-2">Загрузка...</p>
      ) : packs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">Пока нет паков. Создай первый!</p>
      ) : (
        packs.map(pack => (
          <div key={pack.id} className="bg-secondary rounded-2xl p-3">
            <div className="flex items-center gap-3">
              {pack.cover_url ? (
                <img src={pack.cover_url} alt="" className="w-10 h-10 rounded-xl object-contain bg-card" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center text-xl">🎨</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{pack.name}</div>
                <div className="text-xs text-muted-foreground">{pack.sticker_count} стикеров · {pack.is_public ? "публичный" : "приватный"}</div>
              </div>
              <button onClick={() => setExpandedPack(expandedPack === pack.id ? null : pack.id)}
                className="p-1.5 rounded-lg hover:bg-card transition-colors">
                <Icon name={expandedPack === pack.id ? "ChevronUp" : "ChevronDown"} size={16} className="text-muted-foreground" />
              </button>
            </div>

            {expandedPack === pack.id && (
              <div className="mt-3 pt-3 border-t border-border">
                {pack.stickers && pack.stickers.length > 0 && (
                  <div className="grid grid-cols-5 gap-1 mb-3">
                    {pack.stickers.map(s => (
                      <img key={s.id} src={s.image_url} alt={s.emoji} className="w-12 h-12 object-contain rounded-lg bg-card p-1" />
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input value={stickerEmoji} onChange={e => setStickerEmoji(e.target.value)}
                    placeholder="😀 эмодзи"
                    className="w-16 bg-card rounded-xl px-2 py-1.5 text-sm outline-none text-center" />
                  <button onClick={() => stickerFileRef.current?.click()}
                    disabled={addingSticker === pack.id}
                    className="flex-1 py-1.5 rounded-xl text-xs font-medium bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-60">
                    {addingSticker === pack.id ? "Загрузка..." : "+ Добавить стикер"}
                  </button>
                  <input ref={stickerFileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && uploadSticker(pack.id, e.target.files[0])} />
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsSection() {
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [notifications, setNotifications] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [notifStatus, setNotifStatus] = useState<"default" | "granted" | "denied">("default");
  const [lang, setLang] = useState<"ru" | "en">(() => (localStorage.getItem("vm_lang") as "ru" | "en") || "ru");

  const switchLang = (l: "ru" | "en") => {
    setLang(l);
    localStorage.setItem("vm_lang", l);
  };

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
      <div className="p-4 pb-2 safe-area-top"><h2 className="text-lg font-bold">Настройки</h2></div>
      {[
        {
          title: "Внешний вид",
          items: [
            { label: "Тёмная тема", icon: "Moon", color: "text-indigo-500", isToggle: true, value: darkMode, onClick: () => { const next = !darkMode; setDarkMode(next); document.documentElement.classList.toggle("dark", next); localStorage.setItem("vm_dark", next ? "1" : "0"); } },
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
            { label: "Шифрование E2EE", icon: "Lock", color: "text-emerald-500", isToggle: false, value: "", onClick: undefined, hint: "Все приватные чаты зашифрованы" },
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

      <div className="mx-4 mt-4 bg-card rounded-3xl p-2">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Язык / Language</div>
        <div className="flex gap-2 px-3 pb-3">
          {(["ru", "en"] as const).map(l => (
            <button key={l} onClick={() => switchLang(l)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-colors ${lang === l ? "vm-gradient-bg text-white" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>
              {l === "ru" ? "🇷🇺 Русский" : "🇬🇧 English"}
            </button>
          ))}
        </div>
        {lang === "en" && (
          <p className="text-xs text-muted-foreground px-3 pb-3">Full English interface coming soon. Basic support enabled.</p>
        )}
      </div>

      <StickerPacksManager />

      <div className="mx-4 mt-4 bg-card rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="Info" size={15} className="text-violet-500" />
          <span className="text-sm font-medium">{lang === "en" ? "About" : "О приложении"}</span>
        </div>
        <p className="text-xs text-muted-foreground ml-6">V-message v1.0 · {lang === "en" ? "Next-generation messenger" : "Мессенджер нового поколения"}</p>
      </div>
    </div>
  );
}

// ─── Calls Section ─────────────────────────────────────────────────────────────
function CallsSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 safe-area-top"><h2 className="text-lg font-bold">Звонки</h2></div>
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
  // E2EE — только для приватных чатов
  const e2eeKeyRef = useRef<CryptoKey | null>(null);
  const e2eeReadyRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [showVideoNote, setShowVideoNote] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);

  // iOS: сдвигаем layout когда появляется клавиатура
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(offset);
    };
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => { vv.removeEventListener("resize", handler); vv.removeEventListener("scroll", handler); };
  }, []);

  const [showCall, setShowCall] = useState<"audio" | "video" | null>(null);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showChatProfile, setShowChatProfile] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{msgId: number; x: number; y: number; out: boolean; text?: string; type?: string} | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Record<string, {emoji: string; count: number; my: boolean}[]>>({});
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [stickerPacks, setStickerPacks] = useState<{id: number; name: string; stickers: {id: number; image_url: string; emoji: string}[]}[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const isAtBottomRef = useRef(true);
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

  // E2EE: инициализация для приватного чата
  useEffect(() => {
    if (chat.type !== "private" || !chat.username || !e2eeAvailable()) return;
    let cancelled = false;
    (async () => {
      try {
        const myPair = await getOrCreateKeyPair();
        // Регистрируем свой публичный ключ на сервере (один раз)
        const myPubB64 = await exportPublicKey(myPair);
        await usersApi.setPublicKey(myPubB64);
        // Получаем публичный ключ собеседника
        const res = await usersApi.getPublicKey(chat.username!);
        if (!res?.ok || !res.public_key || cancelled) return;
        const aesKey = await getSharedKey(myPair, res.public_key, `chat_${chat.id}`);
        e2eeKeyRef.current = aesKey;
        e2eeReadyRef.current = true;
      } catch { /* E2EE недоступен — работаем без шифрования */ }
    })();
    return () => { cancelled = true; };
  }, [chat.id, chat.username, chat.type]);

  const loadMessages = useCallback(async () => {
    const res = await chatsApi.messages(chat.id);
    if (res.ok) {
      // Расшифровываем зашифрованные сообщения если E2EE готов
      let rawMsgs: Message[] = res.messages;
      if (e2eeReadyRef.current && e2eeKeyRef.current) {
        rawMsgs = await Promise.all(rawMsgs.map(async m => {
          if (m.type === "text" && isEncrypted(m.text)) {
            try {
              return { ...m, text: await decryptText(e2eeKeyRef.current!, m.text) };
            } catch { return m; }
          }
          return m;
        }));
      }
      const newMsgs: Message[] = rawMsgs;
      setMessages(prev => {
        if (newMsgs.length > prevMsgCount.current && prevMsgCount.current > 0) {
          const newOnes = newMsgs.slice(prevMsgCount.current);
          newOnes.forEach((m: Message) => {
            if (!m.out && notifEnabledRef.current) {
              try {
                if (Notification.permission === "granted") {
                  const body = m.type === "voice" ? "🎤 Голосовое сообщение" : m.type === "video_note" ? "⭕ Видеосообщение" : (m.text || "Новое сообщение");
                  const opts: NotificationOptions = { body, icon: "/favicon.svg", badge: "/favicon.svg", tag: `msg-${m.id}`, renotify: true };
                  // Используем ServiceWorker для показа плашки (надёжнее чем new Notification)
                  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.ready.then(reg => {
                      reg.showNotification(`V-message: ${chat.name}`, opts).catch(() => {
                        new Notification(`V-message: ${chat.name}`, opts);
                      });
                    }).catch(() => {});
                  } else {
                    const notif = new Notification(`V-message: ${chat.name}`, opts);
                    setTimeout(() => notif.close(), 5000);
                  }
                }
              } catch (_e) { void _e; }
              try {
                const ctx = new AudioContext();
                ctx.resume().then(() => {
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
                  setTimeout(() => ctx.close(), 1000);
                }).catch(() => {});
              } catch (_e) { void _e; }
            }
          });
        }
        prevMsgCount.current = newMsgs.length;
        return newMsgs;
      });
      const rRes = await chatsApi.getReactions(chat.id);
      if (rRes.ok) setReactions(rRes.reactions);
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
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
    // Шифруем текст если E2EE готов
    const sendText = (e2eeReadyRef.current && e2eeKeyRef.current)
      ? await encryptText(e2eeKeyRef.current, text).catch(() => text)
      : text;
    if (editingMsgId) {
      const res = await chatsApi.editMessage(editingMsgId, sendText);
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text, edited: true } : m));
      }
      setEditingMsgId(null);
      return;
    }
    const res = await chatsApi.send(chat.id, sendText);
    if (res.ok) {
      setMessages(m => [...m, {
        ...res.message,
        text, // показываем расшифрованный текст сразу
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
    if (!blob || blob.size < 10) { console.warn("[VOICE] empty blob", blob?.size); return; }
    const mimeType = blob.type || "audio/mp4";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "webm";
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

  // Универсальная загрузка: малые файлы (<3.5MB) — за один запрос, большие — chunks
  const CHUNK_SIZE = 3_500_000; // 3.5MB в байтах → base64 ≈ 4.7MB < лимит Lambda 6MB

  const uploadMedia = async (blob: Blob, mimeType: string, msgType: string, text: string, filename: string) => {
    const chatId = chat.id;
    const baseMime = mimeType.split(";")[0].trim();

    if (blob.size <= CHUNK_SIZE) {
      // Маленький файл — один запрос
      const base64 = await blobToBase64(blob);
      const res = await chatsApi.uploadMedia(chatId, base64, baseMime, msgType, text, filename);
      if (!res?.ok) throw new Error(res?.error || "upload failed");
      return res.message;
    }

    // Большой файл — разбиваем на chunks
    const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);
      const chunkBlob = blob.slice(start, end);
      const chunkB64 = await blobToBase64(chunkBlob);
      const isLast = i === totalChunks - 1;

      const res = await chatsApi.uploadChunk({
        upload_id: uploadId,
        chunk_idx: i,
        is_last: isLast,
        data: chunkB64,
        total_chunks: totalChunks,
        ...(isLast ? {
          chat_id: chatId,
          mime_type: baseMime,
          msg_type: msgType,
          filename,
          text,
        } : {}),
      });

      if (!res?.ok) throw new Error(res?.error || `chunk ${i} failed`);
      if (isLast) return res.message;
    }
    throw new Error("upload incomplete");
  };

  const sendVideoNote = async (blob: Blob, duration: number) => {
    if (!blob || blob.size < 100) { setShowVideoNote(false); return; }
    const rawMime = blob.type || "video/webm";
    const mimeType = rawMime.split(";")[0].trim();
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    console.log("[VIDEO NOTE] blob.type:", blob.type, "→ mimeType:", mimeType, "ext:", ext, "size:", blob.size);
    try {
      const msg = await uploadMedia(blob, mimeType, "video_note", `⭕ Видеосообщение ${duration}с`, `note.${ext}`);
      setMessages(m => [...m, { ...msg, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    } catch (e) { console.error("[VIDEO NOTE] upload error:", e); }
    setShowVideoNote(false);
  };

  const sendFile = async (file: File, msgType = "file") => {
    setShowAttachMenu(false);
    let type = msgType;
    if (msgType === "file") {
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";
    }
    const prefix = type === "image" ? "📷" : type === "video" ? "🎬" : type === "audio" ? "🎵" : "📎";
    const mimeType = file.type || "application/octet-stream";
    try {
      const msg = await uploadMedia(file, mimeType, type, `${prefix} ${file.name}`, file.name);
      setMessages(m => [...m, { ...msg, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username }]);
    } catch (err) { console.error("sendFile error:", err); }
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

  const openCtxMenu = (e: React.MouseEvent | React.TouchEvent, m: Message) => {
    e.preventDefault();
    const x = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const y = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    setCtxMenu({ msgId: m.id, x, y, out: m.out, text: m.text, type: m.type });
  };

  const handleReaction = async (msgId: number, emoji: string) => {
    const res = await chatsApi.toggleReaction(msgId, emoji);
    if (res.ok) {
      setReactions(prev => ({ ...prev, [String(msgId)]: res.reactions }));
    }
  };

  useEffect(() => {
    if (showStickerPanel) {
      chatsApi.getMyPacks().then(res => {
        if (res.ok) setStickerPacks(res.packs);
      });
    }
  }, [showStickerPanel]);


  const renderMessage = (m: Message) => {
    if (!m || !m.id) return null;
    try { return renderMessageInner(m); } catch (_e) { return null; }
  };

  const renderMessageInner = (m: Message) => {
    const isVoice = m.type === "voice";
    const isVideoNote = m.type === "video_note";
    const isImage = m.type === "image";
    const isVideo = m.type === "video";
    const isFile = m.type === "file";
    const isAudio = m.type === "audio";
    const isLocation = m.type === "location";
    const isSticker = m.type === "sticker";
    const hasMedia = m.media_url;

    const ctxHandlers = {
      onContextMenu: (e: React.MouseEvent) => openCtxMenu(e, m),
      onTouchStart: (e: React.TouchEvent) => { longPressTimer.current = setTimeout(() => openCtxMenu(e, m), 500); },
      onTouchEnd: () => clearTimeout(longPressTimer.current),
      onTouchMove: () => clearTimeout(longPressTimer.current),
    };

    const msgReactions = reactions[String(m.id)];
    const ReactionsRow = msgReactions && msgReactions.length > 0 ? (
      <div className={`flex flex-wrap gap-1 mt-1 ${m.out ? "justify-end" : "justify-start"}`}>
        {msgReactions.map(r => (
          <button key={r.emoji}
            onClick={() => handleReaction(m.id, r.emoji)}
            className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border transition-all ${r.my ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-secondary border-border text-muted-foreground hover:bg-violet-500/10"}`}>
            {r.emoji} <span>{r.count}</span>
          </button>
        ))}
      </div>
    ) : null;

    if (isVideoNote) {
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            <VideoNoteMessage m={m} />
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isSticker && hasMedia) {
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"}`} {...ctxHandlers}>
            <div className="max-w-[160px]">
              <img src={m.media_url} alt="sticker" className="w-32 h-32 object-contain" />
              <div className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                <span>{m.time}</span>
              </div>
            </div>
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isVoice) {
      const dur = m.text?.match(/(\d+)с/) ? parseInt(m.text.match(/(\d+)с/)![1]) : 0;
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            {hasMedia ? (
              <VoiceMessage
                mediaUrl={m.media_url!}
                dur={dur}
                time={m.time}
                isOut={!!m.out}
                status={m.status}
              />
            ) : (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl max-w-[260px] w-[220px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
                <div className="flex items-center gap-0.5 h-5 flex-1">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className={`w-1 rounded-full ${m.out ? "bg-white/60" : "bg-violet-300"}`}
                      style={{ height: `${30 + Math.sin(i * 1.3) * 50}%` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isImage && hasMedia) {
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            <div className="max-w-[240px]">
              <img src={m.media_url} alt="фото" className="rounded-2xl w-full object-cover max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(m.media_url, "_blank")} />
              <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                <span>{m.time}</span>
                {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300" /> : <Icon name="CheckCheck" size={10} />)}
              </div>
            </div>
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isVideo && hasMedia) {
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            <div className="max-w-[240px]">
              <video className="rounded-2xl w-full max-h-48 bg-black" controls playsInline preload="metadata">
                <source src={m.media_url} type="video/mp4" />
                <source src={m.media_url} type="video/webm" />
              </video>
              <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                <span>{m.time}</span>
                {m.out && (m.status === "read" ? <Icon name="CheckCheck" size={10} className="text-cyan-300" /> : <Icon name="CheckCheck" size={10} />)}
              </div>
            </div>
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isAudio && hasMedia) {
      const fname = m.text?.replace("🎵 ", "") || "Аудио";
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            <div className={`flex flex-col gap-2 px-3 py-2.5 rounded-2xl max-w-[280px] w-[260px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
              <div className="flex items-center gap-2">
                <Icon name="Music" size={14} className={m.out ? "text-white/70" : "text-violet-400"} />
                <span className="text-xs font-medium truncate flex-1">{fname}</span>
                <a href={m.media_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className={`flex-shrink-0 ${m.out ? "text-white/50 hover:text-white" : "text-muted-foreground hover:text-violet-500"} transition-colors`}>
                  <Icon name="Download" size={13} />
                </a>
              </div>
              <VoiceMessage mediaUrl={m.media_url!} dur={0} time={m.time} isOut={!!m.out} status={m.status} />
            </div>
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isFile) {
      const fname = m.text?.replace(/^[\u{1F4CE}\u{1F4F7}\u{1F3AC}\u{1F3B5}]\s?/u, "") || "Файл";
      const ext = fname.includes(".") ? fname.split(".").pop()?.toLowerCase() : "";
      const iconName = ext === "pdf" ? "FileText" : ext === "zip" || ext === "rar" || ext === "7z" ? "Archive" : ext === "apk" ? "Smartphone" : ext === "doc" || ext === "docx" ? "FileText" : "File";
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl max-w-[240px] ${m.out ? "vm-msg-out" : "vm-msg-in"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${m.out ? "bg-white/20" : "bg-violet-100 dark:bg-violet-900"}`}>
                <Icon name={iconName as AnyIcon} size={18} className={m.out ? "text-white" : "text-violet-500"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{fname}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {ext && <span className={`text-[10px] uppercase font-bold ${m.out ? "text-white/50" : "text-muted-foreground"}`}>{ext}</span>}
                  <button onClick={() => hasMedia && window.open(m.media_url, "_blank")}
                    className={`text-[10px] underline ${m.out ? "text-white/70" : "text-violet-500"}`}>
                    Скачать
                  </button>
                </div>
              </div>
            </div>
          </div>
          {ReactionsRow}
        </div>
      );
    }

    if (isLocation) {
      let loc = { lat: 0, lon: 0, address: "" };
      try { loc = JSON.parse(m.text || "{}"); } catch (e) { void e; }
      return (
        <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
          <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
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
          {ReactionsRow}
        </div>
      );
    }

    return (
      <div className={`flex flex-col ${m.out ? "items-end" : "items-start"} animate-fade-in`}>
        <div className={`flex ${m.out ? "justify-end" : "justify-start"} w-full`} {...ctxHandlers}>
          <div className={`max-w-[72%] px-4 py-2.5 text-sm ${m.out ? "vm-msg-out" : "vm-msg-in dark:text-white text-gray-800"}`}>
            {!m.out && (chat.type === "group" || chat.type === "channel") && m.sender_name && (
              <div className="text-xs font-semibold mb-1" style={{ color: m.sender_color || "#8b5cf6" }}>{m.sender_name}</div>
            )}
            <p className="leading-relaxed whitespace-pre-wrap">{editingMsgId === m.id ? <span className="opacity-50 italic">{m.text}</span> : m.text}</p>
            <div className={`flex items-center justify-end gap-1 mt-1 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
              {m.edited && <span className="text-[10px] opacity-60">изменено</span>}
              <span className="text-[10px]">{m.time}</span>
              {m.out && (
                m.status === "read" ? <Icon name="CheckCheck" size={12} className="text-cyan-300" /> :
                m.status === "delivered" ? <Icon name="CheckCheck" size={12} /> :
                <Icon name="Check" size={12} />
              )}
            </div>
          </div>
        </div>
        {ReactionsRow}
      </div>
    );
  };

  const chatStatus = chat.user_status || (chat.online ? "online" : "offline");

  return (
    <div className="flex flex-col h-full animate-scale-in">
      {showCall && chat.partner_id && <CallModal chat={chat} calleeId={chat.partner_id} type={showCall} onClose={() => setShowCall(null)} />}
      {showVideoNote && <VideoNoteRecorder onSend={sendVideoNote} onCancel={() => setShowVideoNote(false)} />}
      {showChatSettings && <ChatSettingsModal chat={chat} onClose={() => setShowChatSettings(false)} onUpdated={c => { Object.assign(chat, c); setShowChatSettings(false); }} />}
      {showChatProfile && <ChatProfileModal chat={chat} me={me} onClose={() => setShowChatProfile(false)} onOpenSettings={() => setShowChatSettings(true)} />}

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

      {/* Context Menu */}
      {ctxMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setCtxMenu(null)}
        >
          <div
            className="absolute bg-card rounded-2xl shadow-2xl border border-border p-1 min-w-[180px] animate-scale-in z-50"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top: Math.min(ctxMenu.y, window.innerHeight - 200)
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Quick reactions row */}
            <div className="flex gap-1 px-2 py-2 border-b border-border">
              {["👍","❤️","😂","😮","😢","🔥"].map(emoji => (
                <button key={emoji}
                  onClick={async () => {
                    await handleReaction(ctxMenu.msgId, emoji);
                    setCtxMenu(null);
                  }}
                  className="text-xl hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary">
                  {emoji}
                </button>
              ))}
            </div>
            {/* Copy */}
            {ctxMenu.text && (
              <button onClick={() => { navigator.clipboard?.writeText(ctxMenu.text!); setCtxMenu(null); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm transition-colors">
                <Icon name="Copy" size={16} className="text-muted-foreground" />
                Копировать
              </button>
            )}
            {/* Edit (own text messages only, ≤15 min) */}
            {ctxMenu.out && (ctxMenu.type === "text" || ctxMenu.type === "reply") && (
              <button onClick={() => {
                setInput(ctxMenu.text || "");
                setEditingMsgId(ctxMenu.msgId);
                setCtxMenu(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm transition-colors">
                <Icon name="Pencil" size={16} className="text-violet-400" />
                Редактировать
              </button>
            )}
            {/* Delete (own messages only) */}
            {ctxMenu.out && (
              <button onClick={async () => {
                const res = await chatsApi.deleteMessage(ctxMenu.msgId);
                if (res.ok) setMessages(prev => prev.filter(m => m.id !== ctxMenu.msgId));
                setCtxMenu(null);
              }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 text-sm transition-colors">
                <Icon name="Trash2" size={16} />
                Удалить
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 flex-shrink-0 safe-area-top">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <button onClick={() => {
          if (chat.type === "private" && chat.username) {
            onOpenProfile({ id: 0, username: chat.username, display_name: chat.name, avatar_color: chat.avatar_color, online: chat.online, status: chatStatus as "online"|"offline"|"inactive", avatar_url: chat.avatar_url });
          } else if (chat.type !== "private") {
            setShowChatProfile(true);
          }
        }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Avatar label={chat.name} color={chat.avatar_color} status={chatStatus} src={chat.avatar_url || undefined} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate flex items-center gap-1">
              {chat.name}
              {chat.type === "private" && e2eeAvailable() && (
                <Icon name="Lock" size={11} className="text-emerald-500 flex-shrink-0" title="E2EE шифрование" />
              )}
            </div>
            <div className={`text-xs ${chatStatus === "online" ? "text-emerald-500" : "text-muted-foreground"}`}>
              {chat.type === "group" ? `группа · ${chat.members_count ?? ""} уч.` : chat.type === "channel" ? `канал · ${chat.members_count ?? ""} подп.` : statusLabel(chatStatus)}
            </div>
          </div>
        </button>
        {chat.type !== "private" && (
          <>
            <button onClick={() => setShowChatSettings(true)} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground" title="Настройки">
              <Icon name="Settings" size={18} />
            </button>
            <button onClick={loadInvite} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground" title="Ссылка-приглашение">
              <Icon name="Link" size={18} />
            </button>
          </>
        )}
        {/* Звонки временно скрыты */}
        {/* Chat menu */}
        <div className="relative">
          <button onClick={() => setShowChatMenu(v => !v)} className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            <Icon name="MoreVertical" size={18} />
          </button>
          {showChatMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card rounded-2xl shadow-2xl border border-border p-1 z-50 min-w-[180px] animate-scale-in">
              {chat.type === "private" && chat.username && (
                <button onClick={() => {
                  setShowChatMenu(false);
                  onOpenProfile({ id: 0, username: chat.username!, display_name: chat.name, avatar_color: chat.avatar_color, online: chat.online, status: (chat.user_status || "offline") as "online"|"offline"|"inactive", avatar_url: chat.avatar_url });
                }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm transition-colors">
                  <Icon name="User" size={16} className="text-muted-foreground" />
                  Профиль
                </button>
              )}
              <button onClick={async () => {
                setShowChatMenu(false);
                if (!confirm("Очистить историю чата?")) return;
                const res = await chatsApi.clearHistory(chat.id);
                if (res.ok) setMessages([]);
              }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary text-sm transition-colors">
                <Icon name="Eraser" size={16} className="text-muted-foreground" />
                Очистить историю
              </button>
              <div className="border-t border-border my-1" />
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
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto vm-scrollbar vm-chat-bg px-4 py-4 space-y-2 relative"
        onScroll={e => {
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          isAtBottomRef.current = distFromBottom < 80;
          setShowScrollDown(distFromBottom > 200);
        }}
      >
        <div className="flex items-center justify-center my-3">
          <span className="bg-black/10 dark:bg-white/10 backdrop-blur-md text-xs px-3 py-1 rounded-full text-foreground/60">Сегодня</span>
        </div>
        {loading && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Icon name="Loader" size={20} className="animate-spin" />
          </div>
        )}
        <ErrorBoundary fallback={<div className="text-center text-xs text-muted-foreground py-4">Ошибка отображения сообщений. <button onClick={() => window.location.reload()} className="underline">Обновить</button></div>}>
          {messages.filter(m => m?.id).map((m, i) => (
            <div key={m.id} style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
              {renderMessage(m)}
            </div>
          ))}
        </ErrorBoundary>
        <div ref={bottomRef} />
      </div>
      {showScrollDown && (
        <button
          onClick={() => { isAtBottomRef.current = true; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setShowScrollDown(false); }}
          className="absolute bottom-20 right-4 z-10 w-9 h-9 rounded-full vm-glass border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="ChevronDown" size={18} />
        </button>
      )}

      {/* Input */}
      <div className="vm-glass border-t px-2 py-2 flex-shrink-0" style={{ paddingBottom: kbOffset ? `${kbOffset + 8}px` : undefined }}>
        {(() => {
          const canWrite = chat.type === "private" || (chat.members_can_write ?? true) || chat.my_role === "owner" || chat.my_role === "admin";
          if (!canWrite) return (
            <div className="flex items-center justify-center py-3 text-sm text-muted-foreground gap-2">
              <Icon name="Lock" size={16} />
              {chat.type === "channel" ? "Только администраторы могут писать в этот канал" : "Запись в группу ограничена"}
            </div>
          );
          if (recording) return <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />;
          return (
          <div className="flex items-center gap-1 w-full relative">
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

            {/* Sticker button */}
            <div className="relative flex-shrink-0">
              <button onClick={() => { setShowStickerPanel(v => !v); setShowEmoji(false); setShowAttachMenu(false); }}
                className={`w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors ${showStickerPanel ? "text-violet-500" : "text-muted-foreground"}`}>
                <Icon name="Sticker" fallback="Smile" size={18} />
              </button>
              {showStickerPanel && (
                <div className="absolute bottom-full left-0 mb-2 bg-card rounded-2xl shadow-2xl border border-border z-50 animate-scale-in w-72">
                  <div className="p-3 border-b border-border">
                    <p className="text-sm font-semibold">Стикеры</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    {stickerPacks.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-4">Нет стикеров.<br/>Добавь паки в настройках.</p>
                    ) : (
                      stickerPacks.map(pack => (
                        <div key={pack.id} className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1 px-1">{pack.name}</p>
                          <div className="grid grid-cols-4 gap-1">
                            {pack.stickers?.map(s => (
                              <button key={s.id} onClick={async () => {
                                const res = await chatsApi.sendSticker(chat.id, s.id);
                                if (res.ok) setMessages(prev => [...prev, {...res.message, sender_id: me.id, sender_name: me.display_name, sender_color: me.avatar_color, sender_username: me.username}]);
                                setShowStickerPanel(false);
                              }} className="w-16 h-16 rounded-xl hover:bg-secondary transition-colors flex items-center justify-center overflow-hidden">
                                <img src={s.image_url} alt={s.emoji} className="w-14 h-14 object-contain" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {editingMsgId && (
              <div className="absolute bottom-full left-0 right-0 px-4 pb-1">
                <div className="flex items-center gap-2 bg-violet-100 dark:bg-violet-900/40 rounded-xl px-3 py-1.5 text-xs text-violet-600 dark:text-violet-300">
                  <Icon name="Pencil" size={12} />
                  <span className="flex-1">Редактирование сообщения</span>
                  <button onClick={() => { setEditingMsgId(null); setInput(""); }} className="text-violet-400 hover:text-violet-600">
                    <Icon name="X" size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 bg-secondary rounded-2xl px-3 py-2 flex items-center min-h-[38px]">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={editingMsgId ? "Редактировать..." : "Написать..."}
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
          );
        })()}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "image")} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "video")} />
        <input ref={docInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && sendFile(e.target.files[0], "file")} />
      </div>

      {(showAttachMenu || showEmoji || showStickerPanel) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowAttachMenu(false); setShowEmoji(false); setShowStickerPanel(false); }} />
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
  const incomingCallRef = useRef(incomingCall);
  const activeCallRef = useRef(activeCall);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => {
    if (!me) return;
    const poll = setInterval(async () => {
      if (incomingCallRef.current || activeCallRef.current) return;
      const res = await callsApi.getIncoming();
      if (res.ok && res.call) {
        const callId = res.call.id;
        if (seenCallIds.current.has(callId)) return;
        seenCallIds.current.add(callId);
        setIncomingCall(res.call);
        try {
          const ctx = new AudioContext();
          ctx.resume().then(() => {
            const ring = () => {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.connect(g); g.connect(ctx.destination);
              osc.frequency.value = 440; osc.type = "sine";
              g.gain.setValueAtTime(0.3, ctx.currentTime);
              g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
            };
            ring(); setTimeout(ring, 800); setTimeout(ring, 1600);
          }).catch(() => {});
        } catch (_e) { void _e; }
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [me]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
    });
    if (getToken() && !me) {
      authApi.me().then(res => {
        if (res.ok) { saveSession(getToken()!, res.user); setMe(res.user); }
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
  const isChatOpen = !!openChat;

  const openProfile = (user: User) => setProfileUser(user);

  const handleOpenChat = (c: Chat) => { setOpenChat(c); setActiveTab("chats"); };

  const leftPanel: Record<string, React.ReactNode> = {
    chats: <ChatList chats={chats} loading={chatsLoading} onOpen={handleOpenChat} onNew={() => setShowNewChat(true)} />,
    contacts: <ContactsSection me={me} onStartChat={u => { handleStartChatWith(u); setActiveTab("chats"); }} onOpenProfile={openProfile} />,
    calls: <CallsSection />,
    profile: <ProfileSection me={me} onUpdate={u => { setMe(u); saveSession(getToken()!, u); }} onLogout={handleLogout} />,
    settings: <SettingsSection />,
  };

  return (
    <div className="flex flex-col md:flex-row overflow-hidden bg-background font-golos" style={{ height: "100dvh" }}>
      {/* Входящий звонок */}
      {incomingCall && !activeCall && (
        <IncomingCallModal
          incoming={incomingCall}
          onReject={async () => {
            await callsApi.reject(incomingCall.id);
            setIncomingCall(null);
          }}
          onAccept={async () => {
            callsApi.markAccepted(incomingCall.id);
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