import { supabase, DB_READY } from './supabase.js'

const LS_KEY  = 'kgreen_expenses_v3'
const lsRead  = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
const lsWrite = (rows) => { try { localStorage.setItem(LS_KEY, JSON.stringify(rows)) } catch {} }

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

export async function insertExpense(exp, userId) {
  const row = {
    user_id:   userId || null,
    vendor:    exp.vendor,
    amount:    parseFloat(exp.amount),
    date:      exp.date,
    notes:     exp.notes || '',
    category:  exp.category,
    image_b64: exp.image || null,
  }
  if (DB_READY) {
    const { data, error } = await supabase.from('expenses').insert([row]).select().single()
    if (error) throw error
    return data
  }
  const newRow = { ...row, id: Date.now(), created_at: new Date().toISOString() }
  lsWrite([newRow, ...lsRead()])
  return newRow
}

export async function updateExpense(id, updates) {
  const row = {
    vendor:   updates.vendor,
    amount:   parseFloat(updates.amount),
    date:     updates.date,
    notes:    updates.notes || '',
    category: updates.category,
  }
  if (DB_READY) {
    const { data, error } = await supabase.from('expenses').update(row).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  const all = lsRead()
  const updated = all.map(e => e.id === id ? { ...e, ...row } : e)
  lsWrite(updated)
  return updated.find(e => e.id === id)
}

export async function deleteExpense(id) {
  if (DB_READY) { const { error } = await supabase.from('expenses').delete().eq('id', id); if (error) throw error; return }
  lsWrite(lsRead().filter(e => e.id !== id))
}

export async function deleteExpenses(ids) {
  if (DB_READY) { const { error } = await supabase.from('expenses').delete().in('id', ids); if (error) throw error; return }
  const s = new Set(ids); lsWrite(lsRead().filter(e => !s.has(e.id)))
}
