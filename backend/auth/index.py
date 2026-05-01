"""
Аутентификация V-message: регистрация по телефону с OTP, вход, выход, управление сессиями.
Действия: send_code | register | login | me | logout | sessions | logout_other |
          change_username | change_phone | delete_account
"""
import json
import os
import hashlib
import secrets
import random
import re
import urllib.request
import urllib.parse
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
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False, default=str)}


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


def normalize_phone(raw: str) -> str:
    digits = "".join(c for c in raw if c.isdigit())
    return "+" + digits


def send_sms(phone: str, code: str) -> bool:
    """Отправляет SMS через SMS.ru. Возвращает True если успешно."""
    api_key = os.environ.get("SMSRU_API_KEY", "")
    if not api_key:
        # Если ключ не задан — режим разработки, код логируем
        print(f"[DEV SMS] Phone: {phone} Code: {code}")
        return True
    text = f"Ваш код подтверждения V-message: {code}. Действует 10 минут."
    params = urllib.parse.urlencode({
        "api_id": api_key,
        "to": phone,
        "msg": text,
        "json": 1,
    })
    try:
        url = f"https://sms.ru/sms/send?{params}"
        with urllib.request.urlopen(url, timeout=10) as r:
            result = json.loads(r.read().decode())
            return result.get("status") == "OK"
    except Exception as e:
        print(f"[SMS ERROR] {e}")
        return False


def handler(event: dict, context) -> dict:
    """Аутентификация: send_code, register, login, me, logout, sessions, logout_other, change_username, change_phone, delete_account"""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    headers = event.get("headers") or {}
    token_header = headers.get("X-Session-Token") or headers.get("x-session-token")
    user_agent = headers.get("User-Agent") or headers.get("user-agent") or ""
    ip = (event.get("requestContext") or {}).get("identity", {}).get("sourceIp") or headers.get("X-Forwarded-For", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return resp(400, {"error": "Invalid JSON"})

    # ── send_code — отправить OTP на телефон ──────────────────────────────────
    if action == "send_code":
        phone_raw = (body.get("phone") or "").strip()
        purpose = body.get("purpose", "register")  # register | change_phone

        if not phone_raw or len(phone_raw) < 7:
            return resp(400, {"error": "Укажите номер телефона"})

        phone = normalize_phone(phone_raw)
        if len(phone) < 8:
            return resp(400, {"error": "Некорректный номер телефона"})

        conn = get_conn()
        cur = conn.cursor()

        # При регистрации — проверяем что телефон не занят
        if purpose == "register":
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s", (phone,))
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(409, {"error": "Этот номер телефона уже зарегистрирован"})

        # Проверяем rate limit — не чаще 1 раза в минуту
        cur.execute(
            f"SELECT created_at FROM {SCHEMA}.vm_phone_codes WHERE phone=%s AND purpose=%s ORDER BY created_at DESC LIMIT 1",
            (phone, purpose)
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
            f"INSERT INTO {SCHEMA}.vm_phone_codes (phone, code, purpose) VALUES (%s, %s, %s)",
            (phone, code, purpose)
        )
        conn.commit()
        cur.close(); conn.close()

        ok = send_sms(phone, code)
        if not ok:
            return resp(500, {"error": "Не удалось отправить SMS. Проверьте номер телефона."})

        return resp(200, {"ok": True, "message": f"Код отправлен на {phone}"})

    # ── register — регистрация после проверки OTP ──────────────────────────────
    if action == "register":
        phone_raw = (body.get("phone") or "").strip()
        code = (body.get("code") or "").strip()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""
        username_raw = (body.get("username") or "").strip().lower()

        if not phone_raw or not code or not display_name or len(password) < 6:
            return resp(400, {"error": "Заполните все поля (телефон, код, имя, пароль)"})

        phone = normalize_phone(phone_raw)

        conn = get_conn()
        cur = conn.cursor()

        # Проверяем OTP
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE phone=%s AND code=%s AND purpose='register'
                  AND used=FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1""",
            (phone, code)
        )
        otp_row = cur.fetchone()
        if not otp_row:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или истёкший код подтверждения"})

        otp_id = otp_row[0]

        # Проверяем что номер не занят
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s", (phone,))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот номер телефона уже зарегистрирован"})

        # Генерируем username
        if username_raw and len(username_raw) >= 3 and re.match(r'^[a-z0-9_]+$', username_raw):
            username = username_raw
        else:
            base = re.sub(r"[^a-z0-9]", "", display_name.lower())[:12] or "user"
            username = base + phone[-4:]

        # Уникальность username
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s", (username,))
        if cur.fetchone():
            username = username + str(random.randint(10, 99))

        color = COLORS[abs(hash(phone)) % len(COLORS)]
        token = secrets.token_hex(32)

        try:
            cur.execute(
                f"""INSERT INTO {SCHEMA}.vm_users
                    (username, display_name, avatar_color, password_hash, session_token, phone, is_online)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                    RETURNING id, username, display_name, avatar_color""",
                (username, display_name, color, hash_password(password), token, phone)
            )
            row = cur.fetchone()
            user_id = row[0]

            device_name = detect_device(user_agent)
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
                (user_id, token, device_name, ip[:50] if ip else None)
            )

            # Помечаем OTP как использованный
            cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp_id,))
            conn.commit()

            return resp(200, {
                "ok": True,
                "token": token,
                "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "phone": phone}
            })
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            return resp(409, {"error": "Пользователь уже существует"})
        finally:
            cur.close()
            conn.close()

    # ── login — по телефону или username ──────────────────────────────────────
    if action == "login":
        login_id = (body.get("phone") or body.get("username") or "").strip()
        password = body.get("password") or ""

        conn = get_conn()
        cur = conn.cursor()

        if login_id.startswith("+") or login_id.lstrip("+").isdigit():
            phone = normalize_phone(login_id)
            cur.execute(
                f"SELECT id, username, display_name, avatar_color, bio, avatar_url, phone FROM {SCHEMA}.vm_users WHERE phone=%s AND password_hash=%s",
                (phone, hash_password(password))
            )
        else:
            cur.execute(
                f"SELECT id, username, display_name, avatar_color, bio, avatar_url, phone FROM {SCHEMA}.vm_users WHERE username=%s AND password_hash=%s",
                (login_id.lower(), hash_password(password))
            )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Неверный номер телефона или пароль"})

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
            "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "bio": row[4], "avatar_url": row[5], "phone": row[6]}
        })

    # ── me ─────────────────────────────────────────────────────────────────────
    if action == "me":
        if not token_header:
            return resp(401, {"error": "Нет токена"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.avatar_url, u.phone
            FROM {SCHEMA}.vm_sessions s
            JOIN {SCHEMA}.vm_users u ON u.id = s.user_id
            WHERE s.token = %s
            """,
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
            "avatar_color": row[3], "bio": row[4], "avatar_url": row[5], "phone": row[6]
        }})

    # ── logout ─────────────────────────────────────────────────────────────────
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
                cur.execute(f"UPDATE {SCHEMA}.vm_users SET session_token=NULL WHERE session_token=%s", (token_header,))
            conn.commit()
            cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── sessions ───────────────────────────────────────────────────────────────
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
                WHERE user_id=%s
                  AND token NOT LIKE '_revoked_%%'
                  AND last_active > NOW() - INTERVAL '30 days'
                ORDER BY last_active DESC""",
            (token_header, user_id)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        sessions = [{"id": r[0], "device": r[1], "ip": r[2], "created_at": str(r[3])[:16].replace("T", " "), "last_active": str(r[4])[:16].replace("T", " "), "is_current": r[5]} for r in rows]
        return resp(200, {"ok": True, "sessions": sessions})

    # ── logout_other ───────────────────────────────────────────────────────────
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
        cur.execute(
            f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s",
            (user_id, token_header)
        )
        revoked = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "revoked": revoked})

    # ── change_username ────────────────────────────────────────────────────────
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

    # ── change_phone — смена номера телефона с подтверждением OTP ─────────────
    if action == "change_phone":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        phone_raw = (body.get("phone") or "").strip()
        code = (body.get("code") or "").strip()

        if not phone_raw or not code:
            return resp(400, {"error": "Укажите новый номер телефона и код"})

        phone = normalize_phone(phone_raw)
        conn = get_conn()
        cur = conn.cursor()

        cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        user_id = row[0]

        # Проверяем что номер не занят другим пользователем
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s AND id != %s", (phone, user_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return resp(409, {"error": "Этот номер телефона уже используется"})

        # Проверяем OTP
        cur.execute(
            f"""SELECT id FROM {SCHEMA}.vm_phone_codes
                WHERE phone=%s AND code=%s AND purpose='change_phone'
                  AND used=FALSE AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1""",
            (phone, code)
        )
        otp_row = cur.fetchone()
        if not otp_row:
            cur.close(); conn.close()
            return resp(400, {"error": "Неверный или истёкший код подтверждения"})

        otp_id = otp_row[0]
        cur.execute(f"UPDATE {SCHEMA}.vm_users SET phone=%s WHERE id=%s", (phone, user_id))
        cur.execute(f"UPDATE {SCHEMA}.vm_phone_codes SET used=TRUE WHERE id=%s", (otp_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "phone": phone})

    # ── delete_account — удаление аккаунта ────────────────────────────────────
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

        # Проверяем пароль
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE id=%s AND password_hash=%s", (user_id, hash_password(password)))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Неверный пароль"})

        # Деактивируем аккаунт — помечаем неактивным и обезличиваем
        cur.execute(
            f"""UPDATE {SCHEMA}.vm_users SET
                is_active=FALSE, is_online=FALSE,
                phone=NULL, session_token=NULL,
                display_name='Удалённый аккаунт',
                bio='', avatar_url=NULL,
                last_seen=NOW()
            WHERE id=%s""",
            (user_id,)
        )
        # Удаляем все сессии
        cur.execute(f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s", (user_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    return resp(404, {"error": "Unknown action"})
