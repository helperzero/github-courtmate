"""ORM models whose field names mirror the original PostgreSQL columns."""

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index,
    Integer, String, Unicode, UniqueConstraint, text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        CheckConstraint("gender IN ('M', 'F')", name="ck_members_gender"),
        CheckConstraint("level >= 1 AND level <= 7", name="ck_members_level"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Unicode(40), nullable=False)
    gender: Mapped[str] = mapped_column(String(1), default="M", nullable=False)
    level: Mapped[float] = mapped_column(Float, default=3.0, nullable=False)
    phone: Mapped[str] = mapped_column(Unicode(30), default="", nullable=False)
    memo: Mapped[str] = mapped_column(Unicode(300), default="", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    joined_at: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc_naive, nullable=False)


class ClubSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        CheckConstraint("format IN ('doubles', 'singles')", name="ck_sessions_format"),
        CheckConstraint("courts >= 1 AND courts <= 20", name="ck_sessions_courts"),
        Index(
            "ux_sessions_request_key", "request_key", unique=True,
            mssql_where=text("request_key IS NOT NULL"),
            sqlite_where=text("request_key IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Unicode(80), nullable=False)
    play_date: Mapped[date] = mapped_column(Date, nullable=False)
    format: Mapped[str] = mapped_column(String(7), default="doubles", nullable=False)
    courts: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    request_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc_naive, nullable=False)


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("session_id", "round", "court", name="uq_matches_session_round_court"),
        CheckConstraint("round >= 1", name="ck_matches_round"),
        CheckConstraint("court >= 1", name="ck_matches_court"),
        CheckConstraint("score_version >= 0", name="ck_matches_score_version"),
        CheckConstraint(
            "(score_a IS NULL AND score_b IS NULL) OR "
            "(score_a IS NOT NULL AND score_b IS NOT NULL "
            "AND score_a BETWEEN 0 AND 99 AND score_b BETWEEN 0 AND 99)",
            name="ck_matches_score_pair",
        ),
        Index("ix_matches_session_round", "session_id", "round"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    court: Mapped[int] = mapped_column(Integer, nullable=False)
    team_a1: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False)
    team_a2: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    team_b1: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False)
    team_b2: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc_naive, nullable=False)


class MatchScoreHistory(Base):
    __tablename__ = "match_score_history"
    __table_args__ = (Index("ix_score_history_match", "match_id", "changed_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    old_score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)
    old_version: Mapped[int] = mapped_column(Integer, nullable=False)
    new_version: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc_naive, nullable=False)
