"""
API звонков V-message (WebRTC signaling).
Маршрутизация через ?action=initiate|get_incoming|accept|reject|end|send_offer|get_offer|send_answer|get_answer|add_ice|get_ice|get_status
"""
import json
import os
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
    return {
        "statusCode": status,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def get_user_by_token(cur, token: str):
    if not token:
        return None
    cur.execute(
        f"""SELECT u.id, u.username, u.display_name, u.avatar_color, u.avatar_url
            FROM {SCHEMA}.vm_sessions s
            JOIN {SCHEMA}.vm_users u ON u.id = s.user_id
            WHERE s.token = %s AND u.is_active = TRUE""",
        (token,),
    )
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    method = event.get("httpMethod", "GET")
    token = (event.get("headers") or {}).get("X-Session-Token") or (
        event.get("headers") or {}
    ).get("x-session-token")

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

    # ── 1. initiate ──────────────────────────────────────────────────────────
    if action == "initiate" and method == "POST":
        callee_id = body.get("callee_id")
        call_type = body.get("call_type", "audio")

        if not callee_id:
            cur.close(); conn.close()
            return resp(400, {"error": "callee_id обязателен"})

        if call_type not in ("audio", "video"):
            cur.close(); conn.close()
            return resp(400, {"error": "call_type должен быть 'audio' или 'video'"})

        if int(callee_id) == user_id:
            cur.close(); conn.close()
            return resp(400, {"error": "Нельзя звонить самому себе"})

        cur.execute(
            f"""
            INSERT INTO {SCHEMA}.vm_calls (caller_id, callee_id, call_type, status)
            VALUES (%s, %s, %s, 'ringing')
            RETURNING id
            """,
            (user_id, callee_id, call_type),
        )
        call_id = cur.fetchone()[0]
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True, "call_id": call_id})

    # ── 2. get_incoming ───────────────────────────────────────────────────────
    if action == "get_incoming" and method == "GET":
        cur.execute(
            f"""
            SELECT
                c.id, c.caller_id, c.call_type,
                u.display_name, u.avatar_color, u.avatar_url
            FROM {SCHEMA}.vm_calls c
            JOIN {SCHEMA}.vm_users u ON u.id = c.caller_id
            WHERE c.callee_id = %s
              AND c.status = 'ringing'
              AND c.created_at > NOW() - INTERVAL '30 seconds'
            ORDER BY c.created_at DESC
            LIMIT 1
            """,
            (user_id,),
        )
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return resp(200, {"ok": True, "call": None})

        return resp(200, {
            "ok": True,
            "call": {
                "id": row[0],
                "caller_id": row[1],
                "call_type": row[2],
                "caller_name": row[3],
                "caller_color": row[4],
                "caller_avatar": row[5],
            },
        })

    # ── 3. accept ─────────────────────────────────────────────────────────────
    if action == "accept" and method == "POST":
        call_id = body.get("call_id")
        answer = body.get("answer")

        if not call_id or not answer:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id и answer обязательны"})

        cur.execute(
            f"""
            UPDATE {SCHEMA}.vm_calls
            SET status = 'accepted', answer = %s, updated_at = NOW()
            WHERE id = %s AND callee_id = %s AND status = 'ringing'
            """,
            (answer, call_id, user_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 4. reject ─────────────────────────────────────────────────────────────
    if action == "reject" and method == "POST":
        call_id = body.get("call_id")

        if not call_id:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id обязателен"})

        cur.execute(
            f"""
            UPDATE {SCHEMA}.vm_calls
            SET status = 'rejected', updated_at = NOW()
            WHERE id = %s
              AND (callee_id = %s OR caller_id = %s)
              AND status IN ('ringing', 'accepted')
            """,
            (call_id, user_id, user_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 5. end ────────────────────────────────────────────────────────────────
    if action == "end" and method == "POST":
        call_id = body.get("call_id")

        if not call_id:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id обязателен"})

        cur.execute(
            f"""
            UPDATE {SCHEMA}.vm_calls
            SET status = 'ended', updated_at = NOW()
            WHERE id = %s AND (caller_id = %s OR callee_id = %s)
            """,
            (call_id, user_id, user_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 6. send_offer ─────────────────────────────────────────────────────────
    if action == "send_offer" and method == "POST":
        call_id = body.get("call_id")
        offer = body.get("offer")

        if not call_id or not offer:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id и offer обязательны"})

        cur.execute(
            f"""
            UPDATE {SCHEMA}.vm_calls
            SET offer = %s, updated_at = NOW()
            WHERE id = %s AND caller_id = %s
            """,
            (offer, call_id, user_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 7. get_offer ──────────────────────────────────────────────────────────
    if action == "get_offer" and method == "GET":
        call_id = qs.get("call_id")

        if not call_id:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id обязателен"})

        cur.execute(
            f"SELECT offer, status FROM {SCHEMA}.vm_calls WHERE id = %s AND callee_id = %s",
            (call_id, user_id),
        )
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return resp(404, {"error": "Звонок не найден"})

        return resp(200, {"ok": True, "offer": row[0], "status": row[1]})

    # ── 8. send_answer ────────────────────────────────────────────────────────
    if action == "send_answer" and method == "POST":
        call_id = body.get("call_id")
        answer = body.get("answer")

        if not call_id or not answer:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id и answer обязательны"})

        cur.execute(
            f"""
            UPDATE {SCHEMA}.vm_calls
            SET answer = %s, status = 'accepted', updated_at = NOW()
            WHERE id = %s AND callee_id = %s
            """,
            (answer, call_id, user_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 9. get_answer ─────────────────────────────────────────────────────────
    if action == "get_answer" and method == "GET":
        call_id = qs.get("call_id")

        if not call_id:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id обязателен"})

        cur.execute(
            f"SELECT answer, status FROM {SCHEMA}.vm_calls WHERE id = %s AND caller_id = %s",
            (call_id, user_id),
        )
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return resp(404, {"error": "Звонок не найден"})

        return resp(200, {"ok": True, "answer": row[0], "status": row[1]})

    # ── 10. add_ice ───────────────────────────────────────────────────────────
    if action == "add_ice" and method == "POST":
        call_id = body.get("call_id")
        candidate = body.get("candidate")
        role = body.get("role")

        if not call_id or candidate is None or role not in ("caller", "callee"):
            cur.close(); conn.close()
            return resp(400, {"error": "call_id, candidate и role ('caller'|'callee') обязательны"})

        if role == "caller":
            cur.execute(
                f"""
                UPDATE {SCHEMA}.vm_calls
                SET caller_ice = (
                    SELECT json_agg(elem)::text
                    FROM (
                        SELECT json_array_elements_text(COALESCE(caller_ice, '[]')::json) AS elem
                        UNION ALL
                        SELECT %s::text
                    ) sub
                ),
                updated_at = NOW()
                WHERE id = %s AND caller_id = %s
                """,
                (json.dumps(candidate), call_id, user_id),
            )
        else:
            cur.execute(
                f"""
                UPDATE {SCHEMA}.vm_calls
                SET callee_ice = (
                    SELECT json_agg(elem)::text
                    FROM (
                        SELECT json_array_elements_text(COALESCE(callee_ice, '[]')::json) AS elem
                        UNION ALL
                        SELECT %s::text
                    ) sub
                ),
                updated_at = NOW()
                WHERE id = %s AND callee_id = %s
                """,
                (json.dumps(candidate), call_id, user_id),
            )

        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    # ── 11. get_ice ───────────────────────────────────────────────────────────
    if action == "get_ice" and method == "GET":
        call_id = qs.get("call_id")
        role = qs.get("role")  # кто запрашивает

        if not call_id or role not in ("caller", "callee"):
            cur.close(); conn.close()
            return resp(400, {"error": "call_id и role ('caller'|'callee') обязательны"})

        # caller запрашивает -> возвращает callee_ice (и наоборот)
        if role == "caller":
            cur.execute(
                f"SELECT callee_ice FROM {SCHEMA}.vm_calls WHERE id = %s AND caller_id = %s",
                (call_id, user_id),
            )
        else:
            cur.execute(
                f"SELECT caller_ice FROM {SCHEMA}.vm_calls WHERE id = %s AND callee_id = %s",
                (call_id, user_id),
            )

        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return resp(404, {"error": "Звонок не найден"})

        raw = row[0]
        try:
            candidates = json.loads(raw) if raw else []
        except Exception:
            candidates = []

        # candidates — список JSON-строк, десериализуем каждый элемент
        result = []
        for item in candidates:
            try:
                result.append(json.loads(item) if isinstance(item, str) else item)
            except Exception:
                result.append(item)

        return resp(200, {"ok": True, "candidates": result})

    # ── 12. get_status ────────────────────────────────────────────────────────
    if action == "get_status" and method == "GET":
        call_id = qs.get("call_id")

        if not call_id:
            cur.close(); conn.close()
            return resp(400, {"error": "call_id обязателен"})

        cur.execute(
            f"""
            SELECT status, offer, answer
            FROM {SCHEMA}.vm_calls
            WHERE id = %s AND (caller_id = %s OR callee_id = %s)
            """,
            (call_id, user_id, user_id),
        )
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return resp(404, {"error": "Звонок не найден"})

        return resp(200, {
            "ok": True,
            "status": row[0],
            "has_offer": row[1] is not None and row[1] != "",
            "has_answer": row[2] is not None and row[2] != "",
        })

    # ── unknown action ────────────────────────────────────────────────────────
    cur.close(); conn.close()
    return resp(400, {"error": f"Неизвестный action: '{action}'"})