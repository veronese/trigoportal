"""Formato de erro que o front já espera.

O ``api-client`` do ``apps/web`` lê ``{ message, issues }`` para montar a frase
da tela. Manter esse formato é o que permite trocar o backend sem tocar em
nenhuma tela: o contrato de erro faz parte do contrato da API tanto quanto o
corpo de sucesso.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """Erro de negócio com mensagem pronta para a tela."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        issues: list[dict[str, Any]] | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.issues = issues
        self.code = code


def _corpo(
    status_code: int,
    message: str,
    issues: list[dict[str, Any]] | None = None,
    code: str | None = None,
) -> dict[str, Any]:
    corpo: dict[str, Any] = {"statusCode": status_code, "message": message}
    if issues:
        corpo["issues"] = issues
    if code:
        corpo["code"] = code
    return corpo


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_corpo(exc.status_code, exc.message, exc.issues, exc.code),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=_corpo(exc.status_code, str(exc.detail))
        )

    @app.exception_handler(RequestValidationError)
    async def _validacao(_: Request, exc: RequestValidationError) -> JSONResponse:
        # O front junta as mensagens de `issues` numa frase só. O formato
        # `{path, message}` é o mesmo que o zod produzia do outro lado.
        issues = [
            {"path": list(erro.get("loc", []))[1:], "message": erro.get("msg", "")}
            for erro in jsonable_encoder(exc.errors())
        ]
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=_corpo(
                status.HTTP_400_BAD_REQUEST, "Dados invalidos", issues=issues
            ),
        )
