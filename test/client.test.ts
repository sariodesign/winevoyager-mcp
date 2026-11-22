import { describe, expect, it } from 'vitest'
import { ApiError, WineVoyagerClient } from '../src/client.js'
import { makeFetch, VALID_KEY } from './fixtures.js'

describe('WineVoyagerClient', () => {
    it('sends no key and reports basic without a key', async () => {
        const { fetchFn, calls } = makeFetch()
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test' })
        const r = await client.getDenomination('vino-di-prova')
        expect(calls[0]!.key).toBeUndefined()
        expect(r.accessLevel).toBe('basic')
        expect(r.keyRejected).toBe(false)
        expect(r.data.types).toBeUndefined()
    })

    it('sends the key and reports full with a valid key', async () => {
        const { fetchFn, calls } = makeFetch()
        const client = new WineVoyagerClient({ fetch: fetchFn, apiKey: VALID_KEY, baseUrl: 'https://api.test' })
        const r = await client.getDenomination('vino-di-prova')
        expect(calls[0]!.key).toBe(VALID_KEY)
        expect(r.accessLevel).toBe('full')
        expect(r.keyRejected).toBe(false)
        expect(r.data.types).toHaveLength(2)
    })

    it('flags an invalid or expired key (the API silently answers basic)', async () => {
        const { fetchFn } = makeFetch()
        const client = new WineVoyagerClient({ fetch: fetchFn, apiKey: 'expired', baseUrl: 'https://api.test' })
        const r = await client.listDenominations()
        expect(r.accessLevel).toBe('basic')
        expect(r.keyRejected).toBe(true)
    })

    it('passes only non-empty filters', async () => {
        const { fetchFn, calls } = makeFetch()
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test' })
        await client.listDenominations({ name: 'Barolo', region: '  ', color: undefined })
        expect(calls[0]!.url).toBe('https://api.test/v1/denominations?name=Barolo')
    })

    it('caches in memory for the TTL, separately per key', async () => {
        let t = 0
        const { fetchFn, calls } = makeFetch()
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test', cacheTtlMs: 1000, now: () => t })
        await client.listDenominations()
        await client.listDenominations()
        expect(calls).toHaveLength(1)
        t = 1500
        await client.listDenominations()
        expect(calls).toHaveLength(2)

        const keyed = new WineVoyagerClient({ fetch: fetchFn, apiKey: VALID_KEY, baseUrl: 'https://api.test', now: () => t })
        await keyed.listDenominations()
        expect(calls).toHaveLength(3)
    })

    it.each([
        [404, /search_denominations/],
        [400, /Invalid request: Invalid query parameter/],
        [429, /Rate limit reached.*do not retry immediately/],
        [500, /server error/],
    ])('maps HTTP %i to an actionable ApiError', async (status, message) => {
        const { fetchFn } = makeFetch(() => ({
            status,
            body: { error: status === 400 ? 'Invalid query parameter: color must be one of red, white, rose' : 'x' },
        }))
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test' })
        const err = await client.listDenominations().catch((e) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect(err.status).toBe(status)
        expect(err.message).toMatch(message)
    })

    it('does not cache errors', async () => {
        let fail = true
        const { fetchFn, calls } = makeFetch((url, key) =>
            fail ? { status: 429, body: { error: 'Too many requests' } } : { status: 200, body: { denominations: [], count: 0, access_level: 'basic' } }
        )
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test' })
        await expect(client.listDenominations()).rejects.toThrow(ApiError)
        fail = false
        await expect(client.listDenominations()).resolves.toMatchObject({ data: [] })
        expect(calls).toHaveLength(2)
    })

    it('reports network failures without leaking details', async () => {
        const fetchFn = (async () => {
            throw new TypeError('fetch failed')
        }) as unknown as typeof fetch
        const client = new WineVoyagerClient({ fetch: fetchFn, apiKey: 'secret-key', baseUrl: 'https://api.test' })
        const err = await client.listDenominations().catch((e) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect(err.message).toMatch(/could not be reached/)
        expect(err.message).not.toContain('secret-key')
    })
})
