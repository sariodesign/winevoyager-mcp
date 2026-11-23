// Offline runtime check: starts the built server over stdio and lists the tools.
// No API calls, so it is safe in CI. Run: node scripts/check-stdio.mjs

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const expected = ['find_denominations_by_grape', 'get_denomination', 'list_regions', 'search_denominations']

const client = new Client({ name: 'check-stdio', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'], stderr: 'ignore' }))
const names = (await client.listTools()).tools.map((t) => t.name).sort()
await client.close()

if (JSON.stringify(names) !== JSON.stringify(expected)) {
    console.error(`Unexpected tools: ${names.join(', ')}`)
    process.exit(1)
}
console.log(`OK on Node ${process.version}: ${names.join(', ')}`)
