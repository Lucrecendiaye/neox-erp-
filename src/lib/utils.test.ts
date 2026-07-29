import { describe, it, expect } from 'vitest'
import { formatCurrency, generateId, calculateMargin, formatDate } from './utils'

describe('formatCurrency', () => {
  it('formats numbers', () => {
    const result = formatCurrency(1000)
    expect(result).toBeTruthy()
    expect(result).toContain('1')
  })

  it('handles decimals', () => {
    const result = formatCurrency(99.99)
    expect(result).toBeTruthy()
  })

  it('formats zero', () => {
    const result = formatCurrency(0)
    expect(result).toBeTruthy()
  })
})

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string')
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })
})

describe('calculateMargin', () => {
  it('calculates margin percentage', () => {
    expect(calculateMargin(100, 150)).toBe(50)
    expect(calculateMargin(200, 200)).toBe(0)
    expect(calculateMargin(0, 100)).toBe(0)
  })
})

describe('formatDate', () => {
  it('formats ISO date strings', () => {
    const result = formatDate('2026-07-23T12:00:00Z')
    expect(result).toBeTruthy()
  })
})
