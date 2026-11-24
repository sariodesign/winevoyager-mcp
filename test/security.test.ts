// The API key must only ever reach the configured API host.

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, checkBaseUrl, WineVoyagerClient } from '../src/client.js'

describe('checkBaseUrl', () => {
    it.each([
        ['https://api.winevoyager.tours', 'https://api.winevoyager.tours'],
        ['https://api.winevoyager.tours/', 'https://api.winevoyager.tours'],
        ['http://localhost:3000', 'http://localhost:3000'],
        ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080'],
        ['http://[::1]:8080', 'http://[::1]:8080'],
    ])('accepts %s', (raw, expected) => {
        expect(checkBaseUrl(raw)).toBe(expected)
    })

    it.each([
        'http://api.winevoyager.tours',
        'http://example.com',
        'ftp://example.com',
        'https://user:pass@example.com',
        'https://example.com/?x=1',
        'not a url',
    ])('rejects %s', (raw) => {
        expect(() => checkBaseUrl(raw)).toThrow()
    })

    it('does not echo credentials in the error', () => {
        expect(() => checkBaseUrl('http://user:secret@example.com')).toThrow(/^(?!.*secret)/)
    })

    it('the client refuses a plain-http remote URL', () => {
        expect(() => new WineVoyagerClient({ baseUrl: 'http://example.com', apiKey: 'k' })).toThrow(/https/)
    })
})

describe('redirects', () => {
    it('a 3xx answer is an error, not followed', async () => {
        const fetchFn = (async () =>
            new Response(null, { status: 302, headers: { location: 'https://evil.test/' } })) as unknown as typeof fetch
        const client = new WineVoyagerClient({ fetch: fetchFn, baseUrl: 'https://api.test', apiKey: 'k' })
        const err = await client.listDenominations().catch((e) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect(err.message).toMatch(/redirect/)
    })

    const servers: http.Server[] = []
    afterEach(() => servers.splice(0).forEach((s) => s.close()))

    const listen = (handler: http.RequestListener) =>
        new Promise<number>((resolve) => {
            const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port))
            servers.push(s)
        })

    it('a real cross-origin redirect never delivers the key to the other host', async () => {
        const received: (string | undefined)[] = []
        const other = await listen((req, res) => {
            received.push(req.headers['x-api-key'] as string | undefined)
            res.end('{}')
        })
        const api = await listen((_req, res) => {
            res.writeHead(302, { location: `http://localhost:${other}/steal` })
            res.end()
        })
        const client = new WineVoyagerClient({ baseUrl: `http://127.0.0.1:${api}`, apiKey: 'SECRET-KEY' })
        await expect(client.listDenominations()).rejects.toThrow(/redirect/)
        expect(received).toEqual([])
    })
})
