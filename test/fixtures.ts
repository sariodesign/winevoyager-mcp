// Synthetic records shaped like the API's. Invented on purpose: real Full data
// must never be committed (the licence forbids stored copies).

import type { Denomination } from '../src/client.js'

const source = { eambrosia_url: 'https://example.test/eambrosia' }

export const FULL: Denomination[] = [
    {
        id: 'barolo',
        ea_code: 'PDO-IT-T0001',
        name: 'Barolo',
        classification: 'DOCG',
        regions: ['Piemonte'],
        provinces: ['Cuneo'],
        recognition_year: 1980,
        colors: ['red'],
        methods: [],
        types: [{ name: 'Barolo', grapes: [{ name: 'Nebbiolo', min: 100, max: 100 }] }],
        source,
    },
    {
        id: 'vino-di-prova',
        ea_code: 'PDO-IT-T0002',
        name: 'Vino di Prova',
        classification: 'DOC',
        regions: ['Toscana'],
        provinces: ['Siena'],
        recognition_year: 2001,
        colors: ['red', 'white'],
        methods: ['sparkling'],
        types: [
            { name: 'Vino di Prova Rosso', grapes: [{ name: 'Sangiovese', min: 70 }, { name: 'Canaiolo nero', max: 30 }] },
            {
                name: 'Vino di Prova Bianco Spumante',
                methods: ['sparkling'],
                grapes: [{ any_of: ['Trebbiano toscano', 'Malvasia bianca lunga'], min: 60 }],
            },
        ],
        source,
    },
    {
        id: 'cirò',
        ea_code: 'PDO-IT-T0003',
        name: 'Cirò',
        classification: 'DOC',
        regions: ['Calabria'],
        provinces: ['Crotone'],
        recognition_year: 1969,
        colors: ['red'],
        methods: [],
        types: [{ name: 'Cirò Rosso', grapes: [{ name: 'Gaglioppo', min: 80 }, { name: 'Sangiovese', max: 20 }] }],
        source,
    },
]

/** Basic level: only showcase ids (here: barolo) keep types and methods. */
export const BASIC: Denomination[] = FULL.map((d) => {
    if (d.id === 'barolo') return d
    const { types, methods, ...rest } = d
    return rest
})

export const VALID_KEY = 'test-key-valid'

type Route = (url: URL, key: string | undefined) => { status: number; body: unknown }

/** Fake API: mirrors the real handlers' behaviour for access levels and errors. */
export const fakeApi: Route = (url, key) => {
    const level = key === VALID_KEY ? 'full' : 'basic'
    const data = level === 'full' ? FULL : BASIC
    const m = url.pathname.match(/^\/v1\/denominations(?:\/(.+))?$/)
    if (!m) return { status: 404, body: { error: 'Not Found' } }
    if (m[1]) {
        const d = data.find((x) => x.id === decodeURIComponent(m[1]!))
        return d ? { status: 200, body: { ...d, access_level: level } } : { status: 404, body: { error: 'Denomination not found' } }
    }
    const color = url.searchParams.get('color')
    if (color && !['red', 'white', 'rose'].includes(color)) {
        return { status: 400, body: { error: 'Invalid query parameter: color must be one of red, white, rose' } }
    }
    let list = data
    if (color) list = list.filter((d) => d.colors.includes(color))
    const region = url.searchParams.get('region')
    if (region) list = list.filter((d) => d.regions.includes(region))
    const province = url.searchParams.get('province')
    if (province) list = list.filter((d) => d.provinces.some((p) => p.toLowerCase() === province.toLowerCase()))
    const name = url.searchParams.get('name')
    if (name) list = list.filter((d) => d.name.toLowerCase().includes(name.toLowerCase()))
    return { status: 200, body: { denominations: list, count: list.length, access_level: level } }
}

export function makeFetch(route: Route = fakeApi) {
    const calls: { url: string; key?: string }[] = []
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input))
        const key = (init?.headers as Record<string, string> | undefined)?.['x-api-key']
        calls.push({ url: url.toString(), key })
        const { status, body } = route(url, key)
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    return { fetchFn, calls }
}
