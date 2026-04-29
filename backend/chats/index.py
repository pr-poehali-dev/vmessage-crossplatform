"""
API чатов и сообщений V-message.
Маршрутизация через ?action=list|create|messages|send|send_media|search_public|join_by_invite|set_public|get_invite
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
    cur.execute(f"SELECT id, username, display_name, avatar_color FROM {SCHEMA}.vm_users WHERE session_token=%s AND is_active=TRUE", (token,))
    return cur.fetchone()


MIME_EXT = {
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm",
    "audio/mp4": "m4a", "audio/aac": "aac", "audio/flac": "flac",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "video/x-msvideo": "avi", "video/3gpp": "3gp",
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/heic": "heic",
    "application/pdf": "pdf",
    "application/zip": "zip", "application/x-zip-compressed": "zip",
    "application/vnd.android.package-archive": "apk",
    "application/x-apk": "apk",
    "application/octet-stream": "bin",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt", "text/csv": "csv",
}

def upload_to_s3(data_b64: str, mime_type: str, folder: str, filename: str = "") -> str:
    data = base64.b64decode(data_b64.replace(" ", "+").strip())
    # Определяем расширение
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()[:10]
    elif mime_type in MIME_EXT:
        ext = MIME_EXT[mime_type]
    else:
        raw = mime_type.split("/")[-1].split(";")[0].strip()
        ext = raw[:10] if raw else "bin"
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
                u2.is_active AS partner_active,
                u2.avatar_url AS partner_avatar,
                (SELECT msg_text FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id AND m.is_hidden=FALSE ORDER BY m.created_at DESC LIMIT 1) AS last_msg,
                (SELECT created_at FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_time,
                (SELECT COUNT(*) FROM {SCHEMA}.vm_messages m WHERE m.chat_id=c.id AND m.sender_id != %s AND m.msg_status='sent') AS unread,
                c.is_public,
                c.invite_code,
                u2.last_seen AS partner_last_seen,
                u2.id AS partner_id
            FROM {SCHEMA}.vm_chats c
            JOIN {SCHEMA}.vm_chat_members cm ON cm.chat_id=c.id AND cm.user_id=%s
            LEFT JOIN {SCHEMA}.vm_chat_members cm2 ON cm2.chat_id=c.id AND cm2.user_id != %s AND c.type='private'
            LEFT JOIN {SCHEMA}.vm_users u2 ON u2.id=cm2.user_id
            ORDER BY last_time DESC NULLS LAST
        """, (user_id, user_id, user_id))
        rows = cur.fetchall()
        chats = []
        for r in rows:
            is_private = r[1] == "private"
            partner_active = bool(r[8]) if r[8] is not None else True
            partner_online = bool(r[7]) if r[7] is not None else False

            if is_private:
                if not partner_active:
                    status = "inactive"
                elif partner_online:
                    status = "online"
                else:
                    status = "offline"
            else:
                status = "offline"

            chats.append({
                "id": r[0], "type": r[1],
                "name": r[4] if is_private else r[2],
                "avatar_color": r[5] if is_private else r[3],
                "username": r[6],
                "partner_id": r[16] if is_private else None,
                "online": partner_online if is_private else False,
                "user_status": status,
                "avatar_url": r[9] if is_private else None,
                "last_msg": r[10] or "",
                "last_time": r[11].strftime("%H:%M") if r[11] else "",
                "unread": int(r[12]) if r[12] else 0,
                "is_public": bool(r[13]),
                "invite_code": r[14],
                "partner_last_seen": r[15].isoformat() if r[15] else None,
            })
        cur.close()
        conn.close()
        return resp(200, {"ok": True, "chats": chats})

    # create
    if action == "create":
        chat_type = body.get("type", "private")
        partner_username = body.get("partner_username")

        if chat_type == "private" and partner_username:
            cur.execute(f"SELECT id, is_active FROM {SCHEMA}.vm_users WHERE username=%s", (partner_username.lower().strip(),))
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
            is_public = bool(body.get("is_public", False))
            invite_code = uuid.uuid4().hex[:16]
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_chats (type, name, created_by, is_public, invite_code) VALUES ('group', %s, %s, %s, %s) RETURNING id",
                (name, user_id, is_public, invite_code)
            )
            chat_id = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'admin')", (chat_id, user_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chat_id": chat_id, "invite_code": invite_code})

        if chat_type == "channel":
            name = body.get("name", "Канал")
            description = body.get("description", "")
            is_public = bool(body.get("is_public", False))
            invite_code = uuid.uuid4().hex[:16]
            cur.execute(
                f"INSERT INTO {SCHEMA}.vm_chats (type, name, description, created_by, is_public, invite_code) VALUES ('channel', %s, %s, %s, %s, %s) RETURNING id",
                (name, description, user_id, is_public, invite_code)
            )
            chat_id = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'admin')", (chat_id, user_id))
            conn.commit()
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chat_id": chat_id, "invite_code": invite_code})

        cur.close(); conn.close()
        return resp(400, {"error": "Неверные параметры"})

    # join_by_invite — вступить в чат по invite_code
    if action == "join_by_invite":
        invite_code = body.get("invite_code", "").strip()
        if not invite_code:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет invite_code"})

        cur.execute(f"SELECT id, type, name FROM {SCHEMA}.vm_chats WHERE invite_code=%s", (invite_code,))
        chat = cur.fetchone()
        if not chat:
            cur.close(); conn.close()
            return resp(404, {"error": "Чат не найден"})

        chat_id = chat[0]
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.execute(f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'member')", (chat_id, user_id))
            conn.commit()

        cur.close(); conn.close()
        return resp(200, {"ok": True, "chat_id": chat_id})

    # search_public — поиск публичных чатов
    if action == "search_public":
        q = (qs.get("q") or "").strip()
        if len(q) < 2:
            cur.close(); conn.close()
            return resp(400, {"error": "Минимум 2 символа"})
        cur.execute(
            f"""SELECT id, type, name, avatar_color, description, invite_code
                FROM {SCHEMA}.vm_chats
                WHERE is_public=TRUE AND name ILIKE %s AND type IN ('group','channel')
                LIMIT 20""",
            (f"%{q}%",)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "chats": [
            {"id": r[0], "type": r[1], "name": r[2], "avatar_color": r[3], "description": r[4], "invite_code": r[5]}
            for r in rows
        ]})

    # get_invite — получить ссылку приглашения
    if action == "get_invite":
        chat_id = int(qs.get("chat_id", 0))
        cur.execute(f"SELECT invite_code FROM {SCHEMA}.vm_chats WHERE id=%s", (chat_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return resp(404, {"error": "Чат не найден"})
        return resp(200, {"ok": True, "invite_code": row[0]})

    # set_public — сделать чат публичным/закрытым
    if action == "set_public":
        chat_id = body.get("chat_id")
        is_public = bool(body.get("is_public", False))
        cur.execute(
            f"UPDATE {SCHEMA}.vm_chats SET is_public=%s WHERE id=%s AND created_by=%s",
            (is_public, chat_id, user_id)
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # add_member — добавить участника в группу/канал
    if action == "add_member":
        chat_id = body.get("chat_id")
        username = (body.get("username") or "").strip().lower()
        if not chat_id or not username:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и username"})

        cur.execute(f"SELECT id FROM {SCHEMA}.vm_users WHERE username=%s AND is_active=TRUE", (username,))
        target = cur.fetchone()
        if not target:
            cur.close(); conn.close()
            return resp(404, {"error": "Пользователь не найден"})

        # Проверяем что текущий пользователь — участник чата
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_chat_members (chat_id, user_id, role) VALUES (%s, %s, 'member') ON CONFLICT DO NOTHING",
            (chat_id, target[0])
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

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

        # Проверяем блокировку в приватном чате
        cur.execute(f"""
            SELECT cm2.user_id FROM {SCHEMA}.vm_chat_members cm1
            JOIN {SCHEMA}.vm_chat_members cm2 ON cm2.chat_id=cm1.chat_id AND cm2.user_id != %s
            JOIN {SCHEMA}.vm_chats c ON c.id=cm1.chat_id
            WHERE cm1.chat_id=%s AND cm1.user_id=%s AND c.type='private'
            LIMIT 1
        """, (user_id, chat_id, user_id))
        partner_row = cur.fetchone()
        if partner_row:
            partner_id = partner_row[0]
            cur.execute(
                f"SELECT 1 FROM {SCHEMA}.vm_blocked_users WHERE user_id=%s AND blocked_id=%s",
                (partner_id, user_id)
            )
            if cur.fetchone():
                cur.close(); conn.close()
                return resp(403, {"error": "Пользователь вас заблокировал"})

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
        filename = body.get("filename", "")

        if not chat_id or not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и data"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        folder_map = {"voice": "voice", "video_note": "video_notes", "image": "images", "video": "videos", "file": "files", "location": ""}
        folder = folder_map.get(msg_type, "files")

        if msg_type == "location":
            media_url = None
        else:
            media_url = upload_to_s3(data_b64, mime_type, folder, filename)

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

    # upload_media — прямая загрузка файла через base64 (надёжнее presigned URL)
    if action == "upload_media":
        chat_id = body.get("chat_id")
        data_b64 = body.get("data", "")
        mime_type = body.get("mime_type", "application/octet-stream")
        msg_type = body.get("msg_type", "file")
        filename = body.get("filename", "")
        text = body.get("text", "")

        if not chat_id or not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и data"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        folder_map = {"voice": "voice", "video_note": "video_notes", "image": "images", "video": "videos", "file": "files", "audio": "audio"}
        folder = folder_map.get(msg_type, "files")

        if filename and "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()[:10]
        elif mime_type in MIME_EXT:
            ext = MIME_EXT[mime_type]
        else:
            raw = mime_type.split("/")[-1].split(";")[0].strip()
            ext = raw[:10] if raw else "bin"

        key = f"{folder}/{uuid.uuid4()}.{ext}"
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        file_data = base64.b64decode(data_b64)
        s3 = boto3.client(
            "s3",
            endpoint_url="https://bucket.poehali.dev",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        )
        s3.put_object(Bucket="files", Key=key, Body=file_data, ContentType=mime_type)
        print(f"[UPLOAD] msg_type={msg_type} key={key} size={len(file_data)}")

        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_messages (chat_id, sender_id, msg_text, msg_type, msg_status, media_url) VALUES (%s, %s, %s, %s, 'sent', %s) RETURNING id, created_at",
            (chat_id, user_id, text, msg_type, cdn_url)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "message": {
            "id": row[0], "time": row[1].strftime("%H:%M"),
            "text": text, "type": msg_type,
            "status": "sent", "out": True, "media_url": cdn_url
        }})

    # send_location — отправить геолокацию как текстовое сообщение
    if action == "send_location":
        chat_id = body.get("chat_id")
        lat = body.get("lat")
        lon = body.get("lon")
        address = body.get("address", "")

        if not chat_id or lat is None or lon is None:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id, lat, lon"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        location_text = json.dumps({"lat": lat, "lon": lon, "address": address})
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_messages (chat_id, sender_id, msg_text, msg_type, msg_status) VALUES (%s, %s, %s, 'location', 'sent') RETURNING id, created_at",
            (chat_id, user_id, location_text)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "message": {
            "id": row[0], "time": row[1].strftime("%H:%M"),
            "text": location_text, "type": "location",
            "status": "sent", "out": True
        }})

    # delete_chat — удалить приватный чат (для создателя) или покинуть группу/канал
    if action == "delete_chat":
        chat_id = body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})

        cur.execute(f"SELECT id, type, created_by FROM {SCHEMA}.vm_chats WHERE id=%s", (chat_id,))
        chat_row = cur.fetchone()
        if not chat_row:
            cur.close(); conn.close()
            return resp(404, {"error": "Чат не найден"})

        chat_id_val, chat_type, created_by = chat_row

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id_val, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        if chat_type == "private":
            # скрываем сообщения и удаляем участника
            cur.execute(f"UPDATE {SCHEMA}.vm_messages SET is_hidden=TRUE WHERE chat_id=%s", (chat_id_val,))
            cur.execute(f"DELETE FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id_val, user_id))
        else:
            # покидаем группу/канал
            cur.execute(f"DELETE FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id_val, user_id))
            # если создатель уходит и участников нет — удаляем чат
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s", (chat_id_val,))
            count = cur.fetchone()[0]
            if count == 0:
                cur.execute(f"DELETE FROM {SCHEMA}.vm_messages WHERE chat_id=%s", (chat_id_val,))
                cur.execute(f"DELETE FROM {SCHEMA}.vm_chats WHERE id=%s", (chat_id_val,))

        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    cur.close(); conn.close()
    return resp(404, {"error": "Unknown action"})