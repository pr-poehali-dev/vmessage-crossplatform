const AUTH_URL = "https://functions.poehali.dev/6c45d36d-91ca-4d3e-933e-004cbe05afb6";
const CHATS_URL = "https://functions.poehali.dev/4a6b918d-c79c-42b2-83f9-e055781d4f33";
const USERS_URL = "https://functions.poehali.dev/a8c06824-42b7-4519-a9e8-f5a4093a1536";

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
}

export interface Chat {
  id: number;
  type: string;
  name: string;
  avatar_color: string;
  username?: string;
  online: boolean;
  last_msg: string;
  last_time: string;
  unread: number;
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
}

async function call(url: string, path: string, method = "GET", body?: object, token?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token ?? getToken();
  if (t) headers["X-Session-Token"] = t;

  const fullUrl = `${url}${path}`;
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Auth
export const authApi = {
  register: (username: string, display_name: string, password: string) =>
    call(AUTH_URL, "/register", "POST", { username, display_name, password }, null),

  login: (username: string, password: string) =>
    call(AUTH_URL, "/login", "POST", { username, password }, null),

  me: () => call(AUTH_URL, "/me", "GET"),

  logout: () => call(AUTH_URL, "/logout", "POST"),
};

// Chats
export const chatsApi = {
  list: () => call(CHATS_URL, "/list", "GET"),

  createPrivate: (partner_username: string) =>
    call(CHATS_URL, "/create", "POST", { type: "private", partner_username }),

  createGroup: (name: string) =>
    call(CHATS_URL, "/create", "POST", { type: "group", name }),

  messages: (chat_id: number) =>
    call(CHATS_URL, `/messages?chat_id=${chat_id}`, "GET"),

  send: (chat_id: number, text: string) =>
    call(CHATS_URL, "/send", "POST", { chat_id, text }),
};

// Users
export const usersApi = {
  search: (q: string) => call(USERS_URL, `/search?q=${encodeURIComponent(q)}`, "GET"),

  contacts: () => call(USERS_URL, "/contacts", "GET"),

  update: (data: { display_name?: string; bio?: string }) =>
    call(USERS_URL, "/update", "POST", data),
};
