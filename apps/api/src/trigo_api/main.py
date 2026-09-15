"""Aplicação FastAPI do Portal Trigo."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from trigo_api.auth.router import router as auth_router
from trigo_api.config import obter_settings
from trigo_api.errors import registrar_tratadores

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(name)s: %(message)s")


def criar_app() -> FastAPI:
    settings = obter_settings()

    app = FastAPI(
        title="Portal Trigo",
        version="0.1.0",
        description="Backend do Portal Trigo.",
        # O front chama tudo sob /api, via proxy do Next na mesma origem. O
        # prefixo é o mesmo do backend anterior para nenhuma tela mudar.
        root_path="",
        openapi_url="/api/openapi.json",
        docs_url="/api/docs",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origens_cors,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    registrar_tratadores(app)
    app.include_router(auth_router, prefix="/api")

    @app.get("/api/health", tags=["infra"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = criar_app()
