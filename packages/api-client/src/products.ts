import type { ProductListResponse, ProductSyncResult, PublicProduct } from '@trigo/core'
import { request, type HttpConfig } from './http'

export interface ListProductsParams {
  search?: string
  /** Empresa de origem. String vazia e um filtro valido, nao "sem filtro". */
  empori?: string
  page?: number
  pageSize?: number
}

export function listProducts(config: HttpConfig, params: ListProductsParams = {}) {
  return request<ProductListResponse>(config, '/products', { query: { ...params } })
}

export function getProduct(config: HttpConfig, id: string) {
  return request<PublicProduct>(config, `/products/${id}`)
}


export interface SyncProductsParams {
  /** Empresa e filial andam em par; sem elas, usa a configuracao do portal. */
  empresa?: string
  filial?: string
  desdeData?: string
}

export function syncProducts(config: HttpConfig, params: SyncProductsParams = {}) {
  return request<ProductSyncResult>(config, '/products/sync', {
    method: 'POST',
    query: { ...params },
  })
}
