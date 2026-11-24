import { nanoid } from 'nanoid'
import { store } from '../db/store.js'

export function addRecord(data) {
  const record = { id: nanoid(12), at: Date.now(), ...data }
  store.insert('records', record)
  return record
}

export function listRecords(userId, page = 1, pageSize = 20) {
  const all = store.filter('records', (r) => r.players?.some((p) => p.id === userId))
    .sort((a, b) => b.at - a.at)
  const start = (page - 1) * pageSize
  return {
    total: all.length,
    page,
    pageSize,
    list: all.slice(start, start + pageSize),
  }
}

export function recordDetail(id) {
  return store.find('records', (r) => r.id === id) || null
}
