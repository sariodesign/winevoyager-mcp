// Reverse search by grape variety, done on the client: the API has no grape filter.

import type { Denomination, Grape } from './client.js'

/** Lowercase, no accents, uniform apostrophes, compact spaces (same rules as the API filters). */
export function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[’‘`´]/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
}

/** True when every word of the query appears, in order, as whole words of the grape name. */
export function grapeNameMatches(grapeName: string, query: string): boolean {
    const name = ` ${normalize(grapeName).replace(/[^a-z0-9']+/g, ' ')} `
    const q = normalize(query).replace(/[^a-z0-9']+/g, ' ').trim()
    return q !== '' && name.includes(` ${q} `)
}

export interface GrapeMatch {
    type: string
    /** The grape as named in the disciplinare. */
    grape: string
    /** Set when the grape is part of an "X and/or Y" group: min/max apply to the whole group. */
    group?: string[]
    min?: number
    max?: number
}

export interface DenominationGrapeHit {
    id: string
    name: string
    classification: string
    regions: string[]
    matches: GrapeMatch[]
}

function matchGrape(entry: Grape, query: string): Pick<GrapeMatch, 'grape' | 'group'> | undefined {
    if (entry.name && grapeNameMatches(entry.name, query)) return { grape: entry.name }
    const hit = entry.any_of?.find((g) => grapeNameMatches(g, query))
    if (hit) return { grape: hit, group: entry.any_of }
    return undefined
}

/**
 * Finds the types of each denomination that name the grape.
 * With `minPercentage`, keeps only single-grape entries whose minimum is at least that value:
 * a group minimum ("X and/or Y: min 60%") says nothing about one grape alone.
 */
export function findByGrape(denominations: Denomination[], query: string, minPercentage?: number): DenominationGrapeHit[] {
    const hits: DenominationGrapeHit[] = []
    for (const d of denominations) {
        const matches: GrapeMatch[] = []
        for (const type of d.types ?? []) {
            for (const entry of type.grapes) {
                const m = matchGrape(entry, query)
                if (!m) continue
                if (minPercentage !== undefined && (m.group || (entry.min ?? 0) < minPercentage)) continue
                matches.push({ type: type.name, ...m, min: entry.min, max: entry.max })
            }
        }
        if (matches.length > 0) {
            hits.push({ id: d.id, name: d.name, classification: d.classification, regions: d.regions, matches })
        }
    }
    return hits
}
