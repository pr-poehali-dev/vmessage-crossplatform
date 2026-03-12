"""
Аутентификация V-message: регистрация, вход, выход, проверка сессии.
Маршрутизация через queryStringParameters: ?action=register|login|me|logout
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

COLORS = ["#8B5CF6", "#EC4899", "#3B82F6", "#10B981", "#F59E0B", "#06B6D4", "#EF4444", "#6366F1"]


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False, default=str)}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return resp(400, {"error": "Invalid JSON"})

    token_header = (event.get("headers") or {}).get("X-Session-Token") or (event.get("headers") or {}).get("x-session-token")

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
                "INSERT INTO vm_users (username, display_name, avatar_color, password_hash, session_token, is_online) VALUES (%s, %s, %s, %s, %s, TRUE) RETURNING id, username, display_name, avatar_color",
                (username, display_name, color, hash_password(password), token)
            )
            row = cur.fetchone()
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
            "SELECT id, username, display_name, avatar_color, bio FROM vm_users WHERE username=%s AND password_hash=%s",
            (username, hash_password(password))
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return resp(401, {"error": "Неверный логин или пароль"})

        token = secrets.token_hex(32)
        cur.execute("UPDATE vm_users SET session_token=%s, is_online=TRUE, last_seen=NOW() WHERE id=%s", (token, row[0]))
        conn.commit()
        cur.close()
        conn.close()
        return resp(200, {
            "ok": True,
            "token": token,
            "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "bio": row[4]}
        })

    # me
    if action == "me":
        if not token_header:
            return resp(401, {"error": "Нет токена"})
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, username, display_name, avatar_color, bio FROM vm_users WHERE session_token=%s",
            (token_header,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return resp(401, {"error": "Сессия недействительна"})
        return resp(200, {"ok": True, "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "bio": row[4]}})

    # logout
    if action == "logout":
        if token_header:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("UPDATE vm_users SET session_token=NULL, is_online=FALSE, last_seen=NOW() WHERE session_token=%s", (token_header,))
            conn.commit()
            cur.close()
            conn.close()
        return resp(200, {"ok": True})

    return resp(404, {"error": "Unknown action"})
