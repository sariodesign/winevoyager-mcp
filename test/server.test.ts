// End-to-end over the MCP protocol with an in-memory transport.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { WineVoyagerClient } from '../src/client.js'
import { createServer } from '../src/server.js'
import { makeFetch, VALID_KEY } from './fixtures.js'

async function connect(apiKey?: string, route?: Parameters<typeof makeFetch>[0]) {
    const { fetchFn, calls } = makeFetch(route)
    const server = createServer({ client: new WineVoyagerClient({ fetch: fetchFn, apiKey, baseUrl: 'https://api.test' }) })
    const [a, b] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test', version: '0.0.0' })
    await Promise.all([server.connect(a), client.connect(b)])
    const call = async (name: string, args: Record<string, unknown>) => {
        const r = await client.callTool({ name, arguments: args })
        const text = (r.content as { type: string; text: string }[])[0]!.text
        return { isError: r.isError === true, text, json: r.isError ? undefined : JSON.parse(text) }
    }
    return { client, call, calls }
}

describe('MCP server', () => {
    it('exposes three read-only tools and instructions', async () => {
        const { client } = await connect()
        const { tools } = await client.listTools()
        expect(tools.map((t) => t.name).sort()).toEqual(['find_denominations_by_grape', 'get_denomination', 'search_denominations'])
        for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true)
        const region = (tools.find((t) => t.name === 'search_denominations')!.inputSchema.properties as any).region
        expect(region.enum).toHaveLength(20)
        expect(client.getInstructions()).toMatch(/never guess grapes/)
    })

    it('search: compact list, client-side classification and limit, attribution', async () => {
        const { call } = await connect()
        const r = await call('search_denominations', { classification: 'DOC', limit: 1 })
        expect(r.json.access_level).toBe('basic')
        expect(r.json.total).toBe(2)
        expect(r.json.returned).toBe(1)
        expect(r.json.truncated).toBeDefined()
        expect(r.json.denominations[0]).toEqual({
            id: 'vino-di-prova',
            name: 'Vino di Prova',
            classification: 'DOC',
            regions: ['Toscana'],
            colors: ['red', 'white'],
            full_record: false,
        })
        expect(r.json.attribution).toMatch(/^Data by WineVoyager/)
    })

    it('rejects an invalid colour before calling the API', async () => {
        const { call, calls } = await connect()
        const r = await call('search_denominations', { color: 'orange' })
        expect(r.isError).toBe(true)
        expect(calls).toHaveLength(0)
    })

    it('get: showcase is complete at basic level, no note', async () => {
        const { call } = await connect()
        const r = await call('get_denomination', { id: 'barolo' })
        expect(r.json.full_record).toBe(true)
        expect(r.json.types[0].grapes[0]).toEqual({ name: 'Nebbiolo', min: 100, max: 100 })
        expect(r.json.notes).toBeUndefined()
    })

    it('get: non-showcase at basic level tells the assistant not to guess', async () => {
        const { call } = await connect()
        const r = await call('get_denomination', { id: 'vino-di-prova' })
        expect(r.json.full_record).toBe(false)
        expect(r.json.types).toBeUndefined()
        expect(r.json.notes.join(' ')).toMatch(/Do not guess/)
    })

    it('get: valid key returns the full record', async () => {
        const { call } = await connect(VALID_KEY)
        const r = await call('get_denomination', { id: 'vino-di-prova' })
        expect(r.json.access_level).toBe('full')
        expect(r.json.types).toHaveLength(2)
        expect(r.json.notes).toBeUndefined()
    })

    it('get: an expired key is reported', async () => {
        const { call } = await connect('expired-key')
        const r = await call('get_denomination', { id: 'barolo' })
        expect(r.json.notes.join(' ')).toMatch(/was not accepted/)
    })

    it('get: 404 becomes a tool error pointing to search', async () => {
        const { call } = await connect()
        const r = await call('get_denomination', { id: 'non-esiste' })
        expect(r.isError).toBe(true)
        expect(r.text).toMatch(/search_denominations/)
    })

    it('429 becomes a tool error that says to wait', async () => {
        const { call } = await connect(undefined, () => ({ status: 429, body: { error: 'Too many requests. Please try again later.' } }))
        const r = await call('search_denominations', {})
        expect(r.isError).toBe(true)
        expect(r.text).toMatch(/Wait about a minute/)
    })

    it('grape search: complete with a key', async () => {
        const { call } = await connect(VALID_KEY)
        const r = await call('find_denominations_by_grape', { grape: 'Sangiovese', min_percentage: 50 })
        expect(r.json.count).toBe(1)
        expect(r.json.results[0].id).toBe('vino-di-prova')
        expect(r.json.notes).toBeUndefined()
    })

    it('grape search: flagged as incomplete at basic level', async () => {
        const { call } = await connect()
        const r = await call('find_denominations_by_grape', { grape: 'Sangiovese' })
        expect(r.json.count).toBe(0)
        expect(r.json.denominations_searched).toBe(1)
        expect(r.json.denominations_in_scope).toBe(3)
        expect(r.json.notes.join(' ')).toMatch(/INCOMPLETE/)
    })
})
