// Smoke test against the real API: spawns the built server over stdio, like a
// real MCP client, and calls each tool once. Run: npm run build && node scripts/smoke.mjs
// Uses WINEVOYAGER_API_KEY from the environment if set (never printed).

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env },
    stderr: 'inherit',
})
const client = new Client({ name: 'smoke', version: '0.0.0' })
await client.connect(transport)

const { tools } = await client.listTools()
console.log('tools:', tools.map((t) => t.name).join(', '))

const calls = [
    ['search_denominations', { region: 'Campania', classification: 'DOCG' }],
    ['search_denominations', { name: 'ciro' }],
    ['get_denomination', { id: 'taurasi' }],
    ['get_denomination', { id: 'aglianico-del-vulture' }],
    ['get_denomination', { id: 'non-esiste' }],
    ['find_denominations_by_grape', { grape: 'Nebbiolo' }],
]
for (const [name, args] of calls) {
    const r = await client.callTool({ name, arguments: args })
    const text = r.content[0].text
    console.log(`\n# ${name} ${JSON.stringify(args)}${r.isError ? ' [isError]' : ''}\n${text.length > 600 ? text.slice(0, 600) + '…' : text}`)
}
await client.close()
