import { useState } from "react";
import Icon from "@/components/ui/icon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = any;

// ─── Data ──────────────────────────────────────────────────────────────────

const chats = [
  { id: 1, name: "Алиса Смирнова", avatar: "А", color: "#8B5CF6", msg: "Привет! Как дела? 😊", time: "14:32", unread: 3, online: true },
  { id: 2, name: "Команда дизайна", avatar: "🎨", color: "#EC4899", msg: "Макеты готовы, проверяйте!", time: "13:15", unread: 0, online: false, isGroup: true },
  { id: 3, name: "Максим Орлов", avatar: "М", color: "#3B82F6", msg: "Окей, встретимся в 18:00", time: "12:58", unread: 1, online: true },
  { id: 4, name: "Dev Team", avatar: "💻", color: "#06B6D4", msg: "Deploy прошёл успешно ✅", time: "11:40", unread: 0, online: false, isGroup: true },
  { id: 5, name: "Елена Волкова", avatar: "Е", color: "#F59E0B", msg: "Спасибо за помощь!", time: "10:20", unread: 0, online: false },
  { id: 6, name: "Андрей Петров", avatar: "А", color: "#10B981", msg: "Посмотри документ", time: "Вчера", unread: 0, online: true },
];

const messages = [
  { id: 1, text: "Привет! Как дела?", out: false, time: "14:28", status: "" },
  { id: 2, text: "Отлично! Работаю над новым проектом 🚀", out: true, time: "14:29", status: "read" },
  { id: 3, text: "Ого, расскажи подробнее! Что за проект?", out: false, time: "14:30", status: "" },
  { id: 4, text: "Это мессенджер нового поколения. Уже почти готово!", out: true, time: "14:31", status: "read" },
  { id: 5, text: "Звучит интересно! Когда покажешь?", out: false, time: "14:32", status: "" },
  { id: 6, text: "Уже сейчас 😄 Вот он — V-message!", out: true, time: "14:32", status: "delivered" },
];

const contacts = [
  { id: 1, name: "Алиса Смирнова", username: "@alice_s", avatar: "А", color: "#8B5CF6", online: true, mutual: 12 },
  { id: 2, name: "Андрей Петров", username: "@andrey_p", avatar: "А", color: "#10B981", online: true, mutual: 8 },
  { id: 3, name: "Елена Волкова", username: "@elena_v", avatar: "Е", color: "#F59E0B", online: false, mutual: 5 },
  { id: 4, name: "Максим Орлов", username: "@max_orl", avatar: "М", color: "#3B82F6", online: true, mutual: 21 },
  { id: 5, name: "Sophia Lee", username: "@sophia_l", avatar: "S", color: "#EC4899", online: false, mutual: 3 },
  { id: 6, name: "Игорь Кузнецов", username: "@igor_k", avatar: "И", color: "#06B6D4", online: false, mutual: 9 },
];

const channels = [
  { id: 1, name: "Tech News", icon: "📡", members: "124K", desc: "Главные новости мира технологий", verified: true },
  { id: 2, name: "Design Daily", icon: "🎨", members: "89K", desc: "Дизайн, UI/UX, вдохновение каждый день", verified: true },
  { id: 3, name: "Startup Life", icon: "🚀", members: "45K", desc: "Истории основателей стартапов", verified: false },
  { id: 4, name: "AI Digest", icon: "🤖", members: "201K", desc: "Всё об искусственном интеллекте", verified: true },
  { id: 5, name: "Music Vibes", icon: "🎵", members: "33K", desc: "Новые треки и плейлисты", verified: false },
];

const callsList = [
  { id: 1, name: "Алиса Смирнова", avatar: "А", color: "#8B5CF6", type: "video", dir: "in", time: "14:10", duration: "12:34", missed: false },
  { id: 2, name: "Максим Орлов", avatar: "М", color: "#3B82F6", type: "audio", dir: "out", time: "11:05", duration: "5:21", missed: false },
  { id: 3, name: "Елена Волкова", avatar: "Е", color: "#F59E0B", type: "audio", dir: "in", time: "20:33", duration: "", missed: true },
  { id: 4, name: "Dev Team", avatar: "💻", color: "#06B6D4", type: "video", dir: "in", time: "15:00", duration: "48:12", missed: false },
  { id: 5, name: "Андрей Петров", avatar: "А", color: "#10B981", type: "audio", dir: "out", time: "12:15", duration: "2:15", missed: false },
];

const navItems = [
  { id: "chats", label: "Чаты", icon: "MessageCircle" },
  { id: "contacts", label: "Контакты", icon: "Users" },
  { id: "channels", label: "Каналы", icon: "Rss" },
  { id: "calls", label: "Звонки", icon: "Phone" },
  { id: "profile", label: "Профиль", icon: "User" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function Avatar({ label, color, size = 42, online }: { label: string; color: string; size?: number; online?: boolean }) {
  const isEmoji = /\p{Emoji}/u.test(label) && label.length <= 2;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex items-center justify-center rounded-full font-semibold text-white select-none"
        style={{
          width: size, height: size,
          background: isEmoji ? `${color}22` : color,
          fontSize: isEmoji ? size * 0.5 : size * 0.38,
        }}
      >
        {label}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-background ${online ? "bg-emerald-400" : "bg-gray-300"}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}

function WaveAnimation() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="wave-bar rounded-full bg-violet-400" style={{ width: 3, height: 14 }} />
      ))}
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────

function ChatList({ onOpen }: { onOpen: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const filtered = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Чаты</h2>
          <button className="p-2 rounded-xl vm-gradient-bg text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30">
            <Icon name="Plus" size={16} />
          </button>
        </div>
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск чатов..."
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all"
          />
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-0.5">
        {filtered.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 animate-fade-in stagger-${Math.min(i + 1, 5)}`}
          >
            <Avatar label={c.avatar} color={c.color} online={c.online} />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{c.time}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground truncate">{c.msg}</span>
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

function ChatView({ chat, onBack }: { chat: typeof chats[0]; onBack: () => void }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState(messages);

  const send = () => {
    if (!input.trim()) return;
    setMsgs(m => [...m, {
      id: Date.now(), text: input, out: true,
      time: new Date().toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
    }]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full animate-scale-in">
      {/* Header */}
      <div className="vm-glass border-b flex items-center gap-3 px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="md:hidden p-2 rounded-xl hover:bg-secondary transition-colors">
          <Icon name="ChevronLeft" size={20} />
        </button>
        <Avatar label={chat.avatar} color={chat.color} online={chat.online} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{chat.name}</div>
          <div className={`text-xs ${chat.online ? "text-emerald-500" : "text-muted-foreground"}`}>
            {chat.online ? "в сети" : "был(а) недавно"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
            <Icon name="Phone" size={18} />
          </button>
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
            <Icon name="Video" size={18} />
          </button>
          <button className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-violet-500">
            <Icon name="MoreVertical" size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto vm-scrollbar vm-chat-bg px-4 py-4 space-y-2">
        <div className="flex items-center justify-center my-3">
          <span className="bg-black/10 dark:bg-white/10 backdrop-blur-md text-xs px-3 py-1 rounded-full text-foreground/60">
            Сегодня
          </span>
        </div>
        {msgs.map((m, i) => (
          <div key={m.id} className={`flex ${m.out ? "justify-end" : "justify-start"} animate-fade-in`}
            style={{ animationDelay: `${i * 0.04}s` }}>
            <div className={`max-w-[72%] px-4 py-2.5 text-sm ${m.out ? "vm-msg-out" : "vm-msg-in dark:text-white text-gray-800"}`}>
              <p className="leading-relaxed">{m.text}</p>
              <div className={`flex items-center justify-end gap-1 mt-1 ${m.out ? "text-white/60" : "text-muted-foreground"}`}>
                <span className="text-[10px]">{m.time}</span>
                {m.out && (
                  m.status === "read"
                    ? <Icon name="CheckCheck" size={12} className="text-cyan-300" />
                    : m.status === "delivered"
                    ? <Icon name="CheckCheck" size={12} />
                    : <Icon name="Check" size={12} />
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Voice message */}
        <div className="flex justify-start">
          <div className="vm-msg-in dark:text-white text-gray-800 px-4 py-3 flex items-center gap-3 max-w-[60%]">
            <button className="w-8 h-8 vm-gradient-bg rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="Play" size={14} className="text-white ml-0.5" />
            </button>
            <WaveAnimation />
            <span className="text-xs text-muted-foreground">0:12</span>
          </div>
        </div>
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
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Написать сообщение..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
        <button
          onClick={send}
          className="p-2.5 rounded-xl vm-gradient-bg text-white flex-shrink-0 hover:opacity-90 transition-opacity active:scale-95 shadow-lg shadow-violet-500/30"
        >
          {input.trim() ? <Icon name="Send" size={18} /> : <Icon name="Mic" size={18} />}
        </button>
      </div>
    </div>
  );
}

function ContactsSection() {
  const [search, setSearch] = useState("");
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.username.includes(search.toLowerCase())
  );
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Контакты</h2>
          <button className="p-2 rounded-xl vm-gradient-bg text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30">
            <Icon name="UserPlus" size={16} />
          </button>
        </div>
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск контактов..."
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all"
          />
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-0.5">
        {filtered.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
          >
            <Avatar label={c.avatar} color={c.color} online={c.online} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.username} · {c.mutual} общих</div>
            </div>
            <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-violet-500 transition-colors">
              <Icon name="MessageCircle" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelsSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Каналы</h2>
          <button className="p-2 rounded-xl vm-gradient-bg text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30">
            <Icon name="Plus" size={16} />
          </button>
        </div>
        <div className="relative">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Поиск каналов..."
            className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all"
          />
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-2 pb-4">
        <div className="mx-1 my-2 rounded-2xl p-4 vm-gradient-bg text-white animate-fade-in shadow-lg shadow-violet-500/30">
          <div className="font-bold text-sm mb-1">Рекомендуемые каналы</div>
          <div className="text-xs opacity-80">Найдите интересный контент по вашим темам</div>
        </div>
        {channels.map((ch, i) => (
          <div
            key={ch.id}
            className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
          >
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
              {ch.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm">{ch.name}</span>
                {ch.verified && <Icon name="BadgeCheck" size={14} className="text-violet-500 flex-shrink-0" />}
              </div>
              <div className="text-xs text-muted-foreground truncate">{ch.desc}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Icon name="Users" size={11} /> {ch.members} подписчиков
              </div>
            </div>
            <button className="px-3 py-1.5 rounded-xl border border-violet-400 text-violet-500 text-xs font-medium hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors flex-shrink-0">
              Читать
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CallsSection() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Звонки</h2>
          <button className="p-2 rounded-xl vm-gradient-bg text-white hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/30">
            <Icon name="PhoneCall" size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto vm-scrollbar flex-1 px-2 space-y-0.5">
        {callsList.map((c, i) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 p-3 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 cursor-pointer animate-fade-in stagger-${Math.min(i + 1, 5)}`}
          >
            <Avatar label={c.avatar} color={c.color} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{c.name}</div>
              <div className={`text-xs flex items-center gap-1 mt-0.5 ${c.missed ? "text-red-500" : "text-muted-foreground"}`}>
                <Icon name={c.dir === "in" ? "PhoneIncoming" : "PhoneOutgoing"} size={11} />
                {c.missed ? "Пропущенный" : c.dir === "in" ? "Входящий" : "Исходящий"}
                {c.duration && <span className="text-muted-foreground"> · {c.duration}</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-muted-foreground mb-1">{c.time}</div>
              <button className={`p-2 rounded-xl transition-colors ${
                c.type === "video"
                  ? "bg-violet-100 dark:bg-violet-900/30 text-violet-500"
                  : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500"
              } hover:opacity-80`}>
                <Icon name={c.type === "video" ? "Video" : "Phone"} size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSection() {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Александр Новиков");
  const [bio, setBio] = useState("🚀 Разработчик · Люблю чистый код и хороший дизайн");
  const [username, setUsername] = useState("alex_novikov");

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar">
      {/* Hero */}
      <div className="relative vm-gradient-bg pt-10 pb-16 px-6 flex-shrink-0">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 60%)" }} />
        <div className="relative flex flex-col items-center">
          <div className="relative animate-float">
            <div className="w-24 h-24 rounded-full p-0.5 shadow-2xl" style={{ background: "rgba(255,255,255,0.3)" }}>
              <div className="w-full h-full rounded-full bg-violet-600 flex items-center justify-center text-white text-4xl font-bold">А</div>
            </div>
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-violet-600 hover:scale-110 transition-transform">
              <Icon name="Camera" size={14} />
            </button>
          </div>
          <h2 className="text-white font-bold text-xl mt-3">{name}</h2>
          <p className="text-white/70 text-sm mt-1">@{username}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            <span className="text-white/80 text-xs">в сети</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mx-4 -mt-8 bg-card rounded-3xl shadow-xl p-4 grid grid-cols-3 gap-2 flex-shrink-0">
        {[["142", "Контакта"], ["38", "Чатов"], ["12", "Групп"]].map(([v, l]) => (
          <div key={l} className="text-center">
            <div className="font-bold text-xl vm-gradient-text">{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      {/* Edit */}
      <div className="mx-4 mt-4 bg-card rounded-3xl p-4 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm">Личные данные</span>
          <button
            onClick={() => setEditing(!editing)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              editing ? "vm-gradient-bg text-white shadow-lg shadow-violet-500/30" : "bg-secondary text-foreground hover:bg-violet-50 dark:hover:bg-violet-900/30"
            }`}
          >
            {editing ? "Сохранить" : "Изменить"}
          </button>
        </div>
        {[
          { label: "Имя", value: name, set: setName, icon: "User", prefix: "" },
          { label: "Имя пользователя", value: username, set: setUsername, icon: "AtSign", prefix: "@" },
          { label: "О себе", value: bio, set: setBio, icon: "FileText", prefix: "" },
        ].map(({ label, value, set, icon, prefix }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <div className="relative">
              <Icon name={icon as AnyIcon} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              {editing ? (
                <input
                  value={value}
                  onChange={e => set(e.target.value)}
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400/40 transition-all"
                />
              ) : (
                <div className="bg-secondary rounded-xl pl-9 pr-4 py-2.5 text-sm">{prefix}{value}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mx-4 mt-4 mb-4 bg-card rounded-3xl p-2 space-y-0.5 flex-shrink-0">
        {[
          { label: "Избранное", icon: "Star", color: "text-yellow-500" },
          { label: "Сохранённые сообщения", icon: "Bookmark", color: "text-violet-500" },
          { label: "Мои стикеры", icon: "Smile", color: "text-pink-500" },
        ].map(({ label, icon, color }) => (
          <button key={label} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-secondary transition-colors">
            <Icon name={icon as AnyIcon} size={18} className={color} />
            <span className="text-sm font-medium">{label}</span>
            <Icon name="ChevronRight" size={16} className="ml-auto text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition-all duration-300 flex items-center px-1 ${value ? "vm-gradient-bg" : "bg-secondary"}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function SettingsSection() {
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [sounds, setSounds] = useState(true);

  const toggleDark = () => {
    setDarkMode(v => !v);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto vm-scrollbar pb-4">
      <div className="p-4 pb-2">
        <h2 className="text-lg font-bold">Настройки</h2>
      </div>

      {[
        {
          title: "Внешний вид",
          items: [
            { label: "Тёмная тема", icon: "Moon", color: "text-indigo-500", isToggle: true, value: darkMode, onClick: toggleDark },
            { label: "Размер текста", icon: "Type", color: "text-violet-500", value: "Средний", isToggle: false, onClick: undefined },
            { label: "Цветовая схема", icon: "Palette", color: "text-pink-500", value: "Фиолетовый", isToggle: false, onClick: undefined },
          ],
        },
        {
          title: "Уведомления",
          items: [
            { label: "Push-уведомления", icon: "Bell", color: "text-orange-500", isToggle: true, value: notifications, onClick: () => setNotifications(v => !v) },
            { label: "Звуки", icon: "Volume2", color: "text-emerald-500", isToggle: true, value: sounds, onClick: () => setSounds(v => !v) },
            { label: "Вибрация", icon: "Vibrate", color: "text-blue-500", value: "Всегда", isToggle: false, onClick: undefined },
          ],
        },
        {
          title: "Конфиденциальность",
          items: [
            { label: "Номер телефона", icon: "Phone", color: "text-emerald-500", value: "Мои контакты", isToggle: false, onClick: undefined },
            { label: "Последний визит", icon: "Clock", color: "text-violet-500", value: "Все", isToggle: false, onClick: undefined },
            { label: "Аватар", icon: "Camera", color: "text-blue-500", value: "Все", isToggle: false, onClick: undefined },
            { label: "Секретные чаты (E2EE)", icon: "Lock", color: "text-yellow-500", value: "", isToggle: false, onClick: undefined },
          ],
        },
        {
          title: "Аккаунт",
          items: [
            { label: "Изменить номер", icon: "Smartphone", color: "text-violet-500", value: "", isToggle: false, onClick: undefined },
            { label: "Двухфакторная защита", icon: "Shield", color: "text-emerald-500", value: "Включено", isToggle: false, onClick: undefined },
            { label: "Активные сессии", icon: "Monitor", color: "text-blue-500", value: "3 устройства", isToggle: false, onClick: undefined },
          ],
        },
      ].map(group => (
        <div key={group.title} className="mx-4 mt-4 bg-card rounded-3xl p-2">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</div>
          {group.items.map(({ label, icon, color, isToggle, value, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-secondary transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon name={icon as AnyIcon} size={16} className={color} />
              </div>
              <span className="text-sm font-medium flex-1">{label}</span>
              {isToggle ? (
                <Toggle value={!!value} onChange={onClick!} />
              ) : value ? (
                <span className="text-xs text-muted-foreground">{value}</span>
              ) : (
                <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      ))}

      <div className="mx-4 mt-4 bg-card rounded-3xl p-2">
        <button className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Icon name="LogOut" size={16} className="text-red-500" />
          </div>
          <span className="text-sm font-medium">Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function Index() {
  const [activeTab, setActiveTab] = useState("chats");
  const [openChat, setOpenChat] = useState<typeof chats[0] | null>(null);

  const handleOpenChat = (id: number) => {
    const chat = chats.find(c => c.id === id);
    if (chat) setOpenChat(chat);
  };

  const sectionComponents: Record<string, React.ReactNode> = {
    chats: <ChatList onOpen={handleOpenChat} />,
    contacts: <ContactsSection />,
    channels: <ChannelsSection />,
    calls: <CallsSection />,
    profile: <ProfileSection />,
    settings: <SettingsSection />,
  };

  const activeNav = navItems.find(n => n.id === activeTab);

  return (
    <div className="h-screen flex overflow-hidden bg-background font-golos">
      {/* ── Sidebar Nav ── */}
      <nav className="vm-glass border-r w-16 flex flex-col items-center py-4 gap-1 z-10 flex-shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 rounded-2xl vm-gradient-bg flex items-center justify-center mb-3 shadow-lg shadow-violet-500/30 animate-float">
          <span className="text-white font-black text-lg">V</span>
        </div>

        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); setOpenChat(null); }}
            title={item.label}
            className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200
              ${activeTab === item.id
                ? "vm-gradient-bg text-white shadow-lg shadow-violet-500/30 scale-105"
                : "text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-500"
              }`}
          >
            <Icon name={item.icon as AnyIcon} size={19} />
            {item.id === "chats" && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                4
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => document.documentElement.classList.toggle("dark")}
          className="w-10 h-10 rounded-2xl text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-900/30 hover:text-violet-500 transition-all duration-200 flex items-center justify-center"
          title="Переключить тему"
        >
          <Icon name="Sun" size={18} />
        </button>
      </nav>

      {/* ── Left Panel ── */}
      <div className={`w-80 vm-glass border-r flex-shrink-0 ${openChat ? "hidden md:flex" : "flex"} flex-col`}>
        {sectionComponents[activeTab]}
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTab === "chats" && openChat ? (
          <ChatView chat={openChat} onBack={() => setOpenChat(null)} />
        ) : activeTab === "chats" ? (
          <div className="flex-1 vm-chat-bg flex flex-col items-center justify-center text-center p-8 animate-fade-in">
            <div className="w-24 h-24 rounded-3xl vm-gradient-bg flex items-center justify-center mb-6 shadow-2xl shadow-violet-500/30 animate-float">
              <span className="text-white font-black text-5xl">V</span>
            </div>
            <h2 className="text-2xl font-bold mb-2 vm-gradient-text">V-message</h2>
            <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
              Выберите чат слева, чтобы начать общение. Ваши сообщения защищены сквозным шифрованием.
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