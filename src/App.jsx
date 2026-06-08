import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchExpenses, insertExpense, updateExpense, deleteExpense, deleteExpenses } from './db.js'
import { DB_READY, supabase } from './supabase.js'
import Auth from './Auth.jsx'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

// ── Brand palette ─────────────────────────────────────────────────────────────
// PRIMARY  #2b475c  dark navy   - backgrounds, header, cards, surfaces
// ACCENT   #54a288  teal green  - interactive elements, highlights, amounts
// WHITE    #ffffff              - all text, icons, labels

const C = {
  primary:       '#2b475c',
  primaryDark:   '#1e3347',
  primaryDeep:   '#16293a',
  primaryBg:     '#0f1e2a',
  border:        'rgba(84,162,136,0.2)',
  borderStrong:  'rgba(84,162,136,0.4)',
  accent:        '#54a288',
  accentDim:     'rgba(84,162,136,0.12)',
  accentMid:     'rgba(84,162,136,0.25)',
  white:         '#ffffff',
  whiteOff:      'rgba(255,255,255,0.85)',
  whiteMuted:    'rgba(255,255,255,0.5)',
  whiteDim:      'rgba(255,255,255,0.25)',
  whiteFaint:    'rgba(255,255,255,0.08)',
  danger:        '#e07070',
  dangerBg:      'rgba(220,100,100,0.1)',
  dangerBorder:  'rgba(220,100,100,0.3)',
}

const CATEGORIES = [
  { id: 'meal',   label: 'Meal',   icon: '🍽', color: '#54a288' },
  { id: 'travel', label: 'Travel', icon: '✈',  color: '#7eb8d4' },
  { id: 'cab',    label: 'Cab',    icon: '🚕',  color: '#4ecdc4' },
  { id: 'petrol', label: 'Petrol', icon: '⛽',  color: '#f0a500' },
  { id: 'other',  label: 'Other',  icon: '📦',  color: '#82c785' },
]

const fmtCurrency = (val) => {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

const fmtDate = (s) => {
  try { const d = new Date(s); if (isNaN(d)) return s; return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s }
}

// ── Style tokens ──────────────────────────────────────────────────────────────
const S = {
  nav: (a) => ({
    padding: '8px 18px', borderRadius: '6px',
    border: a ? `1px solid ${C.accent}` : '1px solid transparent',
    background: a ? C.accentDim : 'transparent',
    color: a ? C.accent : C.whiteMuted,
    fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
    WebkitTapHighlightColor: 'transparent'
  }),
  input: {
    width: '100%', background: C.primaryDeep,
    border: `1px solid ${C.border}`, borderRadius: '10px',
    padding: '14px 16px', color: C.white,
    fontSize: '17px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box'
  },
  label: {
    display: 'block', fontSize: '11px', letterSpacing: '2px',
    color: C.accent, textTransform: 'uppercase', marginBottom: '7px', fontWeight: '600'
  },
  pill: (a) => ({
    padding: '10px 18px', borderRadius: '50px',
    border: `1.5px solid ${a ? C.accent : C.border}`,
    background: a ? C.accentDim : 'transparent',
    color: a ? C.accent : C.whiteMuted,
    fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all .15s',
    WebkitTapHighlightColor: 'transparent'
  }),
  btn: (v = 'primary') => ({
    padding: '14px 24px',
    background: v === 'primary' ? `linear-gradient(90deg,${C.accent},${C.primary})`
              : v === 'danger'  ? C.dangerBg : 'transparent',
    border: v === 'outline' ? `1px solid ${C.accent}`
          : v === 'ghost'   ? `1px solid ${C.border}`
          : v === 'danger'  ? `1px solid ${C.dangerBorder}` : 'none',
    borderRadius: '10px',
    color: v === 'outline' ? C.accent : v === 'danger' ? C.danger : C.white,
    fontWeight: '700', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '15px',
    WebkitTapHighlightColor: 'transparent'
  }),
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(expenses) {
  const header = ['Date', 'Vendor', 'Category', 'Amount (INR)', 'Notes']
  const rows = expenses.map(e => [
    e.date || '',
    `"${(e.vendor || '').replace(/"/g, '""')}"`,
    e.category || '',
    parseFloat(e.amount || 0).toFixed(2),
    `"${(e.notes  || '').replace(/"/g, '""')}"`
  ])
  const csv = [header, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Pie chart (pure SVG) ──────────────────────────────────────────────────────
function PieChart({ expenses }) {
  const totals = {}
  expenses.forEach(e => { const amt = parseFloat(e.amount) || 0; totals[e.category] = (totals[e.category] || 0) + amt })
  const grand = Object.values(totals).reduce((s, v) => s + v, 0)
  if (grand === 0) return <div style={{ textAlign: 'center', color: C.whiteMuted, padding: '40px 0', fontSize: '15px' }}>No expense data to chart.</div>

  const slices = []; let cum = -Math.PI / 2
  const cx = 120, cy = 120, r = 100
  CATEGORIES.forEach(cat => {
    const val = totals[cat.id] || 0; if (!val) return
    const angle = (val / grand) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cum), y1 = cy + r * Math.sin(cum)
    const x2 = cx + r * Math.cos(cum + angle), y2 = cy + r * Math.sin(cum + angle)
    const mid = cum + angle / 2
    slices.push({ cat, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${angle > Math.PI ? 1 : 0},1 ${x2},${y2} Z`, lx: cx + r * .65 * Math.cos(mid), ly: cy + r * .65 * Math.sin(mid), pct: ((val/grand)*100).toFixed(1), val, angle })
    cum += angle
  })

  return (
    <div>
      <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: '240px', display: 'block', margin: '0 auto' }}>
        {slices.map(s => (
          <g key={s.cat.id}>
            <path d={s.path} fill={s.cat.color} opacity="0.9" stroke={C.primaryBg} strokeWidth="2" />
            {s.angle > 0.3 && <text x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle" fill={C.white} fontSize="10" fontWeight="700">{s.pct}%</text>}
          </g>
        ))}
        <circle cx={cx} cy={cy} r={r * 0.38} fill={C.primaryDeep} />
        <text x={cx} y={cy - 8}  textAnchor="middle" fill={C.white}  fontSize="11" fontWeight="700">TOTAL</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={C.accent} fontSize="9">
          {new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(grand)}
        </text>
      </svg>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {CATEGORIES.filter(c => totals[c.id]).map(cat => (
          <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: '15px', color: C.white }}>{cat.icon} {cat.label}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: C.white }}>{fmtCurrency(totals[cat.id])}</div>
              <div style={{ fontSize: '12px', color: C.whiteMuted }}>{((totals[cat.id]/grand)*100).toFixed(1)}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: C.primary, borderRadius: '20px 20px 0 0', border: `1px solid ${C.border}`, borderBottom: 'none', padding: '24px 22px 44px', maxHeight: '92vh', overflowY: 'auto', animation: 'slideup .25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: C.white }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.whiteMuted, cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ expense, onSave, onClose }) {
  const [form, setForm] = useState({ ...expense })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [err, setErr] = useState(''); const [saving, setSave] = useState(false)

  const save = async () => {
    if (!form.vendor.trim()) { setErr('Vendor is required.'); return }
    if (!form.amount || isNaN(parseFloat(form.amount))) { setErr('Valid amount is required.'); return }
    if (!form.category) { setErr('Category is required.'); return }
    setSave(true)
    try { await onSave({ ...form, amount: String(parseFloat(form.amount)) }) }
    catch (e) { setErr(`Save failed: ${e.message}`); setSave(false) }
  }

  return (
    <Modal title="Edit Expense" onClose={onClose}>
      {err && <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: C.danger, fontSize: '14px' }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Vendor', key: 'vendor', placeholder: 'Hotel / Shop / Service' },
          { label: 'Amount (INR)', key: 'amount', placeholder: '0.00', type: 'number' },
          { label: 'Date', key: 'date', type: 'date' },
          { label: 'Notes', key: 'notes', placeholder: 'Optional' }
        ].map(f => (
          <div key={f.key}>
            <label style={S.label}>{f.label}</label>
            <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => { set(f.key, e.target.value); setErr('') }}
              placeholder={f.placeholder} style={S.input}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e  => e.target.style.borderColor = C.border} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '22px' }}>
        <div style={S.label}>Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
          {CATEGORIES.map(c => <button key={c.id} onClick={() => { set('category', c.id); setErr('') }} style={S.pill(form.category === c.id)}>{c.icon} {c.label}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onClose} style={{ ...S.btn('ghost'), flex: 1 }} disabled={saving}>Cancel</button>
        <button onClick={save} style={{ ...S.btn('primary'), flex: 2, letterSpacing: '1px', textTransform: 'uppercase', opacity: saving ? .6 : 1 }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onClose, loading }) {
  return (
    <Modal title="Confirm Delete" onClose={onClose}>
      <div style={{ color: C.whiteOff, fontSize: '15px', marginBottom: '26px', lineHeight: '1.7' }}>{message}</div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onClose}    style={{ ...S.btn('ghost'),  flex: 1 }} disabled={loading}>Cancel</button>
        <button onClick={onConfirm} style={{ ...S.btn('danger'), flex: 1, opacity: loading ? .6 : 1 }} disabled={loading}>
          {loading ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}

// ── DB badge ──────────────────────────────────────────────────────────────────
function DbBadge() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: C.accentDim, border: `1px solid ${C.border}`, borderRadius: '50px', padding: '3px 10px', fontSize: '11px', color: C.accent }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: DB_READY ? C.accent : C.whiteMuted, display: 'inline-block' }} />
      {DB_READY ? 'Supabase' : 'Local'}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]           = useState(undefined)  // undefined=loading, null=logged out
  const [stage, setStage]         = useState('home')
  const [expenses, setExpenses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [dbError, setDbError]     = useState('')
  const [imagePreview, setImage]  = useState(null)
  const [extracted, setExtracted] = useState({ vendor: '', amount: '', date: '', notes: '' })
  const [category, setCategory]   = useState('')
  const [error, setError]         = useState('')
  const [filter, setFilter]       = useState('all')
  const [selected, setSelected]   = useState(new Set())
  const [selectMode, setSelMode]  = useState(false)
  const [editingExp, setEditing]  = useState(null)
  const [confirmDel, setConfDel]  = useState(null)
  const [delLoading, setDelLoad]  = useState(false)
  const [saving, setSaving]       = useState(false)
  const [showChart, setShowChart] = useState(false)
  const fileRef = useRef(); const cameraRef = useRef()

  // ── Auth session ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) { setUser(null); return }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
      if (!session) { setExpenses([]); setStage('home') }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = async () => { await supabase?.auth.signOut(); setUser(null); setExpenses([]) }

  // ── Load expenses when user resolves ────────────────────────────────────────
  useEffect(() => {
    if (user === undefined) return
    setLoading(true)
    fetchExpenses()
      .then(rows => { setExpenses(rows); setLoading(false) })
      .catch(e   => { setDbError(e.message); setLoading(false) })
  }, [user])

  // ── Vision API ──────────────────────────────────────────────────────────────
  const scanWithClaude = useCallback(async (base64, mediaType) => {
    if (!ANTHROPIC_API_KEY) {
      setError('API key not configured. Fill in details manually.')
      setExtracted({ vendor: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' })
      setStage('review'); return
    }
    setStage('scanning')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: 'Parse this receipt. Return ONLY raw JSON no markdown:\n{"vendor":"business name","amount":"numeric total only","date":"YYYY-MM-DD or empty","notes":"one line summary"}' }] }] })
      })
      if (!res.ok) { const t = await res.text(); throw new Error(`${res.status}: ${t.slice(0,120)}`) }
      const data = await res.json()
      const raw  = (data.content?.find(b => b.type === 'text')?.text || '').replace(/^```[\w]*\s*/m,'').replace(/\s*```$/m,'').trim()
      const m    = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('No JSON returned')
      const p = JSON.parse(m[0])
      setExtracted({ vendor: p.vendor || '', amount: String(p.amount||'').replace(/[^0-9.]/g,''), date: p.date || new Date().toISOString().split('T')[0], notes: p.notes || '' })
    } catch (e) {
      setError(`Auto-extraction failed: ${e.message}. Fill in manually.`)
      setExtracted({ vendor: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' })
    } finally { setStage('review') }
  }, [])

  const handleFile = useCallback((file) => {
    if (!file) return
    const mType = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) ? file.type : 'image/jpeg'
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const max = 1600; let { width: w, height: h } = img
        if (w > max || h > max) { const sc = max/Math.max(w,h); w = Math.round(w*sc); h = Math.round(h*sc) }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        const comp = c.toDataURL('image/jpeg', 0.85)
        setImage(comp); scanWithClaude(comp.split(',')[1], 'image/jpeg')
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, [scanWithClaude])

  const saveExpense = async () => {
    setError('')
    if (!extracted.vendor.trim()) { setError('Vendor name is required.'); return }
    if (!extracted.amount || isNaN(parseFloat(extracted.amount))) { setError('Valid amount is required.'); return }
    if (!category) { setError('Please select a category.'); return }
    setSaving(true)
    try {
      const saved = await insertExpense({ ...extracted, category, image: imagePreview }, user?.id)
      setExpenses(prev => [saved, ...prev]); setCategory(''); setImage(null); setStage('saved')
    } catch (e) { setError(`Failed to save: ${e.message}`) }
    finally { setSaving(false) }
  }

  const applyEdit = async (updated) => {
    const saved = await updateExpense(updated.id, updated)
    setExpenses(prev => prev.map(e => e.id === updated.id ? { ...e, ...saved } : e))
    setEditing(null)
  }

  const doDelete = async () => {
    setDelLoad(true)
    try {
      if (confirmDel === 'selected') {
        await deleteExpenses([...selected])
        setExpenses(prev => prev.filter(e => !selected.has(e.id)))
        setSelected(new Set()); setSelMode(false)
      } else {
        await deleteExpense(confirmDel)
        setExpenses(prev => prev.filter(e => e.id !== confirmDel))
      }
      setConfDel(null)
    } catch (e) { setDbError(`Delete failed: ${e.message}`); setConfDel(null) }
    finally { setDelLoad(false) }
  }

  const toggleSel    = (id) => setSelected(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleSelAll = (ids) => {
    if (ids.every(id => selected.has(id))) setSelected(p => { const s = new Set(p); ids.forEach(id => s.delete(id)); return s })
    else setSelected(p => { const s = new Set(p); ids.forEach(id => s.add(id)); return s })
  }
  const exitSel = () => { setSelMode(false); setSelected(new Set()) }

  const filtered  = filter === 'all' ? expenses : expenses.filter(e => e.category === filter)
  const total     = filtered.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const visIds    = filtered.map(e => e.id)
  const allSelVis = visIds.length > 0 && visIds.every(id => selected.has(id))

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (user === undefined) return (
    <div style={{ minHeight: '100vh', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${C.border}`, borderTop: `2px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!user && DB_READY) return <Auth onAuth={setUser} />

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg,${C.primaryBg},${C.primaryDark} 60%,${C.primaryBg})`, fontFamily: 'Georgia, serif', color: C.white }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideup{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:rgba(255,255,255,0.25)}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.7)}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.accent};border-radius:2px}
        button:active{opacity:.82;transform:scale(.98)}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: C.primary, borderBottom: `2px solid ${C.accent}`, padding: '16px 22px', paddingTop: 'max(16px,env(safe-area-inset-top))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: `0 4px 20px rgba(84,162,136,0.15)` }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: C.accent, textTransform: 'uppercase', marginBottom: '3px' }}>KGreen Technologies</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: C.white, letterSpacing: '1px' }}>ExpenseScan</div>
            <DbBadge />
          </div>
          {user && (
            <div style={{ fontSize: '11px', color: C.whiteMuted, marginTop: '2px' }}>
              {user.user_metadata?.full_name || user.email?.split('@')[0]}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => { setStage('home'); setError(''); exitSel() }} style={S.nav(['home','scanning'].includes(stage))}>Scan</button>
          <button onClick={() => { setStage('list'); exitSel() }} style={S.nav(['list','saved'].includes(stage))}>
            Expenses {expenses.length > 0 && <span style={{ background: C.accent, borderRadius: '50%', padding: '1px 7px', fontSize: '11px', marginLeft: '5px', color: C.white }}>{expenses.length}</span>}
          </button>
          {user && (
            <button onClick={signOut} title="Sign out"
              style={{ background: C.whiteFaint, border: `1px solid ${C.border}`, color: C.whiteMuted, borderRadius: '8px', padding: '8px 11px', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>
              ⎋
            </button>
          )}
        </div>
      </div>

      {dbError && (
        <div style={{ background: C.dangerBg, borderBottom: `1px solid ${C.dangerBorder}`, padding: '11px 22px', fontSize: '13px', color: C.danger, display: 'flex', justifyContent: 'space-between' }}>
          <span>DB error: {dbError}</span>
          <button onClick={() => setDbError('')} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 18px', paddingBottom: 'max(24px,env(safe-area-inset-bottom))' }}>

        {/* ── HOME ── */}
        {stage === 'home' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '12px', color: C.accent, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Capture Your Expense</div>
              <div style={{ fontSize: '26px', fontWeight: '700', color: C.white }}>Scan a Bill</div>
              <div style={{ fontSize: '14px', color: C.whiteMuted, marginTop: '6px' }}>Upload or photograph any receipt for instant extraction</div>
            </div>
            {!ANTHROPIC_API_KEY && (
              <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: C.danger, fontWeight: '700', marginBottom: '5px' }}>API KEY NOT CONFIGURED</div>
                <div style={{ fontSize: '13px', color: C.whiteOff, lineHeight: '1.6' }}>Set VITE_ANTHROPIC_API_KEY in Vercel. Manual entry still works.</div>
              </div>
            )}
            <div
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
              onDragOver={e => e.preventDefault()} onClick={() => fileRef.current.click()}
              style={{ border: `2px dashed ${C.accent}`, borderRadius: '18px', padding: '48px 22px', textAlign: 'center', cursor: 'pointer', background: C.accentDim, transition: 'background .2s', marginBottom: '14px' }}
              onMouseEnter={e => e.currentTarget.style.background = C.accentMid}
              onMouseLeave={e => e.currentTarget.style.background = C.accentDim}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>📄</div>
              <div style={{ fontSize: '16px', color: C.white, fontWeight: '600' }}>Drop bill here or click to upload</div>
              <div style={{ fontSize: '13px', color: C.whiteMuted, marginTop: '5px' }}>JPG, PNG, WEBP</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            <div style={{ textAlign: 'center', color: C.whiteDim, fontSize: '13px', margin: '10px 0' }}>— or —</div>
            <button onClick={() => cameraRef.current.click()} style={{ width: '100%', padding: '16px', background: C.primary, border: `1px solid ${C.accent}`, borderRadius: '12px', color: C.accent, fontSize: '16px', fontWeight: '600', cursor: 'pointer', letterSpacing: '1px', fontFamily: 'inherit', marginBottom: '12px' }}>
              📷  Take a Photo
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            <button onClick={() => { setExtracted({ vendor: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' }); setImage(null); setError(''); setStage('review') }}
              style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '12px', color: C.whiteMuted, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Manually
            </button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {stage === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '60px 0', animation: 'fadein .3s ease' }}>
            {imagePreview && <img src={imagePreview} alt="" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '16px', border: `2px solid ${C.accent}`, marginBottom: '26px', opacity: .8 }} />}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '11px', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: C.accent, animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i*.3}s` }} />)}
            </div>
            <div style={{ color: C.accent, fontSize: '13px', letterSpacing: '3px', textTransform: 'uppercase' }}>Reading Bill...</div>
            <div style={{ color: C.whiteMuted, fontSize: '13px', marginTop: '8px' }}>Extracting vendor, amount, and date</div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {stage === 'review' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <button onClick={() => { setStage('home'); setError('') }} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.accent, cursor: 'pointer', fontSize: '16px', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              <div>
                <div style={{ fontSize: '11px', color: C.accent, letterSpacing: '3px', textTransform: 'uppercase' }}>Review & Categorize</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: C.white }}>Confirm Expense Details</div>
              </div>
            </div>
            {imagePreview && <img src={imagePreview} alt="Bill" style={{ width: '100%', maxHeight: '170px', objectFit: 'cover', borderRadius: '12px', marginBottom: '18px', border: `1px solid ${C.border}` }} />}
            {error && <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', color: C.danger, fontSize: '14px', lineHeight: '1.5' }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
              {[
                { label: 'Vendor / Hotel / Shop', key: 'vendor', placeholder: 'e.g. Taj Hotel, Ola, BPCL' },
                { label: 'Amount (INR)', key: 'amount', placeholder: 'e.g. 1250.00', type: 'number' },
                { label: 'Date', key: 'date', type: 'date' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'Brief description' }
              ].map(f => (
                <div key={f.key}>
                  <label style={S.label}>{f.label}</label>
                  <input type={f.type||'text'} value={extracted[f.key]} onChange={e => { setExtracted(p=>({...p,[f.key]:e.target.value})); setError('') }}
                    placeholder={f.placeholder||''} style={S.input}
                    onFocus={e => e.target.style.borderColor = C.accent}
                    onBlur={e  => e.target.style.borderColor = C.border} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={S.label}>Category *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {CATEGORIES.map(c => <button key={c.id} onClick={() => { setCategory(c.id); setError('') }} style={S.pill(category===c.id)}>{c.icon} {c.label}</button>)}
              </div>
            </div>
            <button onClick={saveExpense} disabled={saving} style={{ width: '100%', padding: '17px', background: `linear-gradient(90deg,${C.accent},${C.primary})`, border: 'none', borderRadius: '12px', color: C.white, fontSize: '16px', fontWeight: '700', cursor: 'pointer', letterSpacing: '2px', fontFamily: 'inherit', textTransform: 'uppercase', opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        )}

        {/* ── SAVED ── */}
        {stage === 'saved' && (
          <div style={{ textAlign: 'center', padding: '56px 0', animation: 'fadein .4s ease' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: C.accentDim, border: `2px solid ${C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '32px', color: C.white }}>✓</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: C.white, marginBottom: '8px' }}>Expense Saved</div>
            <div style={{ fontSize: '14px', color: C.whiteMuted, marginBottom: '8px' }}>Stored in {DB_READY ? 'Supabase database' : 'local device storage'}</div>
            {DB_READY && <div style={{ fontSize: '13px', color: C.whiteDim, marginBottom: '20px' }}>Accessible from any device</div>}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '18px' }}>
              <button onClick={() => setStage('home')} style={S.btn('primary')}>Scan Another</button>
              <button onClick={() => setStage('list')} style={S.btn('outline')}>View All</button>
            </div>
          </div>
        )}

        {/* ── LIST ── */}
        {stage === 'list' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: C.accent, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '5px' }}>Expense Register</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: C.white }}>My Expenses</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '15px', color: C.accent, fontWeight: '700' }}>{fmtCurrency(total)}</div>
                  {expenses.length > 0 && (
                    <button onClick={() => setShowChart(true)} title="Category chart" style={{ background: C.accentDim, border: `1px solid ${C.border}`, borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '18px' }}>🥧</button>
                  )}
                  {filtered.length > 0 && (
                    <button onClick={() => exportCSV(filtered)} title="Export CSV" style={{ background: C.accentDim, border: `1px solid ${C.border}`, borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', color: C.accent }}>⬇</button>
                  )}
                  {!selectMode && filtered.length > 0 && (
                    <button onClick={() => setSelMode(true)} style={{ background: C.whiteFaint, border: `1px solid ${C.border}`, color: C.whiteMuted, borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Select</button>
                  )}
                  {selectMode && (
                    <button onClick={exitSel} style={{ background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  )}
                </div>
              </div>
            </div>

            {selectMode && filtered.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.primaryDark, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 16px', marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '15px', color: C.whiteOff }}>
                  <input type="checkbox" checked={allSelVis} onChange={() => toggleSelAll(visIds)} style={{ accentColor: C.accent, width: '18px', height: '18px', cursor: 'pointer' }} />
                  {allSelVis ? 'Deselect All' : 'Select All'}
                  {selected.size > 0 && <span style={{ color: C.accent, fontSize: '13px' }}>({selected.size} selected)</span>}
                </label>
                {selected.size > 0 && (
                  <button onClick={() => setConfDel('selected')} style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger, borderRadius: '7px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete {selected.size}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
              {['all', ...CATEGORIES.map(c => c.id)].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 14px', borderRadius: '50px', border: `1px solid ${filter===f ? C.accent : C.border}`, background: filter===f ? C.accentDim : 'transparent', color: filter===f ? C.accent : C.whiteMuted, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                  {f==='all' ? 'All' : CATEGORIES.find(c=>c.id===f)?.icon+' '+f}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.whiteMuted }}>
                <div style={{ width: '26px', height: '26px', border: `2px solid ${C.border}`, borderTop: `2px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                <div style={{ fontSize: '14px' }}>Loading expenses...</div>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '54px 0' }}>
                <div style={{ fontSize: '38px', marginBottom: '12px' }}>🧾</div>
                <div style={{ marginBottom: '16px', fontSize: '15px', color: C.whiteMuted }}>No expenses recorded yet</div>
                <button onClick={() => setStage('home')} style={S.btn('primary')}>Scan First Bill</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(exp => {
                const cat   = CATEGORIES.find(c => c.id === exp.category)
                const isSel = selected.has(exp.id)
                const img   = exp.image_b64 || exp.image
                return (
                  <div key={exp.id} onClick={() => selectMode && toggleSel(exp.id)}
                    style={{ background: isSel ? C.accentDim : C.primaryDark, border: `1px solid ${isSel ? C.accent : C.border}`, borderRadius: '14px', padding: '15px', display: 'flex', gap: '13px', alignItems: 'flex-start', cursor: selectMode ? 'pointer' : 'default', transition: 'border-color .15s,background .15s' }}>

                    {selectMode ? (
                      <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSel(exp.id)} onClick={e=>e.stopPropagation()} style={{ accentColor: C.accent, width: '20px', height: '20px', cursor: 'pointer' }} />
                      </div>
                    ) : img ? (
                      <img src={img} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${C.border}`, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>{cat?.icon}</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: '700', color: C.white, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '10px' }}>{exp.vendor}</div>
                        <div style={{ fontWeight: '700', color: C.accent, fontSize: '15px', flexShrink: 0 }}>{fmtCurrency(exp.amount)}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: C.whiteDim, marginTop: '3px' }}>{fmtDate(exp.date)}</div>
                      {exp.notes && <div style={{ fontSize: '13px', color: C.whiteMuted, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.notes}</div>}
                      <div style={{ marginTop: '9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ background: `${cat?.color}22`, border: `1px solid ${cat?.color}55`, borderRadius: '50px', padding: '3px 10px', fontSize: '12px', color: cat?.color || C.accent }}>{cat?.icon} {cat?.label}</span>
                        {!selectMode && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={e => { e.stopPropagation(); setEditing(exp) }} style={{ background: C.accentDim, border: `1px solid ${C.border}`, color: C.accent, borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                            <button onClick={e => { e.stopPropagation(); setConfDel(exp.id) }} style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger, borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {editingExp && <EditModal expense={editingExp} onSave={applyEdit} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <ConfirmModal
          message={confirmDel === 'selected' ? `Permanently delete ${selected.size} selected expense${selected.size>1?'s':''}?` : 'Permanently delete this expense?'}
          onConfirm={doDelete} onClose={() => setConfDel(null)} loading={delLoading}
        />
      )}
      {showChart && (
        <Modal title="Spending by Category" onClose={() => setShowChart(false)}>
          <PieChart expenses={expenses} />
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowChart(false)} style={{ ...S.btn('ghost'), flex: 1 }}>Close</button>
            {filtered.length > 0 && <button onClick={() => { exportCSV(filtered); setShowChart(false) }} style={{ ...S.btn('outline'), flex: 1, fontSize: '14px' }}>⬇ Export CSV</button>}
          </div>
        </Modal>
      )}
    </div>
  )
}
