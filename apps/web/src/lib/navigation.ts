import type { Permission } from '@trigo/core'
import type { IconName } from '@/components/icons'

export interface NavItem {
  href: string
  label: string
  description: string
  icon: IconName
  /** Quando informada, o item so aparece se o usuario tiver a permissao. */
  permission?: Permission
}

export interface NavSection {
  /** Rota indice da secao — no mobile, e o destino da barra inferior. */
  href: string
  label: string
  shortLabel: string
  description: string
  icon: IconName
  items: NavItem[]
}

/**
 * Registro unico de navegacao — a mesma estrutura alimenta o menu lateral do
 * desktop, a barra inferior do mobile e as telas indice de cada modulo.
 *
 * Modulo novo = uma secao aqui. Rotina nova dentro de um modulo = um item.
 * A visibilidade sai da permissao, nunca de condicional espalhada pela tela.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    href: '/cadastros',
    label: 'Cadastros',
    shortLabel: 'Cadastros',
    description: 'Cadastros base do portal.',
    icon: 'users',
    items: [
      {
        href: '/cadastros/usuarios',
        label: 'Usuarios',
        description: 'Acessos, papeis, senha e ativacao de contas.',
        icon: 'users',
        permission: 'users:read',
      },
      {
        href: '/cadastros/produtos',
        label: 'Produtos',
        description: 'Cadastro unificado das empresas, espelhado do Protheus.',
        icon: 'box',
        permission: 'products:read',
      },
    ],
  },
  {
    href: '/integracoes',
    label: 'Integracoes',
    shortLabel: 'Integr.',
    description: 'Conexoes com sistemas externos: banco de dados e Protheus.',
    icon: 'plug',
    items: [
      {
        href: '/integracoes/banco',
        label: 'Banco de dados',
        description: 'Servidor, banco e situacao da conexao. Somente leitura.',
        icon: 'database',
        permission: 'settings:read',
      },
      {
        href: '/integracoes/protheus',
        label: 'Protheus',
        description: 'Situacao da conexao com o ERP, teste de autenticacao e carga de cadastros.',
        icon: 'plug',
        permission: 'settings:read',
      },
    ],
  },
  {
    href: '/configurador',
    label: 'Configurador',
    shortLabel: 'Config.',
    description: 'Parametrizacao sistemica e diagnostico do portal.',
    icon: 'settings',
    items: [
      {
        href: '/configurador/parametros',
        label: 'Parametros',
        description: 'Comportamento do portal, seguranca e integracao com o Protheus.',
        icon: 'sliders',
        permission: 'settings:read',
      },
      {
        href: '/configurador/diagnostico',
        label: 'Diagnostico do sistema',
        description: 'Recursos exigidos, arquivos, programas em uso e situacao das atualizacoes.',
        icon: 'pulse',
        permission: 'settings:read',
      },
    ],
  },
]

/** Achatado, para lookups. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items)
