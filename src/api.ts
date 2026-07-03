import createClient from 'openapi-fetch'
import type { paths } from '@/api.d'


export const API_BASE = import.meta.env.PROD
  ? window.location.origin
  : 'http://10.0.4.23'

export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.PROD ? '' : API_BASE,
})
