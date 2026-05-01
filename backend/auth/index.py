"""
Аутентификация V-message.
Схема: телефон = идентификатор аккаунта, email = куда приходит OTP-код.
Действия: send_code | register | login | me | logout | sessions | logout_other |
          change_username | delete_account
"""
import json
import os
import hashlib
import secrets
import random
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import psycopg2

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
}

SCHEMA = "t_p77366720_vmessage_crossplatfo"
COLORS = ["#8B5CF6", "#EC4899", "#3B82F6", "#10B981", "#F59E0B", "#06B6D4", "#EF4444", "#6366F1"]


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()


def resp(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def detect_device(ua: str) -> str:
    ua = (ua or "").lower()
    if "iphone" in ua or "ipad" in ua: return "iPhone/iPad"
    if "android" in ua: return "Android"
    if "windows" in ua: return "Windows"
    if "mac" in ua: return "Mac"
    if "linux" in ua: return "Linux"
    return "Неизвестное устройство"


def normalize_phone(raw: str) -> str:
    digits = "".join(c for c in raw if c.isdigit())
    return "+" + digits


def validate_email(email: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email))


def send_otp_email(to_email: str, code: str, purpose: str) -> tuple:
    """Отправляет OTP на email. Возвращает (ok: bool, error: str)."""
    gmail_user = os.environ.get("GMAIL_USER", "").strip()
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")

    if not gmail_user or not gmail_pass:
        print(f"[DEV OTP] Email: {to_email}  Code: {code}  Purpose: {purpose}")
        return True, ""

    subject = "Код входа в V-message" if purpose == "login" else "Код регистрации V-message"
    action_text = "входа" if purpose == "login" else "регистрации"

    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f3ff;font-family:sans-serif">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,.12)">
  <div style="background:linear-gradient(135deg,#8B5CF6,#6366F1);padding:32px;text-align:center">
    <span style="color:#fff;font-size:48px;font-weight:900;line-height:1">V</span>
    <p style="color:#fff;font-size:20px;font-weight:700;margin:8px 0 0">V-message</p>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1e1b4b;margin:0 0 8px">Твой код {action_text}</h2>
    <p style="color:#6b7280;margin:0 0 24px;font-size:15px">Введи его в приложении. Действует <strong>10 минут</strong>.</p>
    <div style="background:#f5f3ff;border:2px solid #8B5CF6;border-radius:14px;padding:24px;text-align:center;margin-bottom:24px">
      <span style="font-size:44px;font-weight:900;letter-spacing:10px;color:#6d28d9">{code}</span>
    </div>
    <p style="color:#9ca3af;font-size:13px;margin:0">Если ты не запрашивал этот код — просто игнорируй письмо.</p>
  </div>
</div>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"V-message <{gmail_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as srv:
            srv.login(gmail_user, gmail_pass)
            srv.sendmail(gmail_user, to_email, msg.as_string())
        return True, ""
    except smtplib.SMTPAuthenticationError as e:
        print(f"[EMAIL AUTH ERROR] {e}")
        return False, "Ошибка отправки письма. Попробуйте позже."
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False, "Не удалось отправить письмо. Проверьте email адрес."


def handler(event: dict, context) -> dict:
    """Auth handler: send_code, register, login, me, logout, sessions, logout_other, change_username, delete_account"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    headers = event.get("headers") or {}
    token_header = headers.get("X-Session-Token") or headers.get("x-session-token")
    user_agent = headers.get("User-Agent") or headers.get("user-agent") or ""
    ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp") \
         or headers.get("X-Forwarded-For", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return resp(400, {"error": "Invalid JSON"})

    # ── send_code — отправить OTP на email ───────────────────────────────────
    if action == "send_code":
        email = (body.get("email") or "").strip().lower()
        phone_raw = (body.get("phone") or "").strip()
        purpose = body.get("purpose", "register")  # register | login

        if not email or not validate_email(email):
            return resp(400, {"error": "Укажите корректный email адрес"})

        conn = get_conn()
        cur = conn.cursor()

        if purpose == "register":
            # Проверяем телефон если передан
            if phone_raw:
                phone = normalize_phone(phone_raw)
                cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s", (phone,))
                if cur.fetchone():
                    cur.close(); conn.close()
                    return resp(409, {"error": "Этот номер телефона уже зарегистрирован"})
            # Проверяем email
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s", (email,))
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(409, {"error": "Этот email уже зарегистрирован"})

        if purpose == "login":
            # Проверяем что такой email существует
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s", (email,))
            if not cur.fetchone():
                cur.close(); conn.close()
                return resp(404, {"error": "Аккаунт с таким email не найден"})

        # Rate limit — 1 раз в 60 секунд
        cur.execute(
            f"SELECT created_at FROM {SCHEMA}.vm_phone_codes WHERE email=%s AND purpose=%s ORDER BY created_at DESC LIMIT 1",
            (email, purpose)
        )
        last = cur.fetchone()
        if last:
            import datetime
            diff = (datetime.datetime.now(datetime.timezone.utc) - last[0]).total_seconds()
            if diff < 60:
                cur.close(); conn.close()
                return resp(429, {"error": f"Подождите {int(60 - diff)} сек. перед повторной отправкой"})

        code = str(random.randint(100000, 999999))
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_phone_codes (email, phone, code, purpose) VALUES (%s, %s, %s, %s)",
            (email, email[:20], code, purpose)
        )
        conn.commit()
        cur.close(); conn.close()

        ok, err = send_otp_email(email, code, purpose)
        if not ok:
            return resp(500, {"error": err})

        return resp(200, {"ok": True, "message": f"Код отправлен на {email}"})

    # ── register — создать аккаунт (телефон + email + OTP) ───────────────────
    if action == "register":
        phone_raw = (body.get("phone") or "").strip()
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""
        username_raw = (body.get("username") or "").strip().lower()

        if not phone_raw:
            return resp(400, {"error": "Укажите номер телефона"})
        if not email or not validate_email(email):
            return resp(400, {"error": "Укажите корректный email"})
        if not code:
            return resp(400, {"error": "Введите код из письма"})
        if not display_name:
            return resp(400, {"error": "Укажите имя"})
        if len(password) < 6:
            return resp(400, {"error": "Пароль минимум 6 символов"})

        phone = normalize_phone(phone_raw)
        if len(phone) < 8:
            return resp(400, {"error": "Некорректный номер телефона"})

        conn = get_conn()
        cur = conn.cursor()

        # Проверяем OTP
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND code=%s AND purpose='register'
                  AND used=FALSE
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 1""",
            (email, code)
        )
        otp = cur.fetchone()
        if not otp:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или устаревший код. Запросите новый."})

        # Проверяем уникальность
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s", (phone,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот номер телефона уже зарегистрирован"})

        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s", (email,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот email уже зарегистрирован"})

        # Генерируем username
        if username_raw and len(username_raw) >= 3 and re.match(r'^[a-z0-9_]+$', username_raw):
            username = username_raw
        else:
            base = re.sub(r"[^a-z0-9]", "", display_name.lower())[:12] or "user"
            username = base + phone[-4:]

        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s", (username,))
        if cur.fetchone():
            username = username + str(random.randint(10, 99))

        color = COLORS[abs(hash(phone)) % len(COLORS)]
        token = secrets.token_hex(32)

        try:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.vm_users
                    (username, display_name, avatar_color, password_hash, session_token, phone, email, is_online)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
                    RETURNING id, username, display_name, avatar_color""",
                (username, display_name, color, hash_password(password), token, phone, email)
            )
            row = cur.fetchone()
            user_id = row[0]
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
                (user_id, token, detect_device(user_agent), ip[:50] if ip else None)
            )
            cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp[0],))
            conn.commit()
            return resp(200, {
                "ok": True, "token": token,
                "user": {"id": row[0], "username": row[1], "display_name": row[2],
                         "avatar_color": row[3], "phone": phone, "email": email}
            })
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            return resp(409, {"error": "Пользователь уже существует"})
        finally:
            cur.close(); conn.close()

    # ── login — телефон + email + OTP ─────────────────────────────────────────
    if action == "login":
        phone_raw = (body.get("phone") or "").strip()
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()

        if not phone_raw or not email or not code:
            return resp(400, {"error": "Укажите телефон, email и код"})

        phone = normalize_phone(phone_raw)
        conn = get_conn()
        cur = conn.cursor()

        # Ищем по телефону
        cur.execute(
            f"SELECT id, username, display_name, avatar_color, bio, avatar_url, phone, email FROM {SCHEMA}.vm_users WHERE phone=%s",
            (phone,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(400, {"error": "Аккаунт с таким номером не найден"})

        # Проверяем email
        if (row[7] or "").lower() != email:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный email для этого аккаунта"})

        # Проверяем OTP (expires_at хранится в UTC, сравниваем с NOW() AT TIME ZONE 'UTC')
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND code=%s AND purpose='login'
                  AND used=FALSE
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 1""",
            (email, code)
        )
        otp = cur.fetchone()
        if not otp:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или устаревший код. Запросите новый."})

        token = secrets.token_hex(32)
        user_id = row[0]
        cur.execute(
            f"UPDATE {SCHEMA}.vm_users SET session_token=%s, is_online=TRUE, last_seen=NOW() WHERE id=%s",
            (token, user_id)
        )
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
            (user_id, token, detect_device(user_agent), ip[:50] if ip else None)
        )
        cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp[0],))
        conn.commit()
        cur.close(); conn.close()

        return resp(200, {
            "ok": True, "token": token,
            "user": {"id": row[0], "username": row[1], "display_name": row[2],
                     "avatar_color": row[3], "bio": row[4], "avatar_url": row[5],
                     "phone": row[6], "email": row[7]}
        })

    # ── me ────────────────────────────────────────────────────────────────────
    if action == "me":
        if not token_header:
            return resp(401, {"error": "Нет токена"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.avatar_url, u.phone, u.email
                FROM {SCHEMA}.vm_sessions s
                JOIN {SCHEMA}.vm_users u ON u.id = s.user_id
                WHERE s.token = %s""",
            (token_header,)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET last_active=NOW() WHERE token=%s", (token_header,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "user": {
            "id": row[0], "username": row[1], "display_name": row[2],
            "avatar_color": row[3], "bio": row[4], "avatar_url": row[5],
            "phone": row[6], "email": row[7]
        }})

    # ── logout ────────────────────────────────────────────────────────────────
    if action == "logout":
        if token_header:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
            row = cur.fetchone()
            if row:
                user_id = row[0]
                cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
                cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.vm_sessions WHERE user_id=%s", (user_id,))
                if cur.fetchone()[0] == 0:
                    cur.execute(f"UPDATE {SCHEMA}.vm_users SET is_online=FALSE, last_seen=NOW() WHERE id=%s", (user_id,))
            conn.commit()
            cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── sessions ──────────────────────────────────────────────────────────────
    if action == "sessions":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]
        cur.execute(
            f"""SELECT id, device_name, ip_address, created_at, last_active, token=%s as is_current
                FROM {SCHEMA}.vm_sessions
                WHERE user_id=%s AND last_active > NOW() - INTERVAL '30 days'
                ORDER BY last_active DESC""",
            (token_header, user_id)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "sessions": [
            {"id": r[0], "device": r[1], "ip": r[2],
             "created_at": str(r[3])[:16].replace("T", " "),
             "last_active": str(r[4])[:16].replace("T", " "),
             "is_current": r[5]} for r in rows
        ]})

    # ── logout_other ──────────────────────────────────────────────────────────
    if action == "logout_other":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s", (row[0], token_header))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── change_username ───────────────────────────────────────────────────────
    if action == "change_username":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        new_username = (body.get("username") or "").strip().lower()
        if not new_username or len(new_username) < 3 or len(new_username) > 32:
            return resp(400, {"error": "Username: 3–32 символа"})
        if not re.match(r'^[a-z0-9_]+$', new_username):
            return resp(400, {"error": "Только латинские буквы, цифры и _"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        try:
            cur.execute(f"UPDATE {SCHEMA}.vm_users SET username=%s WHERE id=%s", (new_username, row[0]))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "username": new_username})
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            cur.close(); conn.close()
            return resp(409, {"error": "Этот username уже занят"})

    # ── change_email ──────────────────────────────────────────────────────────
    if action == "change_email":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        new_email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        if not new_email or not validate_email(new_email):
            return resp(400, {"error": "Укажите корректный email"})
        if not code:
            return resp(400, {"error": "Введите код подтверждения"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]
        # Проверяем OTP (используем purpose='register' т.к. тот же код)
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND code=%s AND used=FALSE
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 1""",
            (new_email, code)
        )
        otp = cur.fetchone()
        if not otp:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или устаревший код"})
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s AND id != %s", (new_email, user_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот email уже используется"})
        cur.execute(f"UPDATE {SCHEMA}.vm_users SET email=%s WHERE id=%s", (new_email, user_id))
        cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp[0],))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "email": new_email})

    # ── change_phone ──────────────────────────────────────────────────────────
    if action == "change_phone":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        phone_raw = (body.get("phone") or "").strip()
        if not phone_raw:
            return resp(400, {"error": "Укажите номер телефона"})
        phone = normalize_phone(phone_raw)
        if len(phone) < 8:
            return resp(400, {"error": "Некорректный номер телефона"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s AND id != %s", (phone, user_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот номер уже используется"})
        cur.execute(f"UPDATE {SCHEMA}.vm_users SET phone=%s WHERE id=%s", (phone, user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "phone": phone})

    # ── delete_account ────────────────────────────────────────────────────────
    if action == "delete_account":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        password = body.get("password") or ""
        if not password:
            return resp(400, {"error": "Введите пароль для подтверждения"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE id=%s AND password_hash=%s", (user_id, hash_password(password)))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Неверный пароль"})
        cur.execute(
            f"""UPDATE {SCHEMA}.vm_users SET is_active=FALSE, is_online=FALSE,
                phone=NULL, email=NULL, session_token=NULL,
                display_name='Удалённый аккаунт', bio='', avatar_url=NULL, last_seen=NOW()
            WHERE id=%s""",
            (user_id,)
        )
        cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    return resp(404, {"error": "Unknown action"})