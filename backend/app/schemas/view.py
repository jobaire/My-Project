from pydantic import BaseModel, Field


class ViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    config: dict = Field(default_factory=dict)


class ViewResponse(BaseModel):
    id: int
    view_key: str
    name: str
    config: dict
