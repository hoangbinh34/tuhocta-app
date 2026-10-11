// Gọi máy chủ Apps Script. Gửi JSON dạng text/plain để trình duyệt không cần hỏi trước (CORS preflight).
import { API_URL } from '../config.js';

const AUTH_KEY = 'tuhocta.auth';

// Khi thử trên máy có thể trỏ sang máy chủ giả: localStorage 'tuhocta.apiUrl'.
export function apiUrl() {
  try { return localStorage.getItem('tuhocta.apiUrl') || API_URL; } catch { return API_URL; }
}

export const hasServer = () => !!apiUrl();

export function token(role) {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || '{}')[role] || null; } catch { return null; }
}

export function setToken(role, value) {
  try {
    const all = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    if (value) all[role] = value; else delete all[role];
    localStorage.setItem(AUTH_KEY, JSON.stringify(all));
  } catch { /* bỏ qua */ }
}

export async function call(action, body = {}) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw Object.assign(new Error(`Máy chủ lỗi ${res.status}`), { code: 'http' });
  const json = await res.json();
  if (!json.ok) {
    if (['bad_token', 'token_expired', 'no_token'].includes(json.error)) setToken(body.role || roleOf(body.token), null);
    throw Object.assign(new Error(json.error || 'error'), { code: json.error });
  }
  return json;
}

const roleOf = (t) => String(t || '').split('.')[0] || 'student';

export async function login(role, secret) {
  const r = await call('login', { role, secret });
  setToken(role, r.token);
  return r;
}
