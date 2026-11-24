// MCP server: four tools over the WineVoyager API.
// Stateless apart from the client's short in-memory cache. Transport-agnostic:
// `index.ts` connects it to stdio; a future HTTP entrypoint can reuse it.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ApiError, type ApiResult, type Denomination, WineVoyagerClient } from './client.js'
import { ATTRIBUTION, CLASSIFICATIONS, COLORS, REGIONS, SHOWCASE_IDS, SUPPORT_EMAIL } from './constants.js'
import { findByGrape } from './grapes.js'
import { summarizeRegions } from './regions.js'

export const SERVER_NAME = 'winevoyager'
export const SERVER_VERSION = '0.3.1'

const INSTRUCTIONS = `WineVoyager: verified data on the Italian DOP wine denominations (DOCG and DOC), read from the official MASAF disciplinari and cross-checked with the EU eAmbrosia register.

Use these tools instead of answering from memory about grapes, percentages, regions, provinces or wine types of Italian denominations.
- search_denominations: find denominations and their ids by name, region, province, colour or classification; page through all of them with offset.
- get_denomination: the full record of one denomination (wine types, grapes with min/max %, production methods, official source).
- find_denominations_by_grape: which denominations name a given grape variety.
- list_regions: the 20 regions with their number of DOCG and DOC and their wine-producing provinces.

Access levels: without an API key the server works at the "basic" level: basic data for every denomination, but wine types and grapes only for ${SHOWCASE_IDS.join(', ')}. For the others, say that the full record needs a WineVoyager key and never guess grapes or percentages.

Grapes: only the varieties the disciplinare names explicitly are listed. When the percentages of a type do not reach 100%, the rest is usually a generic share of "other varieties suitable in the region" that the data does not list: say so briefly instead of guessing which varieties or how much.

How to answer:
- Answer like a knowledgeable sommelier: direct and concise, with the facts the user asked for.
- End the answer with one short line: "${ATTRIBUTION}" (required by the data licence). Nothing more by default.
- Give the official source (the source.eambrosia_url link and the source.text_updated_to date) only when the user asks for sources, when the use is professional (labels, compliance, exams, consulting), or when data is missing and the user should check the official text. Do not add the MASAF archive link unless asked.
- Do not add generic disclaimers to every answer.`

const BASIC_NOTE = `This denomination's wine types, grapes and production methods are not included at the basic level (no API key). Do not guess them: tell the user they need a WineVoyager API key (free Early Access for 60 days, request at ${SUPPORT_EMAIL}) or can check the official disciplinare via source.eambrosia_url (give that link here).`

const KEY_REJECTED_NOTE = `The configured WINEVOYAGER_API_KEY was not accepted (invalid or expired: Early Access keys last 60 days), so results are at the basic level. Tell the user to check the key or write to ${SUPPORT_EMAIL}.`

export interface ServerOptions {
    client?: WineVoyagerClient
    apiKey?: string
    baseUrl?: string
}

export function createServer(options: ServerOptions = {}): McpServer {
    const client = options.client ?? new WineVoyagerClient({ apiKey: options.apiKey, baseUrl: options.baseUrl })

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS })

    const region = z
        .enum(REGIONS)
        .optional()
        .describe('Italian region, exactly as listed. A denomination spanning several regions matches each of them.')
    const color = z.enum(COLORS).optional().describe('Wine colour: red, white or rose.')
    const classification = z.enum(CLASSIFICATIONS).optional().describe('DOCG (the top tier) or DOC.')

    server.registerTool(
        'search_denominations',
        {
            title: 'Search Italian wine denominations',
            description:
                'Find Italian DOCG/DOC wine denominations by partial name (accents and case ignored: "ciro" finds Cirò), region, province, colour or classification. Returns a compact list with the id to pass to get_denomination. Use it first when you do not know the exact id. All filters are optional and combined with AND. Without filters it lists every denomination: page through with offset.',
            inputSchema: {
                name: z.string().min(1).max(100).optional().describe('Part of the denomination name, e.g. "Chianti", "Montepulciano".'),
                region,
                province: z
                    .string()
                    .min(2)
                    .max(60)
                    .optional()
                    .describe(
                        'Italian province, in Italian, e.g. "Cuneo", "Bolzano", "Reggio Emilia". Also matches denominations whose zone is the whole region the province belongs to.'
                    ),
                color,
                classification,
                limit: z.number().int().min(1).max(100).default(20).describe('Maximum results to return (default 20).'),
                offset: z.number().int().min(0).default(0).describe('Results to skip, for paging (default 0).'),
            },
            annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        },
        async ({ name, region, province, color, classification, limit, offset }) =>
            run(async () => {
                const result = await client.listDenominations({ name, region, province, color })
                const all = classification ? result.data.filter((d) => d.classification === classification) : result.data
                const denominations = all.slice(offset, offset + limit).map((d) => ({
                    id: d.id,
                    name: d.name,
                    classification: d.classification,
                    regions: d.regions,
                    provinces: d.provinces,
                    colors: d.colors,
                    full_record: d.types !== undefined,
                }))
                const nextOffset = offset + denominations.length
                const notes =
                    province && all.length === 0 && !name && !region && !color && !classification
                        ? `No denomination lists the province "${province}". Check the spelling: use the Italian name, e.g. "Bolzano", not "Bozen" or "South Tyrol".`
                        : undefined
                return respond(
                    result,
                    {
                        total: all.length,
                        offset,
                        returned: denominations.length,
                        ...(nextOffset < all.length && { next_offset: nextOffset }),
                        denominations,
                    },
                    notes
                )
            })
    )

    server.registerTool(
        'list_regions',
        {
            title: 'List Italian wine regions',
            description:
                'The 20 Italian regions with how many DOCG and DOC denominations each has and the provinces where they are produced. Use it for overviews ("which region has the most DOCG?", "which provinces of Veneto make DOC wine?") or before searching by region or province. A denomination spanning several regions is counted in each of them. Provinces are only those named by at least one denomination; a region whose denominations all cover the whole region (e.g. Sardinia) may list fewer.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        },
        async () =>
            run(async () => {
                // both responses are cached: grape search and paging reuse the list
                const [result, regionInfo] = await Promise.all([client.listDenominations(), client.listRegions()])
                return respond(result, { regions: summarizeRegions(result.data, regionInfo) })
            })
    )

    server.registerTool(
        'get_denomination',
        {
            title: 'Get an Italian wine denomination',
            description:
                'Full record of one Italian DOCG/DOC denomination by id (e.g. "barolo", "brunello-di-montalcino"): regions, provinces, recognition year, colours, wine types with the grapes the disciplinare names and their min/max percentages, production methods (sparkling, passito, fortified), parent/child denominations and a source object for verification (cite it only when the user needs it). A grape entry with any_of is a group whose percentage applies to the group as a whole. If you do not know the id, call search_denominations first.',
            inputSchema: {
                id: z
                    .string()
                    .min(1)
                    .max(100)
                    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase slug with hyphens, e.g. "barbera-d-asti"')
                    .describe('Denomination id: lowercase slug without DOC/DOCG suffix.'),
            },
            annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        },
        async ({ id }) =>
            run(async () => {
                const result = await client.getDenomination(id)
                const d = result.data
                const full = d.types !== undefined
                return respond(result, { full_record: full, ...d }, full ? undefined : BASIC_NOTE)
            })
    )

    server.registerTool(
        'find_denominations_by_grape',
        {
            title: 'Find Italian wine denominations by grape',
            description:
                'Which Italian DOCG/DOC denominations, and which of their wine types, name a grape variety in the disciplinare, with min/max percentages. Matches whole words, accents ignored: "Trebbiano" also finds "Trebbiano toscano". Use min_percentage for questions like "where must Sangiovese be at least 80%?". Without an API key only the showcase denominations can be searched, so results are incomplete.',
            inputSchema: {
                grape: z.string().min(2).max(60).describe('Grape variety in Italian, e.g. "Nebbiolo", "Sangiovese", "Glera".'),
                region,
                color,
                classification,
                min_percentage: z
                    .number()
                    .min(0)
                    .max(100)
                    .optional()
                    .describe('Keep only types where this grape alone must be at least this percentage.'),
            },
            annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
        },
        async ({ grape, region, color, classification, min_percentage }) =>
            run(async () => {
                const result = await client.listDenominations({ region, color })
                const pool = classification ? result.data.filter((d) => d.classification === classification) : result.data
                const searched = pool.filter((d) => d.types !== undefined)
                const hits = findByGrape(searched, grape, min_percentage)
                const incomplete = searched.length < pool.length
                return respond(
                    result,
                    {
                        grape,
                        denominations_searched: searched.length,
                        denominations_in_scope: pool.length,
                        count: hits.length,
                        results: hits,
                    },
                    incomplete
                        ? `Only ${searched.length} of ${pool.length} denominations in scope have grape data at the basic level (the showcase ones), so this list is INCOMPLETE. Say so to the user. The full search needs a WineVoyager API key (free Early Access for 60 days, request at ${SUPPORT_EMAIL}).`
                        : undefined
                )
            })
    )

    return server
}

/** Builds the tool result: JSON payload, notes for the assistant, attribution. */
function respond(result: ApiResult<unknown>, payload: Record<string, unknown>, note?: string): CallToolResult {
    const notes = [result.keyRejected ? KEY_REJECTED_NOTE : undefined, note].filter(Boolean)
    const body = {
        access_level: result.accessLevel,
        ...payload,
        ...(notes.length > 0 && { notes }),
        attribution: ATTRIBUTION,
    }
    return { content: [{ type: 'text', text: JSON.stringify(body) }] }
}

async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
    try {
        return await fn()
    } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Unexpected error while calling WineVoyager.'
        if (!(error instanceof ApiError)) console.error('[winevoyager-mcp]', error)
        return { isError: true, content: [{ type: 'text', text: message }] }
    }
}

// Re-exported for tests and embedders.
export type { Denomination }
