const AUTH_URL = "https://functions.poehali.dev/6c45d36d-91ca-4d3e-933e-004cbe05afb6";
const CHATS_URL = "https://functions.poehali.dev/4a6b918d-c79c-42b2-83f9-e055781d4f33";
const USERS_URL = "https://functions.poehali.dev/a8c06824-42b7-4519-a9e8-f5a4093a1536";
const CALLS_URL = "https://functions.poehali.dev/d640259f-2a22-4683-92cd-bf19816867ac";

export const TOKEN_KEY = "vm_token";
export const USER_KEY = "vm_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const s = localStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_color: string;
  bio?: string;
  online?: boolean;
  avatar_url?: string;
  status?: "online" | "offline" | "inactive";
}

export interface Chat {
  id: number;
  type: string;
  name: string;
  avatar_color: string;
  username?: string;
  partner_id?: number;
  online: boolean;
  user_status?: "online" | "offline" | "inactive";
  avatar_url?: string;
  last_msg: string;
  last_time: string;
  unread: number;
  is_public?: boolean;
  invite_code?: string;
  partner_last_seen?: string;
}

export interface Message {
  id: number;
  text: string;
  type: string;
  status: string;
  time: string;
  sender_id: number;
  sender_name: string;
  sender_color: string;
  sender_username: string;
  out: boolean;
  media_url?: string;
}

async function call(baseUrl: string, action: string, method = "GET", body?: object, token?: string | null, extraQuery?: Record<string, string>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token ?? getToken();
  if (t) headers["X-Session-Token"] = t;

  const qs = new URLSearchParams({ action, ...(extraQuery || {}) }).toString();
  const url = `${baseUrl}?${qs}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Auth
export const authApi = {
  register: (username: string, display_name: string, password: string) =>
    call(AUTH_URL, "register", "POST", { username, display_name, password }, null),

  login: (username: string, password: string) =>
    call(AUTH_URL, "login", "POST", { username, password }, null),

  me: () => call(AUTH_URL, "me", "GET"),

  logout: () => call(AUTH_URL, "logout", "POST"),
};

// Chats
export const chatsApi = {
  list: () => call(CHATS_URL, "list", "GET"),

  createPrivate: (partner_username: string) =>
    call(CHATS_URL, "create", "POST", { type: "private", partner_username }),

  createGroup: (name: string, is_public = false) =>
    call(CHATS_URL, "create", "POST", { type: "group", name, is_public }),

  createChannel: (name: string, description: string, is_public = false) =>
    call(CHATS_URL, "create", "POST", { type: "channel", name, description, is_public }),

  messages: (chat_id: number) =>
    call(CHATS_URL, "messages", "GET", undefined, undefined, { chat_id: String(chat_id) }),

  send: (chat_id: number, text: string) =>
    call(CHATS_URL, "send", "POST", { chat_id, text }),

  sendMedia: (chat_id: number, data: string, mime_type: string, msg_type: string, text: string) =>
    call(CHATS_URL, "send_media", "POST", { chat_id, data, mime_type, msg_type, text }),

  sendLocation: (chat_id: number, lat: number, lon: number, address: string) =>
    call(CHATS_URL, "send_location", "POST", { chat_id, lat, lon, address }),

  searchPublic: (q: string) =>
    call(CHATS_URL, "search_public", "GET", undefined, undefined, { q }),

  joinByInvite: (invite_code: string) =>
    call(CHATS_URL, "join_by_invite", "POST", { invite_code }),

  getInvite: (chat_id: number) =>
    call(CHATS_URL, "get_invite", "GET", undefined, undefined, { chat_id: String(chat_id) }),

  setPublic: (chat_id: number, is_public: boolean) =>
    call(CHATS_URL, "set_public", "POST", { chat_id, is_public }),

  addMember: (chat_id: number, username: string) =>
    call(CHATS_URL, "add_member", "POST", { chat_id, username }),

  deleteChat: (chat_id: number) =>
    call(CHATS_URL, "delete_chat", "POST", { chat_id }),
};

// Users
export const usersApi = {
  search: (q: string) =>
    call(USERS_URL, "search", "GET", undefined, undefined, { q }),

  contacts: () => call(USERS_URL, "contacts", "GET"),

  addContact: (contact_id: number) =>
    call(USERS_URL, "add_contact", "POST", { contact_id }),

  removeContact: (contact_id: number) =>
    call(USERS_URL, "remove_contact", "POST", { contact_id }),

  update: (data: { display_name?: string; bio?: string; avatar_color?: string }) =>
    call(USERS_URL, "update", "POST", data),

  updateAvatar: (data: string, mime_type: string) =>
    call(USERS_URL, "update_avatar", "POST", { data, mime_type }),

  removeAvatar: () =>
    call(USERS_URL, "remove_avatar", "POST", {}),

  blockUser: (user_id: number) =>
    call(USERS_URL, "block", "POST", { user_id }),

  unblockUser: (user_id: number) =>
    call(USERS_URL, "unblock", "POST", { user_id }),

  checkBlocked: (target_id: number) =>
    call(USERS_URL, "check_blocked", "GET", undefined, undefined, { target_id: String(target_id) }),

  setStatus: (online: boolean) =>
    call(USERS_URL, "set_status", "POST", { online }),
};

// Calls (WebRTC signaling)
export const callsApi = {
  initiate: (callee_id: number, call_type: "audio" | "video") =>
    call(CALLS_URL, "initiate", "POST", { callee_id, call_type }),

  getIncoming: () => call(CALLS_URL, "get_incoming", "GET"),

  sendOffer: (call_id: number, offer: string) =>
    call(CALLS_URL, "send_offer", "POST", { call_id, offer }),

  getOffer: (call_id: number) =>
    call(CALLS_URL, "get_offer", "GET", undefined, undefined, { call_id: String(call_id) }),

  accept: (call_id: number, answer: string) =>
    call(CALLS_URL, "accept", "POST", { call_id, answer }),

  sendAnswer: (call_id: number, answer: string) =>
    call(CALLS_URL, "send_answer", "POST", { call_id, answer }),

  getAnswer: (call_id: number) =>
    call(CALLS_URL, "get_answer", "GET", undefined, undefined, { call_id: String(call_id) }),

  addIce: (call_id: number, candidate: string, role: "caller" | "callee") =>
    call(CALLS_URL, "add_ice", "POST", { call_id, candidate, role }),

  getIce: (call_id: number, role: "caller" | "callee") =>
    call(CALLS_URL, "get_ice", "GET", undefined, undefined, { call_id: String(call_id), role }),

  reject: (call_id: number) =>
    call(CALLS_URL, "reject", "POST", { call_id }),

  end: (call_id: number) =>
    call(CALLS_URL, "end", "POST", { call_id }),

  getStatus: (call_id: number) =>
    call(CALLS_URL, "get_status", "GET", undefined, undefined, { call_id: String(call_id) }),
};