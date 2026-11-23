// Region overview: DOCG/DOC counts computed from the denomination list, plus the
// provinces of each region from GET /v1/regions (the API maps every province to
// its own region, so multi-region denominations do not leak provinces).

import type { Denomination, RegionInfo } from './client.js'
import { REGIONS } from './constants.js'

export interface RegionSummary {
    name: string
    denominations: number
    docg: number
    doc: number
    /** Provinces of the region that at least one denomination names. */
    provinces: string[]
}

/** Every Italian region, in alphabetical order, with its DOCG and DOC counts and provinces. */
export function summarizeRegions(denominations: Denomination[], regionInfo: RegionInfo[] = []): RegionSummary[] {
    const byRegion = new Map<string, RegionSummary>(
        REGIONS.map((name) => [name, { name, denominations: 0, docg: 0, doc: 0, provinces: [] }])
    )
    const entry = (name: string): RegionSummary => {
        let e = byRegion.get(name)
        if (!e) {
            // a region name the server does not know yet: keep it rather than drop data
            e = { name, denominations: 0, docg: 0, doc: 0, provinces: [] }
            byRegion.set(name, e)
        }
        return e
    }

    for (const d of denominations) {
        for (const region of d.regions) {
            const e = entry(region)
            e.denominations++
            if (d.classification === 'DOCG') e.docg++
            else e.doc++
        }
    }
    for (const info of regionInfo) entry(info.name).provinces = info.provinces

    return [...byRegion.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))
}
