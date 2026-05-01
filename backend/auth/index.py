"""
Аутентификация V-message: регистрация по email с OTP через Gmail SMTP.
Действия: send_code | register | login | me | logout | sessions | logout_other |
          change_username | change_email | delete_account
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


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def resp(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False, default=str)
    }


def detect_device(ua: str) -> str:
    ua = (ua or "").lower()
    if "iphone" in ua or "ipad" in ua:
        return "iPhone/iPad"
    if "android" in ua:
        return "Android"
    if "windows" in ua:
        return "Windows"
    if "mac" in ua:
        return "Mac"
    if "linux" in ua:
        return "Linux"
    return "Неизвестное устройство"


def validate_email(email: str) -> bool:
    return bool(re.match(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$', email))


def send_email(to_email: str, code: str, purpose: str) -> tuple[bool, str]:
    """Отправляет код через Gmail SMTP. Возвращает (успех, сообщение об ошибке)."""
    gmail_user = os.environ.get("GMAIL_USER", "")
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD", "")

    if not gmail_user or not gmail_pass:
        # Режим разработки — выводим в лог
        print(f"[DEV EMAIL] To: {to_email} Code: {code} Purpose: {purpose}")
        return True, ""

    subject = "Код подтверждения V-message"
    if purpose == "change_email":
        subject = "Подтверждение нового email — V-message"

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="background:linear-gradient(135deg,#8B5CF6,#6366F1);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px">
        <span style="color:white;font-size:48px;font-weight:900">V</span>
        <p style="color:white;margin:8px 0 0;font-size:18px;font-weight:700">V-message</p>
      </div>
      <h2 style="color:#1a1a2e;margin-bottom:8px">Твой код подтверждения</h2>
      <p style="color:#666;margin-bottom:24px">Введи этот код в приложении. Действует 10 минут.</p>
      <div style="background:#f5f3ff;border:2px solid #8B5CF6;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
        <span style="font-size:40px;font-weight:900;letter-spacing:8px;color:#6d28d9">{code}</span>
      </div>
      <p style="color:#999;font-size:13px">Если ты не запрашивал этот код — просто проигнорируй это письмо.</p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"V-message <{gmail_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(gmail_user, gmail_pass.replace(" ", ""))
            server.sendmail(gmail_user, to_email, msg.as_string())
        return True, ""
    except smtplib.SMTPAuthenticationError:
        print("[EMAIL ERROR] Authentication failed — check GMAIL_USER and GMAIL_APP_PASSWORD")
        return False, "Ошибка авторизации почты. Обратитесь к администратору."
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False, "Не удалось отправить письмо. Проверь правильность email."


def handler(event: dict, context) -> dict:
    """Аутентификация: send_code, register, login, me, logout, sessions,
       logout_other, change_username, change_email, delete_account"""
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
        purpose = body.get("purpose", "register")  # register | change_email

        if not email or not validate_email(email):
            return resp(400, {"error": "Укажите корректный email адрес"})

        conn = get_conn()
        cur = conn.cursor()

        # При регистрации — проверяем что email не занят
        if purpose == "register":
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s", (email,))
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(409, {"error": "Этот email уже зарегистрирован"})

        # Rate limit — не чаще 1 раза в минуту
        cur.execute(
            f"""SELECT created_at FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND purpose=%s ORDER BY created_at DESC LIMIT 1""",
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

        ok, err = send_email(email, code, purpose)
        if not ok:
            return resp(500, {"error": err or "Не удалось отправить письмо"})

        return resp(200, {"ok": True, "message": f"Код отправлен на {email}"})

    # ── register — создать аккаунт после проверки OTP ────────────────────────
    if action == "register":
        email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""
        username_raw = (body.get("username") or "").strip().lower()

        if not email or not validate_email(email):
            return resp(400, {"error": "Укажите корректный email"})
        if not code or not display_name or len(password) < 6:
            return resp(400, {"error": "Заполните все поля (код, имя, пароль мин. 6 символов)"})

        conn = get_conn()
        cur = conn.cursor()

        # Проверяем OTP
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND code=%s AND purpose='register'
                  AND used=FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1""",
            (email, code)
        )
        otp_row = cur.fetchone()
        if not otp_row:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или истёкший код подтверждения"})
        otp_id = otp_row[0]

        # Проверяем email не занят
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s", (email,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот email уже зарегистрирован"})

        # Генерируем username из email если не указан
        if username_raw and len(username_raw) >= 3 and re.match(r'^[a-z0-9_]+$', username_raw):
            username = username_raw
        else:
            base = re.sub(r"[^a-z0-9]", "", email.split("@")[0])[:14] or "user"
            username = base

        # Уникальность username
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s", (username,))
        if cur.fetchone():
            username = username + str(random.randint(10, 999))

        color = COLORS[abs(hash(email)) % len(COLORS)]
        token = secrets.token_hex(32)

        try:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.vm_users
                    (username, display_name, avatar_color, password_hash, session_token, email, is_online)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                    RETURNING id, username, display_name, avatar_color""",
                (username, display_name, color, hash_password(password), token, email)
            )
            row = cur.fetchone()
            user_id = row[0]

            device_name = detect_device(user_agent)
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
                (user_id, token, device_name, ip[:50] if ip else None)
            )
            cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp_id,))
            conn.commit()

            return resp(200, {
                "ok": True,
                "token": token,
                "user": {
                    "id": row[0], "username": row[1], "display_name": row[2],
                    "avatar_color": row[3], "email": email
                }
            })
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            return resp(409, {"error": "Пользователь уже существует"})
        finally:
            cur.close(); conn.close()

    # ── login — по email + пароль ─────────────────────────────────────────────
    if action == "login":
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""

        if not email or not password:
            return resp(400, {"error": "Укажите email и пароль"})

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""SELECT id, username, display_name, avatar_color, bio, avatar_url, email
                FROM {SCHEMA}.vm_users
                WHERE email=%s AND password_hash=%s""",
            (email, hash_password(password))
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Неверный email или пароль"})

        token = secrets.token_hex(32)
        user_id = row[0]
        device_name = detect_device(user_agent)

        cur.execute(
            f"UPDATE {SCHEMA}.vm_users SET session_token=%s, is_online=TRUE, last_seen=NOW() WHERE id=%s",
            (token, user_id)
        )
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
            (user_id, token, device_name, ip[:50] if ip else None)
        )
        conn.commit()
        cur.close(); conn.close()

        return resp(200, {
            "ok": True,
            "token": token,
            "user": {
                "id": row[0], "username": row[1], "display_name": row[2],
                "avatar_color": row[3], "bio": row[4], "avatar_url": row[5], "email": row[6]
            }
        })

    # ── me ────────────────────────────────────────────────────────────────────
    if action == "me":
        if not token_header:
            return resp(401, {"error": "Нет токена"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.avatar_url, u.email
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
            "avatar_color": row[3], "bio": row[4], "avatar_url": row[5], "email": row[6]
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
                cur.execute(f"UPDATE {SCHEMA}.vm_users SET session_token=NULL WHERE id=%s", (user_id,))
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
        sessions = [{
            "id": r[0], "device": r[1], "ip": r[2],
            "created_at": str(r[3])[:16].replace("T", " "),
            "last_active": str(r[4])[:16].replace("T", " "),
            "is_current": r[5]
        } for r in rows]
        return resp(200, {"ok": True, "sessions": sessions})

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
        user_id = row[0]
        cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s", (user_id, token_header))
        revoked = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "revoked": revoked})

    # ── change_username ───────────────────────────────────────────────────────
    if action == "change_username":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        new_username = (body.get("username") or "").strip().lower()
        if not new_username or len(new_username) < 3:
            return resp(400, {"error": "Username минимум 3 символа"})
        if len(new_username) > 32:
            return resp(400, {"error": "Username максимум 32 символа"})
        if not re.match(r'^[a-z0-9_]+$', new_username):
            return resp(400, {"error": "Только латинские буквы, цифры и _"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]
        try:
            cur.execute(f"UPDATE {SCHEMA}.vm_users SET username=%s WHERE id=%s", (new_username, user_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "username": new_username})
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            cur.close(); conn.close()
            return resp(409, {"error": "Этот username уже занят"})

    # ── change_email — смена email с подтверждением OTP ──────────────────────
    if action == "change_email":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        new_email = (body.get("email") or "").strip().lower()
        code = (body.get("code") or "").strip()

        if not new_email or not validate_email(new_email) or not code:
            return resp(400, {"error": "Укажите новый email и код"})

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]

        # Проверяем что email не занят
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE email=%s AND id != %s", (new_email, user_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот email уже используется"})

        # Проверяем OTP
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE email=%s AND code=%s AND purpose='change_email'
                  AND used=FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1""",
            (new_email, code)
        )
        otp_row = cur.fetchone()
        if not otp_row:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или истёкший код подтверждения"})

        cur.execute(f"UPDATE {SCHEMA}.vm_users SET email=%s WHERE id=%s", (new_email, user_id))
        cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp_row[0],))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "email": new_email})

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

        cur.execute(
            f"SELECT id FROM {SCHEMA}.vm_users WHERE id=%s AND password_hash=%s",
            (user_id, hash_password(password))
        )
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Неверный пароль"})

        cur.execute(
            f"""UPDATE {SCHEMA}.vm_users SET
                is_active=FALSE, is_online=FALSE,
                email=NULL, phone=NULL, session_token=NULL,
                display_name='Удалённый аккаунт',
                bio='', avatar_url=NULL, last_seen=NOW()
            WHERE id=%s""",
            (user_id,)
        )
        cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    return resp(404, {"error": "Unknown action"})
