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
    cur.execute(
        f"""SELECT u.id, u.username, u.display_name, u.avatar_color
            FROM {SCHEMA}.vm_sessions s
            JOIN {SCHEMA}.vm_users u ON u.id = s.user_id
            WHERE s.token = %s AND u.is_active = TRUE""",
        (token,)
    )
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
                u2.id AS partner_id,
                c.avatar_url AS chat_avatar_url,
                (SELECT COUNT(*) FROM {SCHEMA}.vm_chat_members WHERE chat_id=c.id) AS members_count,
                cm.role AS my_role,
                c.members_can_write
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
                "avatar_url": r[9] if is_private else r[17],
                "last_msg": r[10] or "",
                "last_time": r[11].strftime("%H:%M") if r[11] else "",
                "unread": int(r[12]) if r[12] else 0,
                "is_public": bool(r[13]),
                "invite_code": r[14],
                "partner_last_seen": r[15].isoformat() if r[15] else None,
                "members_count": int(r[18]) if r[18] else 0,
                "my_role": r[19],
                "members_can_write": bool(r[20]) if r[20] is not None else True,
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
                   m.media_url, COALESCE(m.edited, FALSE)
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
            "edited": bool(r[11]),
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

        cur.execute(f"SELECT cm.role, c.type, c.members_can_write FROM {SCHEMA}.vm_chat_members cm JOIN {SCHEMA}.vm_chats c ON c.id=cm.chat_id WHERE cm.chat_id=%s AND cm.user_id=%s", (chat_id, user_id))
        member_row = cur.fetchone()
        if not member_row:
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        role, chat_type, members_can_write = member_row
        if chat_type in ("channel", "group") and not members_can_write and role not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Только администраторы могут писать"})

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

        cur.execute(f"SELECT cm.role, c.type, c.members_can_write FROM {SCHEMA}.vm_chat_members cm JOIN {SCHEMA}.vm_chats c ON c.id=cm.chat_id WHERE cm.chat_id=%s AND cm.user_id=%s", (chat_id, user_id))
        member_row = cur.fetchone()
        if not member_row:
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        sm_role, sm_type, sm_can_write = member_row
        if sm_type in ("channel", "group") and not sm_can_write and sm_role not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Только администраторы могут писать"})

        folder_map = {"voice": "voice", "video_note": "video_notes", "image": "images", "video": "videos", "file": "files", "audio": "audio", "location": ""}
        folder = folder_map.get(msg_type, "files")

        if msg_type == "location":
            media_url = None
        else:
            try:
                media_url = upload_to_s3(data_b64, mime_type, folder, filename)
            except Exception as e:
                print(f"[S3 ERROR send_media] {e}")
                cur.close(); conn.close()
                return resp(500, {"error": "Ошибка загрузки файла. Попробуйте ещё раз."})

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

    # upload_media — прямая загрузка файла через base64
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

        # Определяем расширение
        if filename and "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()[:10]
        elif mime_type in MIME_EXT:
            ext = MIME_EXT[mime_type]
        else:
            raw = mime_type.split("/")[-1].split(";")[0].strip()
            ext = raw[:10] if raw else "bin"

        key = f"{folder}/{uuid.uuid4()}.{ext}"
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        try:
            file_data = base64.b64decode(data_b64)
        except Exception as e:
            print(f"[BASE64 ERROR] {e}")
            cur.close(); conn.close()
            return resp(400, {"error": "Ошибка декодирования файла"})

        try:
            s3 = boto3.client(
                "s3",
                endpoint_url="https://bucket.poehali.dev",
                aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
            )
            s3.put_object(Bucket="files", Key=key, Body=file_data, ContentType=mime_type)
            print(f"[UPLOAD] msg_type={msg_type} ext={ext} size={len(file_data)}")
        except Exception as e:
            print(f"[S3 ERROR upload_media] {e}")
            cur.close(); conn.close()
            return resp(500, {"error": "Ошибка загрузки файла. Попробуйте ещё раз."})

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

    # upload_chunk — загрузка файла частями (для видео/больших файлов > 4MB)
    # Схема: клиент шлёт chunks с upload_id, последний chunk с is_last=True → сохраняется сообщение
    if action == "upload_chunk":
        upload_id  = body.get("upload_id", "")    # уникальный ID загрузки (генерирует клиент)
        chunk_idx  = int(body.get("chunk_idx", 0)) # номер чанка 0,1,2...
        is_last    = bool(body.get("is_last", False))
        data_b64   = body.get("data", "")
        # Метаданные — только в первом чанке или в последнем
        chat_id    = body.get("chat_id")
        mime_type  = body.get("mime_type", "application/octet-stream")
        msg_type   = body.get("msg_type", "file")
        filename   = body.get("filename", "")
        text       = body.get("text", "")
        total_chunks = int(body.get("total_chunks", 1))

        if not upload_id or not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен upload_id и data"})

        # Декодируем чанк
        try:
            chunk_data = base64.b64decode(data_b64)
        except Exception as e:
            print(f"[CHUNK BASE64 ERROR] {e}")
            cur.close(); conn.close()
            return resp(400, {"error": "Ошибка декодирования чанка"})

        s3 = boto3.client(
            "s3",
            endpoint_url="https://bucket.poehali.dev",
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        )

        # Определяем расширение и ключ
        if filename and "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()[:10]
        elif mime_type in MIME_EXT:
            ext = MIME_EXT[mime_type]
        else:
            raw = mime_type.split("/")[-1].split(";")[0].strip()
            ext = raw[:10] if raw else "bin"

        folder_map = {"voice": "voice", "video_note": "video_notes", "image": "images", "video": "videos", "file": "files", "audio": "audio"}
        folder = folder_map.get(msg_type, "files")

        # Чанк сохраняем как временный объект
        chunk_key = f"tmp_chunks/{upload_id}/chunk_{chunk_idx:04d}"
        try:
            s3.put_object(Bucket="files", Key=chunk_key, Body=chunk_data, ContentType="application/octet-stream")
        except Exception as e:
            print(f"[CHUNK S3 ERROR] {e}")
            cur.close(); conn.close()
            return resp(500, {"error": "Ошибка сохранения чанка"})

        if not is_last:
            cur.close(); conn.close()
            return resp(200, {"ok": True, "chunk_saved": chunk_idx})

        # Последний чанк — собираем все части
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id в последнем чанке"})

        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})

        # Собираем все чанки в один файл
        final_key = f"{folder}/{upload_id}.{ext}"
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{final_key}"

        try:
            all_data = bytearray()
            for i in range(total_chunks):
                ck = f"tmp_chunks/{upload_id}/chunk_{i:04d}"
                obj = s3.get_object(Bucket="files", Key=ck)
                all_data.extend(obj["Body"].read())
                # Удаляем временный чанк
                s3.delete_object(Bucket="files", Key=ck)

            s3.put_object(Bucket="files", Key=final_key, Body=bytes(all_data), ContentType=mime_type)
            print(f"[CHUNK UPLOAD DONE] upload_id={upload_id} msg_type={msg_type} size={len(all_data)}")
        except Exception as e:
            print(f"[CHUNK ASSEMBLE ERROR] {e}")
            cur.close(); conn.close()
            return resp(500, {"error": "Ошибка сборки файла"})

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

    # clear_history — очистить историю чата (сообщения скрываются для пользователя)
    if action == "clear_history":
        chat_id = body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        cur.execute(f"UPDATE {SCHEMA}.vm_messages SET is_hidden=TRUE WHERE chat_id=%s", (chat_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # edit_message — редактировать своё сообщение (в течение 15 минут)
    if action == "edit_message":
        msg_id = body.get("message_id")
        new_text = (body.get("text") or "").strip()
        if not msg_id or not new_text:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен message_id и text"})
        cur.execute(
            f"""SELECT id, msg_type, created_at FROM {SCHEMA}.vm_messages
                WHERE id=%s AND sender_id=%s AND is_hidden=FALSE""",
            (msg_id, user_id)
        )
        msg_row = cur.fetchone()
        if not msg_row:
            cur.close(); conn.close()
            return resp(404, {"error": "Сообщение не найдено"})
        if msg_row[1] not in ("text", "reply"):
            cur.close(); conn.close()
            return resp(400, {"error": "Редактировать можно только текстовые сообщения"})
        import datetime
        age = (datetime.datetime.now(datetime.timezone.utc) - msg_row[2]).total_seconds()
        if age > 900:  # 15 минут
            cur.close(); conn.close()
            return resp(403, {"error": "Сообщение можно редактировать только в течение 15 минут"})
        cur.execute(
            f"UPDATE {SCHEMA}.vm_messages SET msg_text=%s, edited=TRUE WHERE id=%s",
            (new_text, msg_id)
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "text": new_text})

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

    # get_chat_info — информация о чате с числом участников и своей ролью
    if action == "get_chat_info":
        chat_id = qs.get("chat_id") or body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})
        cur.execute(
            f"SELECT c.id, c.type, c.name, c.description, c.avatar_color, c.avatar_url, c.is_public, c.invite_code, c.members_can_write, cm.role FROM {SCHEMA}.vm_chats c JOIN {SCHEMA}.vm_chat_members cm ON cm.chat_id=c.id WHERE c.id=%s AND cm.user_id=%s",
            (chat_id, user_id)
        )
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s", (chat_id,))
        count = cur.fetchone()[0]
        cur.close(); conn.close()
        return resp(200, {"ok": True, "chat": {
            "id": row[0], "type": row[1], "name": row[2], "description": row[3],
            "avatar_color": row[4], "avatar_url": row[5], "is_public": row[6],
            "invite_code": row[7], "members_can_write": row[8], "my_role": row[9],
            "members_count": int(count)
        }})

    # get_members — список участников
    if action == "get_members":
        chat_id = qs.get("chat_id") or body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        cur.execute(
            f"""SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url, cm.role, u.is_online
                FROM {SCHEMA}.vm_chat_members cm
                JOIN {SCHEMA}.vm_users u ON u.id=cm.user_id
                WHERE cm.chat_id=%s ORDER BY cm.role DESC, u.display_name ASC""",
            (chat_id,)
        )
        rows = cur.fetchall()
        cur.close(); conn.close()
        members = [{"id": r[0], "username": r[1], "display_name": r[2], "avatar_color": r[3], "avatar_url": r[4], "role": r[5], "online": bool(r[6])} for r in rows]
        return resp(200, {"ok": True, "members": members})

    # update_chat — обновить название, описание, аватар, права записи
    if action == "update_chat":
        chat_id = body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нет chat_id"})
        cur.execute(f"SELECT role FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        row = cur.fetchone()
        if not row or row[0] not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Только администраторы могут редактировать чат"})

        updates = []
        params = []
        if "name" in body and body["name"]:
            updates.append("name=%s"); params.append(body["name"][:100])
        if "description" in body:
            updates.append("description=%s"); params.append(body["description"][:500])
        if "members_can_write" in body:
            updates.append("members_can_write=%s"); params.append(bool(body["members_can_write"]))
        if "avatar_data" in body and body["avatar_data"]:
            mime = body.get("avatar_mime", "image/jpeg")
            avatar_url = upload_to_s3(body["avatar_data"], mime, "chat_avatars")
            updates.append("avatar_url=%s"); params.append(avatar_url)

        if updates:
            params.append(chat_id)
            cur.execute(f"UPDATE {SCHEMA}.vm_chats SET {', '.join(updates)} WHERE id=%s", params)
            conn.commit()

        cur.execute(f"SELECT id, type, name, description, avatar_color, avatar_url, is_public, members_can_write FROM {SCHEMA}.vm_chats WHERE id=%s", (chat_id,))
        r = cur.fetchone()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "chat": {"id": r[0], "type": r[1], "name": r[2], "description": r[3], "avatar_color": r[4], "avatar_url": r[5], "is_public": r[6], "members_can_write": r[7]}})

    # set_member_role — назначить/снять роль участника
    if action == "set_member_role":
        chat_id = body.get("chat_id")
        target_user_id = body.get("user_id")
        new_role = body.get("role", "member")
        if not chat_id or not target_user_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и user_id"})
        if new_role not in ("owner", "admin", "member"):
            cur.close(); conn.close()
            return resp(400, {"error": "Роль должна быть owner/admin/member"})
        cur.execute(f"SELECT role FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        row = cur.fetchone()
        if not row or row[0] not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Нет прав"})
        cur.execute(f"UPDATE {SCHEMA}.vm_chat_members SET role=%s WHERE chat_id=%s AND user_id=%s", (new_role, chat_id, target_user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # kick_member — исключить участника
    if action == "kick_member":
        chat_id = body.get("chat_id")
        target_user_id = body.get("user_id")
        if not chat_id or not target_user_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и user_id"})
        cur.execute(f"SELECT role FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        row = cur.fetchone()
        if not row or row[0] not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Нет прав"})
        cur.execute(f"SELECT role FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, target_user_id))
        target = cur.fetchone()
        if target and target[0] == "owner":
            cur.close(); conn.close()
            return resp(403, {"error": "Нельзя исключить владельца"})
        cur.execute(f"DELETE FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, target_user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # grant_write — выдать право на запись конкретному пользователю в канале
    if action == "grant_write":
        chat_id = body.get("chat_id")
        target_user_id = body.get("user_id")
        if not chat_id or not target_user_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и user_id"})
        cur.execute(f"SELECT role FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        row = cur.fetchone()
        if not row or row[0] not in ("owner", "admin"):
            cur.close(); conn.close()
            return resp(403, {"error": "Нет прав"})
        cur.execute(f"UPDATE {SCHEMA}.vm_chat_members SET role='admin' WHERE chat_id=%s AND user_id=%s", (chat_id, target_user_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # delete_message — удалить своё сообщение
    if action == "delete_message":
        msg_id = body.get("message_id")
        if not msg_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен message_id"})
        cur.execute(f"SELECT sender_id FROM {SCHEMA}.vm_messages WHERE id=%s", (msg_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(404, {"error": "Сообщение не найдено"})
        if row[0] != user_id:
            cur.close(); conn.close()
            return resp(403, {"error": "Можно удалять только свои сообщения"})
        cur.execute(f"UPDATE {SCHEMA}.vm_messages SET is_hidden=TRUE WHERE id=%s", (msg_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # toggle_reaction — поставить/убрать реакцию на сообщение
    if action == "toggle_reaction":
        msg_id = body.get("message_id")
        emoji = (body.get("emoji") or "").strip()
        if not msg_id or not emoji:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен message_id и emoji"})
        # Проверяем доступ к чату через сообщение
        cur.execute(f"SELECT chat_id FROM {SCHEMA}.vm_messages WHERE id=%s AND is_hidden=FALSE", (msg_id,))
        msg_row = cur.fetchone()
        if not msg_row:
            cur.close(); conn.close()
            return resp(404, {"error": "Сообщение не найдено"})
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (msg_row[0], user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        # Проверяем существующую реакцию
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_message_reactions WHERE message_id=%s AND user_id=%s AND emoji=%s", (msg_id, user_id, emoji))
        existing = cur.fetchone()
        if existing:
            # Убираем реакцию
            cur.execute(f"UPDATE {SCHEMA}.vm_message_reactions SET emoji=emoji WHERE id=%s", (existing[0],))
            cur.execute(f"DELETE FROM {SCHEMA}.vm_message_reactions WHERE id=%s", (existing[0],))
            action_done = "removed"
        else:
            cur.execute(f"INSERT INTO {SCHEMA}.vm_message_reactions (message_id, user_id, emoji) VALUES (%s, %s, %s)", (msg_id, user_id, emoji))
            action_done = "added"
        conn.commit()
        # Возвращаем обновлённые реакции
        cur.execute(f"SELECT emoji, COUNT(*) as cnt, bool_or(user_id=%s) as my FROM {SCHEMA}.vm_message_reactions WHERE message_id=%s GROUP BY emoji ORDER BY cnt DESC", (user_id, msg_id))
        reactions = [{"emoji": r[0], "count": int(r[1]), "my": bool(r[2])} for r in cur.fetchall()]
        cur.close(); conn.close()
        return resp(200, {"ok": True, "action": action_done, "reactions": reactions})

    # get_reactions — получить реакции для списка сообщений
    if action == "get_reactions":
        chat_id = qs.get("chat_id") or body.get("chat_id")
        if not chat_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id"})
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        cur.execute(f"""
            SELECT r.message_id, r.emoji, COUNT(*) as cnt, bool_or(r.user_id=%s) as my
            FROM {SCHEMA}.vm_message_reactions r
            JOIN {SCHEMA}.vm_messages m ON m.id=r.message_id
            WHERE m.chat_id=%s AND m.is_hidden=FALSE
            GROUP BY r.message_id, r.emoji
            ORDER BY r.message_id, cnt DESC
        """, (user_id, chat_id))
        rows = cur.fetchall()
        cur.close(); conn.close()
        result = {}
        for r in rows:
            mid = str(r[0])
            if mid not in result:
                result[mid] = []
            result[mid].append({"emoji": r[1], "count": int(r[2]), "my": bool(r[3])})
        return resp(200, {"ok": True, "reactions": result})

    # sticker actions — get_sticker_packs, get_my_packs, create_pack, add_sticker, send_sticker, add_pack, remove_pack
    if action == "get_sticker_packs":
        cur.execute(f"""
            SELECT sp.id, sp.name, sp.cover_url, sp.owner_id, sp.is_public,
                   (SELECT COUNT(*) FROM {SCHEMA}.vm_stickers WHERE pack_id=sp.id) as cnt,
                   (SELECT 1 FROM {SCHEMA}.vm_user_sticker_packs usp WHERE usp.pack_id=sp.id AND usp.user_id=%s LIMIT 1) as has
            FROM {SCHEMA}.vm_sticker_packs sp
            WHERE sp.is_public=TRUE OR sp.owner_id=%s
            ORDER BY sp.created_at DESC
        """, (user_id, user_id))
        rows = cur.fetchall()
        cur.close(); conn.close()
        packs = [{"id": r[0], "name": r[1], "cover_url": r[2], "owner_id": r[3], "is_public": bool(r[4]), "sticker_count": int(r[5] or 0), "has": bool(r[6])} for r in rows]
        return resp(200, {"ok": True, "packs": packs})

    if action == "get_my_packs":
        cur.execute(f"""
            SELECT sp.id, sp.name, sp.cover_url, sp.owner_id, sp.is_public,
                   (SELECT COUNT(*) FROM {SCHEMA}.vm_stickers WHERE pack_id=sp.id) as cnt
            FROM {SCHEMA}.vm_sticker_packs sp
            JOIN {SCHEMA}.vm_user_sticker_packs usp ON usp.pack_id=sp.id AND usp.user_id=%s
            ORDER BY sp.name
        """, (user_id,))
        rows = cur.fetchall()
        # Стикеры для каждого пака
        packs = []
        for r in rows:
            cur.execute(f"SELECT id, image_url, emoji, position FROM {SCHEMA}.vm_stickers WHERE pack_id=%s ORDER BY position, id", (r[0],))
            stickers = [{"id": s[0], "image_url": s[1], "emoji": s[2], "position": s[3]} for s in cur.fetchall()]
            packs.append({"id": r[0], "name": r[1], "cover_url": r[2], "owner_id": r[3], "is_public": bool(r[4]), "sticker_count": int(r[5] or 0), "stickers": stickers})
        cur.close(); conn.close()
        return resp(200, {"ok": True, "packs": packs})

    if action == "create_pack":
        name = (body.get("name") or "").strip()
        is_public = bool(body.get("is_public", False))
        if not name or len(name) < 2:
            cur.close(); conn.close()
            return resp(400, {"error": "Название пака минимум 2 символа"})
        cover_url = None
        if body.get("cover_data"):
            cover_url = upload_to_s3(body["cover_data"], body.get("cover_mime", "image/png"), "stickers")
        cur.execute(f"INSERT INTO {SCHEMA}.vm_sticker_packs (owner_id, name, cover_url, is_public) VALUES (%s, %s, %s, %s) RETURNING id", (user_id, name, cover_url, is_public))
        pack_id = cur.fetchone()[0]
        cur.execute(f"INSERT INTO {SCHEMA}.vm_user_sticker_packs (user_id, pack_id) VALUES (%s, %s)", (user_id, pack_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "pack_id": pack_id})

    if action == "add_sticker":
        pack_id = body.get("pack_id")
        data_b64 = body.get("data")
        emoji_tag = (body.get("emoji") or "").strip()
        if not pack_id or not data_b64:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен pack_id и data"})
        cur.execute(f"SELECT owner_id FROM {SCHEMA}.vm_sticker_packs WHERE id=%s", (pack_id,))
        pack_row = cur.fetchone()
        if not pack_row or pack_row[0] != user_id:
            cur.close(); conn.close()
            return resp(403, {"error": "Нет прав на этот пак"})
        try:
            image_url = upload_to_s3(data_b64, body.get("mime_type", "image/png"), "stickers")
        except Exception as e:
            print(f"[S3 ERROR add_sticker] {e}")
            cur.close(); conn.close()
            return resp(500, {"error": "Ошибка загрузки стикера"})
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.vm_stickers WHERE pack_id=%s", (pack_id,))
        pos = cur.fetchone()[0]
        cur.execute(
            f"INSERT INTO {SCHEMA}.vm_stickers (pack_id, image_url, media_url, emoji, position) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (pack_id, image_url, image_url, emoji_tag, pos)
        )
        sticker_id = cur.fetchone()[0]
        if pos == 0:
            cur.execute(f"UPDATE {SCHEMA}.vm_sticker_packs SET cover_url=%s WHERE id=%s", (image_url, pack_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "sticker_id": sticker_id, "image_url": image_url})

    if action == "add_pack":
        pack_id = body.get("pack_id")
        if not pack_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен pack_id"})
        cur.execute(f"SELECT id FROM {SCHEMA}.vm_sticker_packs WHERE id=%s AND is_public=TRUE", (pack_id,))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(404, {"error": "Пак не найден"})
        cur.execute(f"INSERT INTO {SCHEMA}.vm_user_sticker_packs (user_id, pack_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, pack_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    if action == "remove_pack":
        pack_id = body.get("pack_id")
        if not pack_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен pack_id"})
        cur.execute(f"UPDATE {SCHEMA}.vm_user_sticker_packs SET user_id=user_id WHERE user_id=%s AND pack_id=%s", (user_id, pack_id))
        cur.execute(f"DELETE FROM {SCHEMA}.vm_user_sticker_packs WHERE user_id=%s AND pack_id=%s", (user_id, pack_id))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    if action == "send_sticker":
        chat_id = body.get("chat_id")
        sticker_id = body.get("sticker_id")
        if not chat_id or not sticker_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нужен chat_id и sticker_id"})
        cur.execute(f"SELECT 1 FROM {SCHEMA}.vm_chat_members WHERE chat_id=%s AND user_id=%s", (chat_id, user_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            return resp(403, {"error": "Нет доступа"})
        cur.execute(f"SELECT image_url, emoji FROM {SCHEMA}.vm_stickers WHERE id=%s", (sticker_id,))
        sticker_row = cur.fetchone()
        if not sticker_row:
            cur.close(); conn.close()
            return resp(404, {"error": "Стикер не найден"})
        image_url, emoji_tag = sticker_row
        text = f"sticker:{sticker_id}"
        cur.execute(f"INSERT INTO {SCHEMA}.vm_messages (chat_id, sender_id, msg_text, msg_type, msg_status, media_url) VALUES (%s, %s, %s, 'sticker', 'sent', %s) RETURNING id, created_at", (chat_id, user_id, text, image_url))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "message": {"id": row[0], "time": row[1].strftime("%H:%M"), "text": text, "type": "sticker", "status": "sent", "out": True, "media_url": image_url}})

    cur.close(); conn.close()
    return resp(404, {"error": "Unknown action"})