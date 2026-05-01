"""
Аутентификация V-message: регистрация, вход, выход, проверка сессии, управление сессиями.
Маршрутизация через queryStringParameters: ?action=register|login|me|logout|sessions|logout_all_other
Поддержка нескольких устройств одновременно.
"""
import json
import os
import hashlib
import secrets
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


def handler(event: dict, context) -> dict:
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

    # register — по номеру телефона (username генерируется авто или задаётся опционально)
    if action == "register":
        phone = (body.get("phone") or "").strip()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""
        username_raw = (body.get("username") or "").strip().lower()

        if not phone or len(phone) < 7:
            return resp(400, {"error": "Укажите номер телефона"})
        if not display_name:
            return resp(400, {"error": "Укажите отображаемое имя"})
        if len(password) < 6:
            return resp(400, {"error": "Пароль минимум 6 символов"})

        # Нормализуем телефон — только цифры и +
        phone_clean = "+" + "".join(c for c in phone if c.isdigit())
        if len(phone_clean) < 8:
            return resp(400, {"error": "Некорректный номер телефона"})

        # Генерируем username если не указан
        if username_raw and len(username_raw) >= 3:
            username = username_raw
        else:
            import re
            base = re.sub(r"[^a-z0-9]", "", display_name.lower())[:12] or "user"
            username = base + phone_clean[-4:]

        color = COLORS[abs(hash(phone_clean)) % len(COLORS)]
        token = secrets.token_hex(32)

        conn = get_conn()
        cur = conn.cursor()
        try:
            # Проверяем телефон
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE phone=%s", (phone_clean,))
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(409, {"error": "Этот номер телефона уже зарегистрирован"})
            # Проверяем username на уникальность
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s", (username,))
            if cur.fetchone():
                username = username + phone_clean[-4:]
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_users (username, display_name, avatar_color, password_hash, session_token, phone, is_online) VALUES (%s, %s, %s, %s, %s, %s, TRUE) RETURNING id, username, display_name, avatar_color",
                (username, display_name, color, hash_password(password), token, phone_clean)
            )
            row = cur.fetchone()
            user_id = row[0]
            device_name = detect_device(user_agent)
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_sessions (user_id, token, device_name, ip_address) VALUES (%s, %s, %s, %s)",
                (user_id, token, device_name, ip[:50] if ip else None)
            )
            conn.commit()
            return resp(200, {
                "ok": True,
                "token": token,
                "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3]}
            })
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            return resp(409, {"error": "Пользователь уже существует"})
        finally:
            cur.close()
            conn.close()

    # login — по телефону или username
    if action == "login":
        login_id = (body.get("phone") or body.get("username") or "").strip()
        password = body.get("password") or ""

        conn = get_conn()
        cur = conn.cursor()

        # Определяем вход по телефону или username
        if login_id.startswith("+") or login_id.lstrip("+").isdigit():
            phone_clean = "+" + "".join(c for c in login_id if c.isdigit())
            cur.execute(
                f"SELECT id, username, display_name, avatar_color, bio, avatar_url FROM {SCHEMA}.vm_users WHERE phone=%s AND password_hash=%s",
                (phone_clean, hash_password(password))
            )
        else:
            cur.execute(
                f"SELECT id, username, display_name, avatar_color, bio, avatar_url FROM {SCHEMA}.vm_users WHERE username=%s AND password_hash=%s",
                (login_id.lower(), hash_password(password))
            )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
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
        cur.close()
        conn.close()
        return resp(200, {
            "ok": True,
            "token": token,
            "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "bio": row[4], "avatar_url": row[5]}
        })

    # me — проверка по таблице сессий
    if action == "me":
        if not token_header:
            return resp(401, {"error": "Нет токена"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.avatar_url
            FROM {SCHEMA}.vm_sessions s
            JOIN {SCHEMA}.vm_users u ON u.id = s.user_id
            WHERE s.token = %s
            """,
            (token_header,)
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return resp(401, {"error": "Сессия недействительна"})
        # Обновляем last_active
        cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET last_active=NOW() WHERE token=%s", (token_header,))
        conn.commit()
        cur.close()
        conn.close()
        return resp(200, {"ok": True, "user": {
            "id": row[0], "username": row[1], "display_name": row[2],
            "avatar_color": row[3], "bio": row[4], "avatar_url": row[5]
        }})

    # logout — удаляет только текущую сессию
    if action == "logout":
        if token_header:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(f"SELECT user_id FROM {SCHEMA}.vm_sessions WHERE token=%s", (token_header,))
            row = cur.fetchone()
            if row:
                user_id = row[0]
                cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET last_active=NOW() WHERE token=%s", (token_header,))
                # Если это последняя сессия — ставим offline
                cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s", (user_id, token_header))
                remaining = cur.fetchone()[0]
                if remaining == 0:
                    cur.execute(f"UPDATE {SCHEMA}.vm_users SET is_online=FALSE, last_seen=NOW() WHERE id=%s", (user_id,))
                cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET last_active=NOW() WHERE token=%s", (token_header,))
                # Помечаем сессию как завершённую (не удаляем, просто инвалидируем через token)
                cur.execute(f"UPDATE {SCHEMA}.vm_users SET session_token=NULL WHERE session_token=%s", (token_header,))
            conn.commit()
            cur.close()
            conn.close()
        return resp(200, {"ok": True})

    # sessions — список активных сессий (только реальные, не отозванные)
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
        # Показываем только активные сессии (не отозванные) — активность в течение 30 дней
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

    # logout_other — завершить все сессии кроме текущей
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
        # Удаляем все остальные сессии физически
        cur.execute(
            f"DELETE FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s",
            (user_id, token_header)
        )
        revoked = cur.rowcount
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "revoked": revoked})

    # change_username — сменить username
    if action == "change_username":
        if not token_header:
            return resp(401, {"error": "Не авторизован"})
        new_username = (body.get("username") or "").strip().lower()
        if not new_username or len(new_username) < 3:
            return resp(400, {"error": "Username минимум 3 символа"})
        if len(new_username) > 32:
            return resp(400, {"error": "Username максимум 32 символа"})
        import re
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

    return resp(404, {"error": "Unknown action"})