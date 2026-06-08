/**
 * db.js - All database operations
 * Supabase when configured, localStorage fallback otherwise.
 */
import { supabase, DB_READY } from './supabase.js'

const LS_KEY = 'kgreen_expenses_v2'

// ── localStorage helpers ──────────────────────────────────────────────────────
const lsRead  = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
const lsWrite = (rows) => { try { localStorage.setItem(LS_KEY, JSON.stringify(rows)) } catch {} }

// ── FETCH ALL ─────────────────────────────────────────────────────────────────
export async function fetchExpenses() {
  if (DB_READY) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
  return lsRead()
}

// ── INSERT ────────────────────────────────────────────────────────────────────
export async function insertExpense(exp) {
  const row = {
    vendor:   exp.vendor,
    amount:   parseFloat(exp.amount),
    date:     exp.date,
    notes:    exp.notes || '',
    category: exp.category,
    image_b64: exp.image || null,  // base64 stored as text - fine for receipts
  }

  if (DB_READY) {
    const { data, error } = await supabase
      .from('expenses')
      .insert([row])
      .select()
      .single()
    if (error) throw error
    return data
  }

  // localStorage fallback
  const newRow = { ...row, id: Date.now(), created_at: new Date().toISOString() }
  const all = lsRead()
  lsWrite([newRow, ...all])
  return newRow
}

// ── UPDATE ────────────────────────────────────────────────────────────────────
export async function updateExpense(id, updates) {
  const row = {
    vendor:   updates.vendor,
    amount:   parseFloat(updates.amount),
    date:     updates.date,
    notes:    updates.notes || '',
    category: updates.category,
  }

  if (DB_READY) {
    const { data, error } = await supabase
      .from('expenses')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const all = lsRead()
  const updated = all.map(e => e.id === id ? { ...e, ...row } : e)
  lsWrite(updated)
  return updated.find(e => e.id === id)
}

// ── DELETE ONE ────────────────────────────────────────────────────────────────
export async function deleteExpense(id) {
  if (DB_READY) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    return
  }
  lsWrite(lsRead().filter(e => e.id !== id))
}

// ── DELETE MANY ───────────────────────────────────────────────────────────────
export async function deleteExpenses(ids) {
  if (DB_READY) {
    const { error } = await supabase.from('expenses').delete().in('id', ids)
    if (error) throw error
    return
  }
  const idSet = new Set(ids)
  lsWrite(lsRead().filter(e => !idSet.has(e.id)))
}
