"""Compatible /api endpoints for the original CourtMate React application.

Authentication and role management were not present in the uploaded frontend and
are intentionally NOT invented by this migration. Protect access at the network
layer; do not publish this API on an unauthenticated public network.
"""

import os
import hashlib
import json
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .database import get_db
from .models import ClubSession, Match, MatchScoreHistory, Member
from .schemas import MemberInput, ScoreInput, SessionInput
from .serializers import match_json, member_json, session_json

app = FastAPI(title="CourtMate API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type", "Idempotency-Key"])

DB = Annotated[Session, Depends(get_db)]


@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc: RequestValidationError):
    first = exc.errors()[0]
    message = first.get("msg", "요청 데이터가 올바르지 않습니다.")
    if message.startswith("Value error, "):
        message = message[len("Value error, "):]
    return JSONResponse({"error": message}, status_code=400)


@app.exception_handler(IntegrityError)
async def integrity_error(_request, _exc: IntegrityError):
    return JSONResponse({"error": "참조 관계나 중복 제약을 위반했습니다."}, status_code=409)


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _exc: SQLAlchemyError):
    # Do not disclose SQL / database credentials in HTTP responses.
    return JSONResponse({"error": "데이터베이스 처리 중 오류가 발생했습니다."}, status_code=500)


def not_found(msg: str):
    raise HTTPException(status_code=404, detail=msg)


@app.exception_handler(HTTPException)
async def http_error(_request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.get("/api/health")
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"ok": True, "database": "connected"}


# ---------------- Members ----------------
@app.get("/api/members")
def get_members(db: DB):
    return [member_json(m) for m in db.scalars(select(Member).order_by(Member.name, Member.id)).all()]


@app.post("/api/members", status_code=201)
def create_member(payload: MemberInput, db: DB):
    with db.begin():
        m = Member(
            name=payload.name, gender=payload.gender,
            level=round(payload.level, 1), phone=payload.phone, memo=payload.memo,
            active=payload.active, joined_at=payload.joinedAt,
        )
        db.add(m)
        db.flush()
        result = member_json(m)
    return result


@app.put("/api/members/{member_id}")
def update_member(member_id: int, payload: MemberInput, db: DB):
    with db.begin():
        m = db.get(Member, member_id)
        if m is None:
            not_found("회원을 찾을 수 없습니다.")
        m.name = payload.name
        m.gender = payload.gender
        m.level = round(payload.level, 1)
        m.phone = payload.phone
        m.memo = payload.memo
        m.active = payload.active
        m.joined_at = payload.joinedAt
        db.flush()
        result = member_json(m)
    return result


@app.delete("/api/members/{member_id}")
def delete_member(member_id: int, db: DB):
    with db.begin():
        m = db.get(Member, member_id)
        if m is None:
            # Original API returned deleted:true even when absent.
            return {"deleted": True}
        used = db.scalar(select(func.count()).select_from(Match).where(or_(
            Match.team_a1 == member_id, Match.team_a2 == member_id,
            Match.team_b1 == member_id, Match.team_b2 == member_id,
        )))
        if used:
            m.active = False
            db.flush()
            result = {"archived": True, "member": member_json(m)}
        else:
            db.delete(m)
            result = {"deleted": True}
    return result


# ---------------- Sessions ----------------
@app.get("/api/sessions")
def get_sessions(db: DB):
    return [session_json(s) for s in db.scalars(
        select(ClubSession).order_by(ClubSession.play_date.desc(), ClubSession.id.desc())
    ).all()]


def check_draft(payload: SessionInput, db: Session):
    seen_courts = set()
    seen_players = defaultdict(set)
    all_players = set()
    rounds = set()
    for m in payload.matches:
        if m.court > payload.courts:
            raise HTTPException(400, "모임에 설정한 코트 수를 초과했습니다.")
        if payload.format == "doubles":
            if m.teamA2 is None or m.teamB2 is None or m.teamA2 <= 0 or m.teamB2 <= 0:
                raise HTTPException(400, "복식 경기는 선수 네 명이 필요합니다.")
            ids = [m.teamA1, m.teamA2, m.teamB1, m.teamB2]
        else:
            if m.teamA2 is not None or m.teamB2 is not None:
                raise HTTPException(400, "단식 대진에는 두 명만 지정할 수 있습니다.")
            ids = [m.teamA1, m.teamB1]
        if len(ids) != len(set(ids)):
            raise HTTPException(400, "한 경기에 같은 회원이 중복되었습니다.")
        court_key = (m.round, m.court)
        if court_key in seen_courts:
            raise HTTPException(400, "같은 라운드의 코트가 중복되었습니다.")
        seen_courts.add(court_key)
        for person_id in ids:
            if person_id in seen_players[m.round]:
                raise HTTPException(400, f"{m.round}라운드에 같은 회원이 중복 배정되었습니다.")
            seen_players[m.round].add(person_id)
            all_players.add(person_id)
        rounds.add(m.round)
    if rounds != set(range(1, max(rounds) + 1)):
        raise HTTPException(400, "라운드 번호는 1부터 연속되어야 합니다.")
    active_ids = set(db.scalars(select(Member.id).where(Member.id.in_(all_players), Member.active.is_(True))).all())
    if active_ids != all_players:
        raise HTTPException(400, "없는 회원 또는 휴면 회원이 대진에 포함되어 있습니다.")


@app.post("/api/sessions", status_code=201)
def create_session(
    payload: SessionInput, db: DB,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    request_hash = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    if idempotency_key is not None:
        idempotency_key = idempotency_key.strip()
        if not (8 <= len(idempotency_key) <= 80):
            raise HTTPException(400, "Idempotency-Key는 8~80자여야 합니다.")
    try:
        with db.begin():
            if idempotency_key:
                existing = db.scalar(select(ClubSession).where(ClubSession.request_key == idempotency_key))
                if existing:
                    if existing.request_hash != request_hash:
                        raise HTTPException(409, "같은 요청 키에 다른 대진 데이터가 사용되었습니다.")
                    return JSONResponse(session_json(existing), status_code=200)
            check_draft(payload, db)
            s = ClubSession(
                title=payload.title, play_date=payload.playDate,
                format=payload.format, courts=payload.courts,
                request_key=idempotency_key, request_hash=request_hash if idempotency_key else None,
            )
            db.add(s)
            db.flush()
            for m in payload.matches:
                db.add(Match(
                    session_id=s.id, round=m.round, court=m.court,
                    team_a1=m.teamA1, team_a2=m.teamA2,
                    team_b1=m.teamB1, team_b2=m.teamB2,
                    score_a=None, score_b=None,
                ))
            db.flush()
            result = session_json(s)
        return JSONResponse(result, status_code=201)
    except IntegrityError as exc:
        db.rollback()
        if idempotency_key:
            existing = db.scalar(select(ClubSession).where(ClubSession.request_key == idempotency_key))
            if existing is not None:
                if existing.request_hash != request_hash:
                    raise HTTPException(409, "같은 요청 키에 다른 대진 데이터가 사용되었습니다.")
                return JSONResponse(session_json(existing), status_code=200)
        raise HTTPException(409, "중복 또는 충돌하는 대진 데이터입니다.") from exc


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int, db: DB):
    with db.begin():
        s = db.get(ClubSession, session_id)
        if s:
            db.delete(s)  # DB foreign key cascades to matches and their score history.
    return {"deleted": True}


# ---------------- Matches ----------------
@app.get("/api/matches")
def get_matches(db: DB, sessionId: int | None = Query(default=None, gt=0)):
    statement = select(Match)
    if sessionId is not None:
        statement = statement.where(Match.session_id == sessionId)
    statement = statement.order_by(Match.session_id, Match.round, Match.court)
    return [match_json(m) for m in db.scalars(statement).all()]


@app.delete("/api/matches/{match_id}")
def delete_match(match_id: int, db: DB):
    with db.begin():
        m = db.get(Match, match_id)
        if m is None:
            not_found("경기를 찾을 수 없습니다.")
        db.delete(m)
    return {"deleted": True}


def locked_session_query(session_id: int, db: Session):
    stmt = select(ClubSession).where(ClubSession.id == session_id)
    if db.bind and db.bind.dialect.name == "mssql":
        stmt = stmt.with_hint(ClubSession, "WITH (UPDLOCK, HOLDLOCK)", dialect_name="mssql")
    return stmt


@app.delete("/api/sessions/{session_id}/rounds/{round_num}")
def delete_round(session_id: int, round_num: int, db: DB):
    if round_num < 1:
        raise HTTPException(400, "라운드 정보가 올바르지 않습니다.")
    with db.begin():
        s = db.scalar(locked_session_query(session_id, db))
        if s is None:
            not_found("모임을 찾을 수 없습니다.")
        ids = db.scalars(select(Match.id).where(
            Match.session_id == session_id, Match.round == round_num,
        )).all()
        if not ids:
            not_found("라운드를 찾을 수 없습니다.")
        db.execute(delete(Match).where(Match.id.in_(ids)))
        # Shift in ascending order to avoid unique(session, round, court) collisions.
        later = db.scalars(select(Match.round).where(
            Match.session_id == session_id, Match.round > round_num,
        ).distinct().order_by(Match.round)).all()
        for old_round in later:
            db.execute(update(Match).where(
                Match.session_id == session_id, Match.round == old_round,
            ).values(round=old_round - 1))
    return {"deleted": len(ids)}


@app.put("/api/matches/{match_id}/score")
def put_score(match_id: int, payload: ScoreInput, db: DB):
    clear = payload.scoreA is None and payload.scoreB is None
    if not clear and (
        payload.scoreA is None or payload.scoreB is None or
        not 0 <= payload.scoreA <= 99 or not 0 <= payload.scoreB <= 99
    ):
        raise HTTPException(400, "점수를 0~99 사이 숫자로 입력해 주세요.")
    with db.begin():
        m = db.get(Match, match_id)
        if m is None:
            not_found("경기를 찾을 수 없습니다.")
        expected = m.score_version if payload.scoreVersion is None else payload.scoreVersion
        if m.score_version != expected:
            raise HTTPException(409, "다른 사용자가 먼저 점수를 수정했습니다. 새로고침 후 다시 시도하세요.")
        if (m.score_a, m.score_b) == (payload.scoreA, payload.scoreB):
            return match_json(m)
        old_a, old_b, old_version = m.score_a, m.score_b, m.score_version
        updated = db.execute(update(Match).where(
            Match.id == match_id, Match.score_version == expected,
        ).values(score_a=payload.scoreA, score_b=payload.scoreB, score_version=Match.score_version + 1))
        if updated.rowcount != 1:
            raise HTTPException(409, "점수가 다른 사용자에 의해 변경되었습니다. 새로고침 후 다시 시도하세요.")
        db.add(MatchScoreHistory(
            match_id=match_id,
            old_score_a=old_a, old_score_b=old_b,
            new_score_a=payload.scoreA, new_score_b=payload.scoreB,
            old_version=old_version, new_version=old_version + 1,
        ))
        db.flush()
        db.refresh(m)
        result = match_json(m)
    return result


@app.get("/api/matches/{match_id}/history")
def score_history(match_id: int, db: DB):
    if db.get(Match, match_id) is None:
        not_found("경기를 찾을 수 없습니다.")
    rows = db.scalars(select(MatchScoreHistory).where(
        MatchScoreHistory.match_id == match_id,
    ).order_by(MatchScoreHistory.id)).all()
    return [{
        "id": h.id, "matchId": h.match_id,
        "oldScoreA": h.old_score_a, "oldScoreB": h.old_score_b,
        "newScoreA": h.new_score_a, "newScoreB": h.new_score_b,
        "oldVersion": h.old_version, "newVersion": h.new_version,
        "changedAt": h.changed_at.isoformat() + "Z",
    } for h in rows]


# Optional local/staging distribution: serve the unchanged React Vite build from
# the same FastAPI process.  Disabled for development / automated API tests.
# Keep this mount AFTER all /api handlers so REST paths and OpenAPI stay intact.
if os.getenv("SERVE_FRONTEND_DIST", "0") == "1":
    from pathlib import Path
    from fastapi.staticfiles import StaticFiles

    _frontend_dist = Path(__file__).resolve().parents[2] / "dist"
    if not (_frontend_dist / "index.html").is_file():
        raise RuntimeError("React dist/index.html missing. Run 'npm run build' first.")
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="react-ui")
