import { describe, expect, it } from 'vitest'
import { summarizeRegions } from '../src/regions.js'
import { FULL } from './fixtures.js'

describe('summarizeRegions', () => {
    it('counts a multi-region denomination in each region', () => {
        const multi = { ...FULL[0]!, id: 'garda-test', classification: 'DOC' as const, regions: ['Lombardia', 'Veneto'] }
        const regions = summarizeRegions([multi])
        expect(regions.find((r) => r.name === 'Lombardia')).toEqual({ name: 'Lombardia', denominations: 1, docg: 0, doc: 1, provinces: [] })
        expect(regions.find((r) => r.name === 'Veneto')).toEqual({ name: 'Veneto', denominations: 1, docg: 0, doc: 1, provinces: [] })
    })

    it('keeps a region name it does not know instead of dropping it', () => {
        const odd = { ...FULL[0]!, regions: ['Regione Nuova'] }
        const regions = summarizeRegions([odd])
        expect(regions).toHaveLength(21)
        expect(regions.find((r) => r.name === 'Regione Nuova')?.denominations).toBe(1)
    })

    it('takes provinces from the API region list', () => {
        const regions = summarizeRegions(FULL, [
            { name: 'Piemonte', count: 1, provinces: ['Cuneo'] },
            { name: 'Calabria', count: 1, provinces: ['Crotone'] },
        ])
        expect(regions.find((r) => r.name === 'Piemonte')?.provinces).toEqual(['Cuneo'])
        expect(regions.find((r) => r.name === 'Calabria')?.provinces).toEqual(['Crotone'])
        expect(regions.find((r) => r.name === 'Toscana')?.provinces).toEqual([])
    })

    it('returns regions in Italian alphabetical order', () => {
        const names = summarizeRegions([]).map((r) => r.name)
        expect(names[0]).toBe('Abruzzo')
        expect(names.at(-1)).toBe('Veneto')
    })
})
