/**
 * Modelo de autorizacao: papeis (roles) agrupam permissoes granulares.
 * Ao criar um modulo novo, adicione as permissoes aqui e distribua nos papeis.
 * A tela e o BFF consultam a MESMA fonte de verdade.
 */
export const PERMISSIONS = [
  // Modulo Cadastros
  'users:read',
  'users:write',
  'users:delete',
  // Modulo Configurador
  'settings:read',
  'settings:write',
  // Modulo Cadastros - produtos espelhados do Protheus
  'products:read',
  'products:sync',
  // Console de consulta ao banco do ERP. Separada de settings de proposito:
  // escrever SQL livre contra a producao do Protheus e poder de outra ordem,
  // e quem administra parametro nao precisa necessariamente te-lo.
  'protheusdb:consultar',
  // modulos futuros seguem o mesmo padrao <recurso>:<acao>
  // 'pedidos:read', 'pedidos:approve', ...
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLES = ['ADMIN', 'MANAGER', 'USER'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  USER: 'Usuario',
}

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    'users:read',
    'users:write',
    'users:delete',
    'settings:read',
    'settings:write',
    'products:read',
    'products:sync',
  ],
  // Gestor enxerga cadastros e consulta a parametrizacao, mas nao altera nada sistemico.
  MANAGER: ['users:read', 'settings:read', 'products:read'],
  // Consultar produto e leitura de cadastro corporativo: todo usuario autenticado.
  USER: ['products:read'],
}

/**
 * Rotulo legivel de cada permissao. Usado na tela Conta, para o usuario
 * entender o que o perfil dele permite sem precisar decifrar `users:write`.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'users:read': 'Consultar usuarios',
  'users:write': 'Cadastrar e alterar usuarios',
  'users:delete': 'Desativar e excluir usuarios',
  'settings:read': 'Consultar a parametrizacao do sistema',
  'settings:write': 'Alterar a parametrizacao do sistema',
  'products:read': 'Consultar produtos',
  'products:sync': 'Disparar a carga de produtos do Protheus',
  'protheusdb:consultar': 'Consultar o banco do Protheus por SQL',
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p))
}

/** Usado pelo menu: a secao aparece se o usuario puder ver ao menos um item dela. */
export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p))
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}
