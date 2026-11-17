"""Database connection: SQL Server in production, injected SQLite in tests.

Never automatically create or migrate a production database on application boot.
Run database/01_schema.sql against an empty SQL Server database first.
"""

import os
from functools import lru_cache
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, Engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()


def connection_url() -> str | URL:
    odbc_connect = os.getenv("MSSQL_ODBC_CONNECTION_STRING", "").strip()
    if odbc_connect:
        return URL.create("mssql+pyodbc", query={"odbc_connect": odbc_connect})
    explicit = os.getenv("DATABASE_URL", "").strip()
    if explicit:
        return explicit

    host = os.getenv("MSSQL_HOST", "").strip()
    database = os.getenv("MSSQL_DATABASE", "").strip()
    user = os.getenv("MSSQL_USER", "").strip()
    password = os.getenv("MSSQL_PASSWORD", "")
    if not all((host, database, user, password)):
        raise RuntimeError(
            "MSSQL_HOST, MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD를 .env에 설정하세요."
        )
    return URL.create(
        "mssql+pyodbc",
        username=user,
        password=password,
        host=host,
        port=int(os.getenv("MSSQL_PORT", "1433")),
        database=database,
        query={
            "driver": os.getenv("MSSQL_DRIVER", "ODBC Driver 18 for SQL Server"),
            "Encrypt": os.getenv("MSSQL_ENCRYPT", "yes"),
            "TrustServerCertificate": os.getenv("MSSQL_TRUST_SERVER_CERTIFICATE", "no"),
        },
    )


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(connection_url(), pool_pre_ping=True, pool_recycle=1800)


def get_db() -> Generator[Session, None, None]:
    with sessionmaker(bind=get_engine(), expire_on_commit=False)() as db:
        yield db
