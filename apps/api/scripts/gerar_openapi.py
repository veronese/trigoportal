"""Escreve o openapi.json a partir da aplicação.

É a partir deste arquivo que o cliente TypeScript é gerado. Gerar em vez de
digitar é o que substitui o pacote de tipos compartilhado que existia quando os
dois lados eram TypeScript: o contrato continua tendo uma fonte só — agora o
código Python — e o front não pode divergir dele sem o build acusar.
"""

import json
import pathlib
import sys

from trigo_api.main import app

destino = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
destino.write_text(
    json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(f"openapi escrito em {destino} ({len(app.openapi()['paths'])} rotas)")
