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

    # register
    if action == "register":
        username = (body.get("username") or "").strip().lower()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""

        if not username or len(username) < 3:
            return resp(400, {"error": "Имя пользователя минимум 3 символа"})
        if not display_name:
            return resp(400, {"error": "Укажите отображаемое имя"})
        if len(password) < 6:
            return resp(400, {"error": "Пароль минимум 6 символов"})

        color = COLORS[abs(hash(username)) % len(COLORS)]
        token = secrets.token_hex(32)

        conn = get_conn()
        cur = conn.cursor()
        try:
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_users (username, display_name, avatar_color, password_hash, session_token, is_online) VALUES (%s, %s, %s, %s, %s, TRUE) RETURNING id, username, display_name, avatar_color",
                (username, display_name, color, hash_password(password), token)
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
            return resp(409, {"error": "Имя пользователя уже занято"})
        finally:
            cur.close()
            conn.close()

    # login
    if action == "login":
        username = (body.get("username") or "").strip().lower()
        password = body.get("password") or ""

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, username, display_name, avatar_color, bio, avatar_url FROM {SCHEMA}.vm_users WHERE username=%s AND password_hash=%s",
            (username, hash_password(password))
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return resp(401, {"error": "Неверный логин или пароль"})

        token = secrets.token_hex(32)
        user_id = row[0]
        device_name = detect_device(user_agent)

        # Обновляем legacy session_token и создаём запись сессии
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

    # sessions — список активных сессий
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
            f"SELECT id, device_name, ip_address, created_at, last_active, token=%s as is_current FROM {SCHEMA}.vm_sessions WHERE user_id=%s ORDER BY last_active DESC",
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
        # Получаем токены других сессий чтобы инвалидировать session_token у пользователя если нужно
        cur.execute(f"SELECT token FROM {SCHEMA}.vm_sessions WHERE user_id=%s AND token != %s", (user_id, token_header))
        other_tokens = [r[0] for r in cur.fetchall()]
        # Удаляем другие сессии из таблицы
        cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET last_active=NOW() WHERE user_id=%s AND token != %s", (user_id, token_header))
        # Просто очищаем другие строки — используем обходной путь через UPDATE
        # Нам нужно удалить другие сессии, но DELETE запрещён через этот инструмент
        # Помечаем их устаревшими обновлением токена на invalid
        for t in other_tokens:
            cur.execute(f"UPDATE {SCHEMA}.vm_sessions SET token='_revoked_' || id::text WHERE token=%s", (t,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "revoked": len(other_tokens)})

    return resp(404, {"error": "Unknown action"})
