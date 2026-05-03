from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.llmsuite.client import LLMSuiteProxyClient
from app.llmsuite.config import LLMSuiteConfig
from app.llmsuite.routes import router as llmsuite_router
from app.routers.exports import router as exports_router
from app.routers.index_jobs import router as index_jobs_router
from app.routers.keywords import router as keywords_router
from app.routers.history import router as history_router
from app.routers.lists import router as lists_router
from app.routers.meta import router as meta_router
from app.routers.screenings import router as screenings_router
from app.routers.search import router as search_router
from app.routers.llm_screening import router as llm_screening_router
from app.routers.criteria_analysis import router as criteria_analysis_router
from app.services.exports import ExportService
from app.services.index_jobs import IndexJobService
from app.services.keywords import KeywordsService
from app.services.history import HistoryService
from app.services.lists import ListsService
from app.services.screenings import ScreeningsService
from app.services.search import SearchService

tags_metadata = [
    {
        "name": "meta",
        "description": "Index, runtime, and capability metadata for the Company Screener backend.",
    },
    {
        "name": "search",
        "description": "Execute searches, page through cached results, and fetch highlights.",
    },
    {
        "name": "lists",
        "description": "Manage persistent named company lists stored on disk.",
    },
    {
        "name": "history",
        "description": "Inspect and clear recent search history records.",
    },
    {
        "name": "keywords",
        "description": "Parse keyword imports, validate boolean expressions, and fetch templates.",
    },
    {
        "name": "exports",
        "description": "Download search result and saved list exports as CSV or XLSX.",
    },
    {
        "name": "index-jobs",
        "description": "Build, inspect, and activate search index bundles in the background.",
    },
    {
        "name": "screenings",
        "description": "Upload screening PDFs, manage deduplicated drafts, and preview extracted intake data.",
    },
    {
        "name": "llmsuite",
        "description": "Stub LLMSuite-compatible proxy routes for chat, structured output, deployments, health, and identity.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "settings"):
        app.state.settings = get_settings()
    if not hasattr(app.state, "llmsuite_client"):
        llmsuite_client = LLMSuiteProxyClient(
            LLMSuiteConfig(
                user_data_dir=str(Path(__file__).resolve().parents[2] / "output" / "playwright" / "llmsuite-profile"),
            )
        )
        await llmsuite_client.start()
        app.state.llmsuite_client = llmsuite_client
    yield
    llmsuite_client = getattr(app.state, "llmsuite_client", None)
    if llmsuite_client is not None:
        await llmsuite_client.stop()


def create_app(settings=None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title=settings.app_name,
        description=(
            "FastAPI backend for the Company Screener application.\n\n"
            "This API exposes the same shared search runtime used by the Streamlit UI and adds "
            "documented endpoints for:\n"
            "- search execution and cached paging\n"
            "- quoted exact keyword matching\n"
            "- saved lists and search history\n"
            "- keyword import, parsing, and expression validation\n"
            "- CSV/XLSX exports for searches and lists\n"
            "- asynchronous index build jobs with progress and bundle activation"
        ),
        version="0.1.0",
        summary="Company Screener backend API",
        contact={
            "name": "Company Screener",
        },
        license_info={
            "name": "Proprietary",
        },
        openapi_tags=tags_metadata,
        swagger_ui_parameters={
            "displayRequestDuration": True,
            "docExpansion": "list",
            "defaultModelsExpandDepth": 1,
            "defaultModelExpandDepth": 1,
        },
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.history_service = HistoryService(settings)
    app.state.lists_service = ListsService(settings)
    app.state.search_service = SearchService(settings)
    app.state.keyword_service = KeywordsService()
    app.state.export_service = ExportService(app.state.search_service, app.state.lists_service)
    app.state.index_job_service = IndexJobService(settings, app.state.search_service)
    app.state.screenings_service = ScreeningsService(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    app.include_router(meta_router, prefix=settings.api_v1_prefix)
    app.include_router(search_router, prefix=settings.api_v1_prefix)
    app.include_router(lists_router, prefix=settings.api_v1_prefix)
    app.include_router(history_router, prefix=settings.api_v1_prefix)
    app.include_router(keywords_router, prefix=settings.api_v1_prefix)
    app.include_router(exports_router, prefix=settings.api_v1_prefix)
    app.include_router(index_jobs_router, prefix=settings.api_v1_prefix)
    app.include_router(screenings_router, prefix=settings.api_v1_prefix)
    app.include_router(llm_screening_router, prefix=settings.api_v1_prefix)
    app.include_router(llmsuite_router, prefix=settings.api_v1_prefix)
    app.include_router(criteria_analysis_router, prefix=settings.api_v1_prefix)

    # Serve pre-built React frontend in production (when frontend/dist/ exists).
    # Must be registered after all API routers so /api/v1/* is matched first.
    _frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if _frontend_dist.exists():

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str) -> FileResponse:
            candidate = _frontend_dist / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(_frontend_dist / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
