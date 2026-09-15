"""Cadastro de usuários do portal."""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from trigo_api.db import User
from trigo_api.errors import ApiError
from trigo_api.parametros.service import ParametrosService
from trigo_api.permissoes import PAPEIS
from trigo_api.security.password import hash_password

logger = logging.getLogger(__name__)


class UsuariosService:
    def __init__(self, sessao: Session, parametros: ParametrosService) -> None:
        self._sessao = sessao
        self._p = parametros

    def listar(
        self, busca: str | None = None, pagina: int = 1, tamanho: int = 50
    ) -> tuple[list[User], int]:
        pagina = max(1, pagina)
        tamanho = max(1, min(200, tamanho))

        consulta = select(User)
        if busca:
            alvo = f"%{busca.strip()}%"
            consulta = consulta.where(or_(User.name.like(alvo), User.email.like(alvo)))

        total = self._sessao.scalar(select(func.count()).select_from(consulta.subquery()))
        linhas = list(
            self._sessao.scalars(
                consulta.order_by(User.name).offset((pagina - 1) * tamanho).limit(tamanho)
            )
        )
        return linhas, int(total or 0)

    def obter(self, usuario_id: str) -> User:
        usuario = self._sessao.get(User, usuario_id)
        if usuario is None:
            raise ApiError(404, "Usuario nao encontrado")
        return usuario

    def criar(self, nome: str, email: str, senha: str, papel: str, autor: str) -> User:
        """Cria o usuário com a senha provisória informada por quem cadastra.

        A senha vem da requisição porque é assim que o contrato existente
        funciona e a tela de Usuários depende disso. Ela nasce PROVISÓRIA: o
        portal exige a troca no primeiro acesso e o prazo é contado a partir de
        agora, então ela não vira acesso permanente.
        """
        email = email.strip().lower()
        if papel not in PAPEIS:
            raise ApiError(400, f"Papel invalido: {papel}.")

        existente = self._sessao.scalar(select(User).where(User.email == email))
        if existente is not None:
            raise ApiError(409, f"Ja existe um usuario com o e-mail {email}.")

        agora = datetime.now(UTC)
        usuario = User(
            id=str(uuid.uuid4()),
            name=nome.strip(),
            email=email,
            password_hash=hash_password(senha),
            role=papel,
            is_active=True,
            provider="local",
            token_version=0,
            must_change_password=True,
            provisional_password_at=agora,
            failed_login_attempts=0,
            created_at=agora,
            updated_at=agora,
        )
        self._sessao.add(usuario)
        self._sessao.commit()

        logger.info("Usuario %s criado por %s", email, autor)
        return usuario

    def atualizar(
        self,
        usuario_id: str,
        autor: str,
        nome: str | None = None,
        papel: str | None = None,
        ativo: bool | None = None,
    ) -> User:
        usuario = self.obter(usuario_id)

        if papel is not None:
            if papel not in PAPEIS:
                raise ApiError(400, f"Papel invalido: {papel}.")
            usuario.role = papel
        if nome is not None:
            usuario.name = nome.strip()
        if ativo is not None:
            usuario.is_active = ativo
            # Desativar precisa DERRUBAR a sessão aberta. Sem isso, quem foi
            # desativado continua usando o portal até o token expirar.
            if not ativo:
                usuario.token_version += 1

        usuario.updated_at = datetime.now(UTC)
        self._sessao.commit()
        logger.info("Usuario %s alterado por %s", usuario.email, autor)
        return usuario

    def redefinir_senha(self, usuario_id: str, nova_senha: str, autor: str) -> User:
        """Grava a nova senha provisória e derruba as sessões abertas."""
        usuario = self.obter(usuario_id)
        if usuario.provider != "local":
            raise ApiError(
                409,
                f'A senha deste usuario e gerenciada por "{usuario.provider}" e nao '
                "pode ser trocada aqui.",
            )

        usuario.password_hash = hash_password(nova_senha)
        usuario.must_change_password = True
        usuario.provisional_password_at = datetime.now(UTC)
        usuario.failed_login_attempts = 0
        usuario.locked_until = None
        # Senha redefinida invalida toda sessão anterior: é o ponto do reset.
        usuario.token_version += 1
        usuario.updated_at = datetime.now(UTC)
        self._sessao.commit()

        logger.info("Senha de %s redefinida por %s", usuario.email, autor)
        return usuario

    def desbloquear(self, usuario_id: str, autor: str) -> User:
        usuario = self.obter(usuario_id)
        usuario.locked_until = None
        usuario.failed_login_attempts = 0
        usuario.updated_at = datetime.now(UTC)
        self._sessao.commit()
        logger.info("Usuario %s desbloqueado por %s", usuario.email, autor)
        return usuario

    def desativar(self, usuario_id: str, autor: str) -> User:
        return self.atualizar(usuario_id, autor, ativo=False)

    def remover(self, usuario_id: str, autor: str) -> None:
        usuario = self.obter(usuario_id)
        email = usuario.email
        self._sessao.delete(usuario)
        self._sessao.commit()
        logger.info("Usuario %s removido por %s", email, autor)

    def prazo_da_provisoria(self, usuario: User) -> datetime | None:
        """Quando a senha provisória vence, já calculado pelo servidor.

        O cálculo fica aqui porque é o servidor que conhece o parâmetro; a tela
        só mostra. Nulo quando não há provisória pendente ou o prazo está
        desligado.
        """
        if not usuario.must_change_password or usuario.provisional_password_at is None:
            return None
        horas = self._p.numero("SENHA_PROVISORIA_VALIDADE_HORAS", 48)
        if horas <= 0:
            return None
        return usuario.provisional_password_at + timedelta(hours=horas)
