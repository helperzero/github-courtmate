"""API request models; responses are mapped explicitly to legacy camelCase JSON."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Existing React sends id/createdAt on edit.


class MemberInput(ApiModel):
    name: str
    gender: Literal["M", "F"] = "M"
    level: float = Field(ge=1, le=7)
    phone: str = ""
    memo: str = ""
    active: bool = True
    joinedAt: date = Field(default_factory=date.today)

    @field_validator("name", "phone", "memo")
    @classmethod
    def normalized_text(cls, value: str, info):
        if not isinstance(value, str):
            raise ValueError("문자열을 입력해 주세요.")
        value = value.strip()
        maximum = {"name": 40, "phone": 30, "memo": 300}[info.field_name]
        if len(value) > maximum:
            raise ValueError(f"{info.field_name}은(는) {maximum}자 이하여야 합니다.")
        if info.field_name == "name" and not value:
            raise ValueError("이름을 입력해 주세요.")
        return value


class DraftMatchInput(ApiModel):
    round: StrictInt = Field(ge=1)
    court: StrictInt = Field(ge=1)
    teamA1: StrictInt = Field(gt=0)
    teamA2: StrictInt | None = None
    teamB1: StrictInt = Field(gt=0)
    teamB2: StrictInt | None = None


class SessionInput(ApiModel):
    title: str
    playDate: date
    format: Literal["doubles", "singles"] = "doubles"
    courts: StrictInt = Field(ge=1, le=20)
    matches: list[DraftMatchInput] = Field(min_length=1, max_length=300)

    @field_validator("title")
    @classmethod
    def title_clean(cls, v: str):
        v = v.strip()
        if not v or len(v) > 80:
            raise ValueError("모임 이름은 1~80자여야 합니다.")
        return v


class ScoreInput(ApiModel):
    scoreA: StrictInt | None
    scoreB: StrictInt | None
    scoreVersion: StrictInt | None = Field(default=None, ge=0)
