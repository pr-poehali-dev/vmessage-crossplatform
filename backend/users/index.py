"""
API пользователей V-message: поиск, обновление профиля, аватар, блокировка.
Маршрутизация через ?action=search|contacts|update|update_avatar|block
"""
import json
import os
import base64
import uuid
import psycopg2
import boto3

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Token",
}

SCHEMA = "t_p77366720_vmessage_crossplatfo"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(body, ensure_ascii=False, default=str)}


def get_user_by_token(cur, token: str):
    if not token:
        return None
    cur.execute(f"SELECT id, username, display_name, avatar_color, bio, avatar_url FROM {SCHEMA}.vm_users WHERE session_token=%s", (token,))
    return cur.fetchone()


def upload_avatar_to_s3(data_b64: str, mime_type: str) -> str:
    data = base64.b64decode(data_b64)
    ext = mime_type.split("/")[-1].replace("jpeg", "jpg")
    key = f"avatars/{uuid.uuid4()}.{ext}"
    s3 = boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    s3.put_object(Bucket="files", Key=key, Body=data, ContentType=mime_type)
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def format_user(row) -> dict:
    return {
        "id": row[0], "username": row[1], "display_name": row[2],
        "avatar_color": row[3], "bio": row[4], "avatar_url": row[5]
    }


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    token = (event.get("headers") or {}).get("X-Session-Token") or (event.get("headers") or {}).get("x-session-token")

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

    # search
    if action == "search":
        q = (qs.get("q") or "").strip()
        if len(q) < 2:
            cur.close(); conn.close()
            return resp(400, {"error": "Минимум 2 символа"})
        cur.execute(
            f"SELECT id, username, display_name, avatar_color, bio, is_online, avatar_url FROM {SCHEMA}.vm_users WHERE (username ILIKE %s OR display_name ILIKE %s) AND id != %s LIMIT 20",
            (f"%{q}%", f"%{q}%", user_id)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "users": [
            {"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "bio": r[4], "online": bool(r[5]), "avatar_url": r[6]}
            for r in rows
        ]})

    # contacts
    if action == "contacts":
        cur.execute(f"""
            SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_color, u.bio, u.is_online, u.avatar_url
            FROM {SCHEMA}.vm_users u
            JOIN {SCHEMA}.vm_chat_members cm ON cm.user_id=u.id
            JOIN {SCHEMA}.vm_chat_members cm2 ON cm2.chat_id=cm.chat_id AND cm2.user_id=%s
            WHERE u.id != %s
            ORDER BY u.display_name
        """, (user_id, user_id))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "contacts": [
            {"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "bio": r[4], "online": bool(r[5]), "avatar_url": r[6]}
            for r in rows
        ]})

    # update
    if action == "update":
        display_name = body.get("display_name")
        bio = body.get("bio")
        avatar_color = body.get("avatar_color")
        updates = []
        vals = []
        if display_name:
            updates.append("display_name=%s")
            vals.append(display_name.strip())
        if bio is not None:
            updates.append("bio=%s")
            vals.append(bio.strip())
        if avatar_color:
            updates.append("avatar_color=%s")
            vals.append(avatar_color.strip())
        if not updates:
            cur.close(); conn.close()
            return resp(400, {"error": "Нечего обновлять"})
        vals.append(user_id)
        cur.execute(f"UPDATE {SCHEMA}.vm_users SET {', '.join(updates)} WHERE id=%s RETURNING id, username, display_name, avatar_color, bio, avatar_url", vals)
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "user": format_user(row)})

    # update_avatar
    if action == "update_avatar":
        data_b64 = body.get("data")
        mime_type = body.get("mime_type", "image/jpeg")
        if not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет данных"})
        avatar_url = upload_avatar_to_s3(data_b64, mime_type)
        cur.execute(f"UPDATE {SCHEMA}.vm_users SET avatar_url=%s WHERE id=%s RETURNING id, username, display_name, avatar_color, bio, avatar_url", (avatar_url, user_id))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "user": format_user(row)})

    # block
    if action == "block":
        blocked_id = body.get("user_id")
        if not blocked_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет user_id"})
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_blocked_users (user_id, blocked_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, blocked_id)
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    cur.close(); conn.close()
    return resp(404, {"error": "Unknown action"})
