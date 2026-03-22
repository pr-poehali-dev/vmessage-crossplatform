"""
API чатов и сообщений V-message.
Маршрутизация через ?action=list|create|messages|send|send_media
"""
import json
import os
import base64
import boto3
import uuid
import psycopg2

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
    cur.execute(f"SELECT id, username, display_name, avatar_color FROM {SCHEMA}.vm_users WHERE session_token=%s", (token,))
    return cur.fetchone()


def upload_to_s3(data_b64: str, mime_type: str, folder: str) -> str:
    data = base64.b64decode(data_b64)
    ext = mime_type.split("/")[-1].replace("webm", "webm").replace("jpeg", "jpg").replace("quicktime", "mov")
    key = f"{folder}/{uuid.uuid4()}.{ext}"
    s3 = boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    s3.put_object(Bucket="files", Key=key, Body=data, ContentType=mime_type)
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return cdn_url


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    method = event.get("httpMethod", "GET")
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
        cur.close()
        conn.close()
        return resp(401, {"error": "Не авторизован"})

    user_id = user[0]

    # list
    if action == "list":
        cur.execute(f"""
            SELECT
                c.id, c.type, c.name, c.avatar_color,
                u2.display_name AS partner_name,
                u2.avatar_color AS partner_color,
                u2.username AS partner_username,
                u2.is_online AS partner_online,
                (SELECT msg_text FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id AND m.is_hidden=FALSE ORDER BY m.created_at DESC LIMIT 1) AS last_msg,
                (SELECT created_at FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_time,
                (SELECT COUNT(*) FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id AND m.sender_id != %s AND m.msg_status='sent') AS unread
            FROM {SCHEMA}.vm_chats c
            JOIN {SCHEMA}.vm_chat_members cm ON cm.chat_id=c.id AND cm.user_id=%s
            LEFT JOIN {SCHEMA}.vm_chat_members cm2 ON cm2.chat_id=c.id AND cm2.user_id != %s AND c.type='private'
            LEFT JOIN {SCHEMA}.vm_users u2 ON u2.id=cm2.user_id
            ORDER BY last_time DESC NULLS LAST
        """, (user_id, user_id, user_id))
        rows = cur.fetchall()
        chats = []
        for r in rows:
            chats.append({
                "id": r[0], "type": r[1],
                "name": r[4] if r[1] == "private" else r[2],
                "avatar_color": r[5] if r[1] == "private" else r[3],
                "username": r[6],
                "online": bool(r[7]) if r[1] == "private" else False,
                "last_msg": r[8] or "",
                "last_time": r[9].strftime("%H:%M") if r[9] else "",
                "unread": int(r[10]) if r[10] else 0,
            })
        cur.close()
        conn.close()
        return resp(200, {"ok": True, "chats": chats})

    # create
    if action == "create":
        chat_type = body.get("type", "private")
        partner_username = body.get("partner_username")

        if chat_type == "private" and partner_username:
            cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s", (partner_username.lower().strip(),))
            partner = cur.fetchone()
            if not partner:
                cur.close(); conn.close()
                return resp(404, {"error": "Пользователь не найден"})

            partner_id = partner[0]
            cur.execute(f"""
                SELECT c.id FROM {SCHEMA}.vm_chats c
                JOIN {SCHEMA}.vm_chat_members a ON a.chat_id=c.id AND a.user_id=%s
                JOIN {SCHEMA}.vm_chat_members b ON b.chat_id=c.id AND b.user_id=%s
                WHERE c.type='private' LIMIT 1
            """, (user_id, partner_id))
            existing = cur.fetchone()
            if existing:
                cur.close(); conn.close()
                return resp(200, {"ok": True, "chat_id": existing[0]})

            cur.execute(f"INSERT INTO {SCHEMA}.vm_chats (type, created_by) VALUES ('private', %s) RETURNING id", (user_id,))
            chat_id = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id) VALUES (%s, %s), (%s, %s)", (chat_id, user_id, chat_id, partner_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chat_id": chat_id})

        if chat_type == "group":
            name = body.get("name", "Группа")
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chats (type, name, created_by) VALUES ('group', %s, %s) RETURNING id", (name, user_id))
            chat_id = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'admin')", (chat_id, user_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chat_id": chat_id})

        if chat_type == "channel":
            name = body.get("name", "Канал")
            description = body.get("description", "")
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chats (type, name, description, created_by) VALUES ('channel', %s, %s, %s) RETURNING id", (name, description, user_id))
            chat_id = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'admin')", (chat_id, user_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chat_id": chat_id})

        cur.close(); conn.close()
        return resp(400, {"error": "Неверные параметры"})

    # messages
    if action == "messages":
        chat_id = qs.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        cur.execute(f"""
            SELECT m.id, m.msg_text, m.msg_type, m.msg_status, m.created_at, m.sender_id,
                   u.display_name, u.avatar_color, u.username,
                   (m.sender_id = %s) as is_out,
                   m.media_url
            FROM {SCHEMA}.vm_messages m
            JOIN {SCHEMA}.vm_users u ON u.id=m.sender_id
            WHERE m.chat_id=%s AND m.is_hidden=FALSE
            ORDER BY m.created_at ASC
            LIMIT 200
        """, (user_id, chat_id))
        rows = cur.fetchall()

        cur.execute(f"""
            UPDATE {SCHEMA}.vm_messages SET msg_status='delivered'
            WHERE chat_id=%s AND sender_id != %s AND msg_status='sent'
        """, (chat_id, user_id))
        conn.commit()

        messages = [{
            "id": r[0], "text": r[1], "type": r[2], "status": r[3],
            "time": r[4].strftime("%H:%M"),
            "sender_id": r[5], "sender_name": r[6],
            "sender_color": r[7], "sender_username": r[8],
            "out": bool(r[9]),
            "media_url": r[10],
        } for r in rows]

        cur.close(); conn.close()
        return resp(200, {"ok": True, "messages": messages})

    # send
    if action == "send":
        chat_id = body.get("chat_id")
        text = (body.get("text") or "").strip()
        if not chat_id or not text:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и text"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_messages (chat_id, sender_id, msg_text, msg_type, msg_status) VALUES (%s, %s, %s, 'text', 'sent') RETURNING id, created_at",
            (chat_id, user_id, text)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "message": {"id": row[0], "time": row[1].strftime("%H:%M"), "text": text, "type": "text", "status": "sent", "out": True}})

    # send_media
    if action == "send_media":
        chat_id = body.get("chat_id")
        data_b64 = body.get("data")
        mime_type = body.get("mime_type", "application/octet-stream")
        msg_type = body.get("msg_type", "file")
        text = body.get("text", "")

        if not chat_id or not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и data"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        folder_map = {"voice": "voice", "video_note": "video_notes", "image": "images", "video": "videos", "file": "files"}
        folder = folder_map.get(msg_type, "files")
        media_url = upload_to_s3(data_b64, mime_type, folder)

        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_messages (chat_id, sender_id, msg_text, msg_type, msg_status, media_url) VALUES (%s, %s, %s, %s, 'sent', %s) RETURNING id, created_at",
            (chat_id, user_id, text, msg_type, media_url)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "message": {
            "id": row[0], "time": row[1].strftime("%H:%M"),
            "text": text, "type": msg_type,
            "status": "sent", "out": True, "media_url": media_url
        }})

    cur.close(); conn.close()
    return resp(404, {"error": "Unknown action"})
