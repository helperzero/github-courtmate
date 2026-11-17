"""Keep the original frontend's public API property names and value formats."""

from .models import ClubSession, Match, Member


def member_json(m: Member) -> dict:
    return {
        "id": m.id, "name": m.name, "gender": m.gender,
        "level": m.level, "phone": m.phone, "memo": m.memo,
        "active": m.active, "joinedAt": m.joined_at.isoformat(),
        "createdAt": m.created_at.isoformat() + "Z",
    }


def session_json(s: ClubSession) -> dict:
    return {
        "id": s.id, "title": s.title, "playDate": s.play_date.isoformat(),
        "format": s.format, "courts": s.courts,
        "createdAt": s.created_at.isoformat() + "Z",
    }


def match_json(m: Match) -> dict:
    return {
        "id": m.id, "sessionId": m.session_id, "round": m.round,
        "court": m.court, "teamA1": m.team_a1, "teamA2": m.team_a2,
        "teamB1": m.team_b1, "teamB2": m.team_b2,
        "scoreA": m.score_a, "scoreB": m.score_b,
        "scoreVersion": m.score_version,
    }
