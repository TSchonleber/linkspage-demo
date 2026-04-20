"""Pydantic v2 models for the link-in-bio API.

Source-of-truth schema. Mirrors `lib/types.ts` on the frontend; any change
here must be reflected there (a JSON-schema snapshot test guards drift).
"""

from __future__ import annotations

from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

ThemeId: TypeAlias = Literal["minimal", "neon", "sunset", "paper", "retro", "dark"]


class Link(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(min_length=1, max_length=64)]
    label: Annotated[str, Field(min_length=1, max_length=80)]
    # url is validated loosely as a length-bounded string so we can accept
    # mailto:, tel:, and non-HTTP schemes in addition to http/https.
    url: Annotated[str, Field(min_length=1, max_length=2048)]
    enabled: bool = True


class Page(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    name: Annotated[str, Field(max_length=80)]
    bio: Annotated[str, Field(max_length=160)] = ""
    # avatar is either a base64 data URL or empty. 500k chars keeps row size
    # under roughly ~500KB of UTF-8, comfortably small for libSQL.
    avatar: Annotated[str, Field(max_length=500_000)] = ""
    theme: ThemeId = "minimal"
    links: Annotated[list[Link], Field(max_length=50)] = Field(default_factory=list)


# Request body for PUT /api/pages/{slug} — same shape as Page.
UpdatePageRequest: TypeAlias = Page


class CreatePageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    edit_token: str
    page: Page
