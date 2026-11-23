import { describe, expect, it } from 'vitest'
import { findByGrape, grapeNameMatches } from '../src/grapes.js'
import { FULL } from './fixtures.js'

describe('grapeNameMatches', () => {
    it('matches whole words, ignoring case and accents', () => {
        expect(grapeNameMatches('Trebbiano toscano', 'trebbiano')).toBe(true)
        expect(grapeNameMatches('Trebbiano toscano', 'Trebbiano Toscano')).toBe(true)
        expect(grapeNameMatches('Nerello mascalese', 'nerello')).toBe(true)
        expect(grapeNameMatches('Nebbiolo', 'nebbio')).toBe(false)
        expect(grapeNameMatches('Moscato bianco', 'bianco moscato')).toBe(false)
    })
})

describe('findByGrape', () => {
    it('finds single grapes and any_of groups', () => {
        const hits = findByGrape(FULL, 'Trebbiano')
        expect(hits).toHaveLength(1)
        expect(hits[0]!.matches[0]).toMatchObject({
            grape: 'Trebbiano toscano',
            group: ['Trebbiano toscano', 'Malvasia bianca lunga'],
            min: 60,
        })
    })

    it('finds a grape across denominations', () => {
        expect(findByGrape(FULL, 'sangiovese').map((h) => h.id)).toEqual(['vino-di-prova', 'cirò'])
    })

    it('min_percentage keeps only single-grape minimums at or above the value', () => {
        expect(findByGrape(FULL, 'Sangiovese', 70).map((h) => h.id)).toEqual(['vino-di-prova'])
        expect(findByGrape(FULL, 'Sangiovese', 71)).toEqual([])
        // a group minimum does not apply to one grape alone
        expect(findByGrape(FULL, 'Trebbiano', 50)).toEqual([])
    })
})
