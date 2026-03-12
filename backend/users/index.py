"""
API пользователей V-message: поиск, обновление профиля, список контактов.
"""
import json
import os
import psycopg2

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False, default=str)}


def get_user_by_token(cur, token: str):
    if not token:
        return None
    cur.execute("SELECT id, username, display_name, avatar_color, bio FROM vm_users WHERE session_token=%s", (token,))
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    path = event.get("path", "/")
    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    token = event.get("headers", {}).get("X-Session-Token") or event.get("headers", {}).get("x-session-token")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            return resp(400, {"error": "Invalid JSON"})

    conn = get_conn()
    cur = conn.cursor()

    user = get_user_by_token(cur, token)
    if not user:
        cur.close(); conn.close()
        return resp(401, {"error": "Не авторизован"})

    user_id = user[0]

    # GET /search?q=username
    if path.endswith("/search") and method == "GET":
        q = (qs.get("q") or "").strip().lower()
        if len(q) < 2:
            cur.close(); conn.close()
            return resp(400, {"error": "Минимум 2 символа"})
        cur.execute(
            "SELECT id, username, display_name, avatar_color, bio, is_online FROM vm_users WHERE (username ILIKE %s OR display_name ILIKE %s) AND id != %s LIMIT 20",
            (f"%{q}%", f"%{q}%", user_id)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "users": [
            {"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "bio": r[4], "online": bool(r[5])}
            for r in rows
        ]})

    # GET /contacts — люди, с кем есть чат
    if path.endswith("/contacts") and method == "GET":
        cur.execute("""
            SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.is_online
            FROM vm_users u
            JOIN vm_chat_members cm ON cm.user_id=u.id
            JOIN vm_chat_members cm2 ON cm2.chat_id=cm.chat_id AND cm2.user_id=%s
            WHERE u.id != %s
            ORDER BY u.display_name
        """, (user_id, user_id))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "contacts": [
            {"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "bio": r[4], "online": bool(r[5])}
            for r in rows
        ]})

    # POST /update — обновить профиль
    if path.endswith("/update") and method == "POST":
        display_name = body.get("display_name")
        bio = body.get("bio")
        updates = []
        vals = []
        if display_name:
            updates.append("display_name=%s")
            vals.append(display_name.strip())
        if bio is not None:
            updates.append("bio=%s")
            vals.append(bio.strip())
        if not updates:
            cur.close(); conn.close()
            return resp(400, {"error": "Нечего обновлять"})
        vals.append(user_id)
        cur.execute(f"UPDATE vm_users SET {', '.join(updates)} WHERE id=%s RETURNING id, username, display_name, avatar_color, bio", vals)
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "user": {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3], "bio": row[4]}})

    cur.close(); conn.close()
    return resp(404, {"error": "Not found"})
