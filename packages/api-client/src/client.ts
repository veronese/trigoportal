import * as authApi from './auth'
import * as parametersApi from './parameters'
import * as productsApi from './products'
import * as databaseApi from './database'
import * as diagnosticsApi from './diagnostics'
import * as protheusDbApi from './protheus-db'
import * as protheusApi from './protheus'
import * as usersApi from './users'
import type { HttpConfig } from './http'

/**
 * Fachada com a config injetada uma unica vez, organizada por modulo do portal.
 * O web usa baseUrl '/api/bff'; o app mobile usara a URL publica + getAuthToken.
 */
export function createApiClient(config: HttpConfig) {
  return {
    auth: {
      login: (input: Parameters<typeof authApi.login>[1]) => authApi.login(config, input),
      logout: () => authApi.logout(config),
      me: () => authApi.me(config),
      changePassword: (input: Parameters<typeof authApi.changePassword>[1]) =>
        authApi.changePassword(config, input),
    },

    // Modulo Cadastros
    users: {
      list: (params?: Parameters<typeof usersApi.listUsers>[1]) => usersApi.listUsers(config, params),
      get: (id: string) => usersApi.getUser(config, id),
      create: (input: Parameters<typeof usersApi.createUser>[1]) =>
        usersApi.createUser(config, input),
      update: (id: string, input: Parameters<typeof usersApi.updateUser>[2]) =>
        usersApi.updateUser(config, id, input),
      resetPassword: (id: string, input: Parameters<typeof usersApi.resetUserPassword>[2]) =>
        usersApi.resetUserPassword(config, id, input),
      deactivate: (id: string) => usersApi.deactivateUser(config, id),
      unlock: (id: string) => usersApi.unlockUser(config, id),
      remove: (id: string) => usersApi.removeUser(config, id),
    },

    products: {
      list: (params?: Parameters<typeof productsApi.listProducts>[1]) =>
        productsApi.listProducts(config, params),
      get: (id: string) => productsApi.getProduct(config, id),
      sync: (params?: Parameters<typeof productsApi.syncProducts>[1]) =>
        productsApi.syncProducts(config, params),
    },

    // Modulo Configurador
    parameters: {
      branding: () => parametersApi.getBranding(config),
      list: () => parametersApi.listParameters(config),
      update: (key: string, input: Parameters<typeof parametersApi.updateParameter>[2]) =>
        parametersApi.updateParameter(config, key, input),
      updateCredential: (
        key: string,
        input: Parameters<typeof parametersApi.updateParameterCredential>[2],
      ) => parametersApi.updateParameterCredential(config, key, input),
      reset: (key: string) => parametersApi.resetParameter(config, key),
    },

    // Banco de dados (somente leitura)
    database: {
      status: () => databaseApi.getDatabaseStatus(config),
    },

    // Diagnostico do sistema (somente leitura)
    diagnostics: {
      get: () => diagnosticsApi.getSystemDiagnostics(config),
    },

    // Conexao com o Protheus
    protheus: {
      status: () => protheusApi.getProtheusStatus(config),
      testConnection: () => protheusApi.testProtheusConnection(config),
    },

    // Conexao direta com o banco do Protheus (ETL), em leitura
    protheusDb: {
      config: () => protheusDbApi.getProtheusDbConfig(config),
      testar: () => protheusDbApi.testProtheusDb(config),
      tabelas: (busca?: string) => protheusDbApi.listProtheusDbTabelas(config, busca),
      colunas: (tabela: string) => protheusDbApi.getProtheusDbColunas(config, tabela),
      consultar: (sql: string, limite?: number) =>
        protheusDbApi.consultarProtheusDb(config, sql, limite),
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
