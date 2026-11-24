#!/usr/bin/env node
// stdio entrypoint: `npx winevoyager-mcp`.
// stdout carries the MCP protocol only: logs go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const apiKey = process.env.WINEVOYAGER_API_KEY?.trim() || undefined
const baseUrl = process.env.WINEVOYAGER_API_URL?.trim() || undefined

let server
try {
    server = createServer({ apiKey, baseUrl })
} catch (error) {
    // e.g. a non-https WINEVOYAGER_API_URL: stop before any request carries the key
    console.error(`[winevoyager-mcp] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
}
await server.connect(new StdioServerTransport())

console.error(`[winevoyager-mcp] ready (${apiKey ? 'API key set: full level if valid' : 'no API key: basic level'})`)
