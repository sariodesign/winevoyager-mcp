#!/usr/bin/env node
// stdio entrypoint: `npx winevoyager-mcp`.
// stdout carries the MCP protocol only: logs go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const apiKey = process.env.WINEVOYAGER_API_KEY?.trim() || undefined
const baseUrl = process.env.WINEVOYAGER_API_URL?.trim() || undefined

const server = createServer({ apiKey, baseUrl })
await server.connect(new StdioServerTransport())

console.error(`[winevoyager-mcp] ready (${apiKey ? 'API key set: full level if valid' : 'no API key: basic level'})`)
