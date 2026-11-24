// HTTP client for the WineVoyager API.
//
// - Sends `x-api-key` only when a key is configured.
// - Keeps a short in-memory cache (never on disk): the licence allows temporary
//   caching for performance, not stored copies of the data.
// - Turns HTTP errors into `ApiError` with a message the assistant can act on.

import { createHash } from 'node:crypto'
import { DEFAULT_BASE_URL, SUPPORT_EMAIL } from './constants.js'

export type AccessLevel = 'basic' | 'full'

export interface Grape {
    name?: string
    any_of?: string[]
    min?: number
    max?: number
}

export interface WineType {
    name: string
    methods?: string[]
    grapes: Grape[]
}

export interface Denomination {
    id: string
    ea_code: string
    name: string
    classification: 'DOC' | 'DOCG'
    regions: string[]
    provinces: string[]
    recognition_year: number
    colors: string[]
    methods?: string[]
    types?: WineType[]
    parent_id?: string
    children?: string[]
    source: Record<string, unknown>
}

export interface ListQuery {
    name?: string
    region?: string
    /** Matches denominations listing the province, plus whole-region ones of its region. */
    province?: string
    color?: string
}

export interface RegionInfo {
    name: string
    count: number
    /** Provinces of this region named by at least one denomination. */
    provinces: string[]
}

export interface ApiResult<T> {
    data: T
    accessLevel: AccessLevel
    /** A key is configured but the API answered `basic`: the key is invalid or expired. */
    keyRejected: boolean
}

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

export interface ClientOptions {
    apiKey?: string
    baseUrl?: string
    /** Cache lifetime in ms. Matches the API's `Cache-Control: max-age=300`. */
    cacheTtlMs?: number
    timeoutMs?: number
    fetch?: typeof fetch
    now?: () => number
}

interface CacheEntry {
    expires: number
    body: unknown
}

export class WineVoyagerClient {
    private readonly apiKey?: string
    private readonly baseUrl: string
    private readonly cacheTtlMs: number
    private readonly timeoutMs: number
    private readonly fetchImpl: typeof fetch
    private readonly now: () => number
    private readonly cache = new Map<string, CacheEntry>()
    private readonly keyTag: string

    constructor(options: ClientOptions = {}) {
        this.apiKey = options.apiKey?.trim() || undefined
        this.baseUrl = checkBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)
        this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000
        this.timeoutMs = options.timeoutMs ?? 10_000
        this.fetchImpl = options.fetch ?? globalThis.fetch
        this.now = options.now ?? Date.now
        // The cache key carries a hash of the key, never the key itself.
        this.keyTag = this.apiKey ? createHash('sha256').update(this.apiKey).digest('hex').slice(0, 12) : 'anon'
    }

    get hasApiKey(): boolean {
        return this.apiKey !== undefined
    }

    async listDenominations(query: ListQuery = {}): Promise<ApiResult<Denomination[]>> {
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(query)) {
            if (v !== undefined && v.trim() !== '') params.set(k, v.trim())
        }
        const qs = params.toString()
        const body = await this.request<{ denominations: Denomination[]; access_level: AccessLevel }>(
            `/v1/denominations${qs ? `?${qs}` : ''}`
        )
        return this.wrap(body.denominations, body.access_level)
    }

    async getDenomination(id: string): Promise<ApiResult<Denomination>> {
        const body = await this.request<Denomination & { access_level: AccessLevel }>(
            `/v1/denominations/${encodeURIComponent(id.trim())}`
        )
        const { access_level, ...denomination } = body
        return this.wrap(denomination as Denomination, access_level)
    }

    /** Regions with their denomination count and provinces. Basic data: no access level. */
    async listRegions(): Promise<RegionInfo[]> {
        const body = await this.request<{ regions: RegionInfo[] }>('/v1/regions')
        return body.regions
    }

    private wrap<T>(data: T, accessLevel: AccessLevel): ApiResult<T> {
        return { data, accessLevel, keyRejected: this.hasApiKey && accessLevel !== 'full' }
    }

    private async request<T>(path: string): Promise<T> {
        const cacheKey = `${this.keyTag} ${path}`
        const cached = this.cache.get(cacheKey)
        if (cached && cached.expires > this.now()) return cached.body as T

        const headers: Record<string, string> = { accept: 'application/json' }
        if (this.apiKey) headers['x-api-key'] = this.apiKey

        let response: Response
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                headers,
                // Never follow redirects: fetch would resend x-api-key to the new
                // location, even on another domain (only Authorization is stripped).
                redirect: 'manual',
                signal: AbortSignal.timeout(this.timeoutMs),
            })
        } catch (error) {
            const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'could not be reached'
            throw new ApiError(0, `The WineVoyager API ${reason}. Try again later.`)
        }

        if ((response.status >= 300 && response.status < 400) || response.type === 'opaqueredirect') {
            throw new ApiError(
                response.status,
                `The WineVoyager API answered with a redirect, which is not followed to keep the API key safe. Try again later; if it persists, write to ${SUPPORT_EMAIL}.`
            )
        }
        if (!response.ok) throw new ApiError(response.status, await errorMessage(response))

        const body = (await response.json()) as T
        this.prune()
        this.cache.set(cacheKey, { expires: this.now() + this.cacheTtlMs, body })
        return body
    }

    private prune(): void {
        const now = this.now()
        for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k)
    }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The API URL carries the user's key, so only https is accepted (plain http only
 * for a local development server). Returns the URL without trailing slashes.
 */
export function checkBaseUrl(raw: string): string {
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new Error('Invalid WINEVOYAGER_API_URL: not a valid URL.')
    }
    const local = LOCAL_HOSTS.has(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
        throw new Error(
            `Refusing WineVoyager API URL "${url.origin}": it must use https (plain http is allowed only for localhost), because requests carry the API key.`
        )
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new Error(`Invalid WineVoyager API URL "${url.origin}": use a plain base URL, e.g. https://api.winevoyager.tours.`)
    }
    return url.href.replace(/\/+$/, '')
}

async function errorMessage(response: Response): Promise<string> {
    let apiMessage = ''
    try {
        const body = (await response.json()) as { error?: unknown }
        if (typeof body.error === 'string') apiMessage = body.error
    } catch {
        // not JSON: keep the generic message
    }

    switch (response.status) {
        case 400:
            return `Invalid request: ${apiMessage || 'check the parameters'}.`
        case 404:
            return 'Denomination not found. Use search_denominations to find the right id.'
        case 429:
            return `Rate limit reached (about 30 requests per minute per IP). Wait about a minute before calling WineVoyager again; do not retry immediately.`
        default:
            if (response.status >= 500) return 'The WineVoyager API had a server error. Try again later.'
            return `WineVoyager API error ${response.status}${apiMessage ? `: ${apiMessage}` : ''}. Contact ${SUPPORT_EMAIL} if it persists.`
    }
}
