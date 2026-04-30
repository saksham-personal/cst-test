from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ExportFormat = Literal["csv", "xlsx"]
ExportLayout = Literal["standard", "pitchbook", "llm"]


class ExportDescriptor(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "filename": "screening_manufacturer_20260412.xlsx",
                "media_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "row_count": 169648,
            }
        }
    )

    filename: str = Field(description="Generated file name.")
    media_type: str = Field(description="Response content type.")
    row_count: int = Field(description="Number of exported rows.")
    format: ExportFormat = Field(description="Export file format.")


class ExportSearchRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "format": "xlsx",
                "layout": "standard",
                "include_highlights": True,
                "include_metadata": True,
                "highlight_limit": 50,
            }
        }
    )

    format: ExportFormat = Field(default="xlsx", description="Desired export format.")
    layout: ExportLayout = Field(
        default="standard",
        description=(
            "Column layout. 'standard' includes scoring columns (composite score, "
            "match %, matched keywords, highlights) followed by the PitchBook master "
            "columns. 'pitchbook' emits only the PitchBook master columns so the "
            "file can be uploaded back to PitchBook. 'llm' emits only index, Company, "
            "Website, and a newline-concatenated Description field."
        ),
    )
    include_highlights: bool = Field(default=False, description="Include snippet highlights in the export.")
    include_metadata: bool = Field(default=True, description="Join company metadata columns into the export.")
    highlight_limit: int = Field(default=50, ge=1, description="Maximum number of rows to hydrate with highlights.")


class ExportListRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "format": "xlsx",
                "layout": "standard",
                "include_metadata": True,
            }
        }
    )

    format: ExportFormat = Field(default="xlsx", description="Desired export format.")
    layout: ExportLayout = Field(
        default="standard",
        description=(
            "Column layout. 'standard' emits scoring/metadata columns. "
            "'pitchbook' emits the PitchBook 4-column upload format. 'llm' emits only "
            "index, Company, Website, and a newline-concatenated Description field."
        ),
    )
    include_metadata: bool = Field(default=True, description="Join company metadata columns into the export.")
