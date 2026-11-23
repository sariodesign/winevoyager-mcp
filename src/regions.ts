// Region overview, computed on the client from the denomination list.
// Provinces are left out on purpose: the data has no province-to-region mapping,
// and a denomination spanning several regions lists the provinces of all of them.

import type { Denomination } from './client.js'
import { REGIONS } from './constants.js'

export interface RegionSummary {
    name: string
    denominations: number
    docg: number
    doc: number
}

/** Every Italian region, in alphabetical order, with its DOCG and DOC counts. */
export function summarizeRegions(denominations: Denomination[]): RegionSummary[] {
    const byRegion = new Map<string, RegionSummary>(
        REGIONS.map((name) => [name, { name, denominations: 0, docg: 0, doc: 0 }])
    )
    for (const d of denominations) {
        for (const region of d.regions) {
            let entry = byRegion.get(region)
            if (!entry) {
                // a region name the server does not know yet: keep it rather than drop data
                entry = { name: region, denominations: 0, docg: 0, doc: 0 }
                byRegion.set(region, entry)
            }
            entry.denominations++
            if (d.classification === 'DOCG') entry.docg++
            else entry.doc++
        }
    }
    return [...byRegion.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))
}
