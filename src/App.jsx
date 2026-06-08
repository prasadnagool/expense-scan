import { useState, useRef, useCallback, useEffect } from 'react'
import { fetchExpenses, insertExpense, updateExpense, deleteExpense, deleteExpenses } from './db.js'
import { DB_READY } from './supabase.js'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

const CATEGORIES = [
  { id: 'meal',   label: 'Meal',   icon: '🍽', color: '#FD5A55' },
  { id: 'travel', label: 'Travel', icon: '✈',  color: '#c084fc' },
  { id: 'cab',    label: 'Cab',    icon: '🚕',  color: '#38bdf8' },
  { id: 'petrol', label: 'Petrol', icon: '⛽',  color: '#fb923c' },
  { id: 'other',  label: 'Other',  icon: '📦',  color: '#a3e635' },
]

const fmtCurrency = (val) => {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

const fmtDate = (s) => {
  try { const d = new Date(s); if (isNaN(d)) return s; return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return s }
}

// ── Style tokens (bumped font sizes throughout) ───────────────────────────────
const S = {
  nav: (a) => ({
    padding: '8px 18px', borderRadius: '6px',
    border: a ? '1px solid #FD5A55' : '1px solid transparent',
    background: a ? 'rgba(253,90,85,0.15)' : 'transparent',
    color: a ? '#FD5A55' : '#aaa',
    fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
    WebkitTapHighlightColor: 'transparent'
  }),
  input: {
    width: '100%', background: '#160810',
    border: '1px solid #3a1a28', borderRadius: '10px',
    padding: '14px 16px', color: '#fff',
    fontSize: '17px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box'
  },
  label: {
    display: 'block', fontSize: '11px', letterSpacing: '2px',
    color: '#FD5A55', textTransform: 'uppercase', marginBottom: '7px', fontWeight: '600'
  },
  pill: (a) => ({
    padding: '10px 18px', borderRadius: '50px',
    border: `1.5px solid ${a ? '#FD5A55' : '#2e1020'}`,
    background: a ? 'rgba(253,90,85,.15)' : 'transparent',
    color: a ? '#FD5A55' : '#999',
    fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all .15s',
    WebkitTapHighlightColor: 'transparent'
  }),
  btn: (v = 'primary') => ({
    padding: '14px 24px',
    background: v === 'primary' ? 'linear-gradient(90deg,#FD5A55,#c73c38)'
              : v === 'danger'  ? '#7a1515' : 'transparent',
    border: v === 'outline' ? '1px solid #FD5A55'
          : v === 'ghost'   ? '1px solid #2e1020'
          : v === 'danger'  ? '1px solid #c03030' : 'none',
    borderRadius: '10px',
    color: v === 'outline' ? '#FD5A55' : v === 'danger' ? '#ff8080' : '#fff',
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
  a.href     = url
  a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Pie chart (pure SVG, no library) ─────────────────────────────────────────
function PieChart({ expenses }) {
  const totals = {}
  expenses.forEach(e => {
    const amt = parseFloat(e.amount) || 0
    totals[e.category] = (totals[e.category] || 0) + amt
  })
  const grand = Object.values(totals).reduce((s, v) => s + v, 0)
  if (grand === 0) return (
    <div style={{ textAlign: 'center', color: '#555', padding: '40px 0', fontSize: '15px' }}>No expense data to chart.</div>
  )

  // Build pie slices
  const slices = []
  let cumAngle = -Math.PI / 2  // start at 12 o'clock
  const cx = 120, cy = 120, r = 100

  CATEGORIES.forEach(cat => {
    const val = totals[cat.id] || 0
    if (val === 0) return
    const angle = (val / grand) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    const x2 = cx + r * Math.cos(cumAngle + angle)
    const y2 = cy + r * Math.sin(cumAngle + angle)
    const large = angle > Math.PI ? 1 : 0
    const midAngle = cumAngle + angle / 2
    const lx = cx + (r * 0.65) * Math.cos(midAngle)
    const ly = cy + (r * 0.65) * Math.sin(midAngle)
    const pct = ((val / grand) * 100).toFixed(1)

    slices.push({ cat, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, lx, ly, pct, val, angle })
    cumAngle += angle
  })

  return (
    <div>
      <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: '240px', display: 'block', margin: '0 auto' }}>
        {slices.map(s => (
          <g key={s.cat.id}>
            <path d={s.path} fill={s.cat.color} opacity="0.9" stroke="#180c14" strokeWidth="2" />
            {s.angle > 0.3 && (
              <text x={s.lx} y={s.ly} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize="10" fontWeight="700">{s.pct}%</text>
            )}
          </g>
        ))}
        <circle cx={cx} cy={cy} r={r * 0.38} fill="#180c14" />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">TOTAL</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#FD5A55" fontSize="9">
          {new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(grand)}
        </text>
      </svg>

      {/* Legend */}
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {CATEGORIES.filter(c => totals[c.id]).map(cat => (
          <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: '15px', color: '#ddd' }}>{cat.icon} {cat.label}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>{fmtCurrency(totals[cat.id])}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{((totals[cat.id]/grand)*100).toFixed(1)}%</div>
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
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: '#180c14', borderRadius: '20px 20px 0 0', border: '1px solid #2e1020', borderBottom: 'none', padding: '24px 22px 44px', maxHeight: '92vh', overflowY: 'auto', animation: 'slideup .25s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EditModal({ expense, onSave, onClose }) {
  const [form, setForm] = useState({ ...expense })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const [err, setErr]     = useState('')
  const [saving, setSave] = useState(false)
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
      {err && <div style={{ background: 'rgba(253,90,85,.08)', border: '1px solid rgba(253,90,85,.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', color: '#FD5A55', fontSize: '14px' }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
        {[{ label: 'Vendor', key: 'vendor', placeholder: 'Hotel / Shop / Service' }, { label: 'Amount (INR)', key: 'amount', placeholder: '0.00', type: 'number' }, { label: 'Date', key: 'date', type: 'date' }, { label: 'Notes', key: 'notes', placeholder: 'Optional' }].map(f => (
          <div key={f.key}>
            <label style={S.label}>{f.label}</label>
            <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => { set(f.key, e.target.value); setErr('') }} placeholder={f.placeholder} style={S.input} onFocus={e => e.target.style.borderColor = '#FD5A55'} onBlur={e => e.target.style.borderColor = '#3a1a28'} />
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
        <button onClick={save} style={{ ...S.btn('primary'), flex: 2, letterSpacing: '1px', textTransform: 'uppercase', opacity: saving ? .6 : 1 }} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </Modal>
  )
}

function ConfirmModal({ message, onConfirm, onClose, loading }) {
  return (
    <Modal title="Confirm Delete" onClose={onClose}>
      <div style={{ color: '#ccc', fontSize: '15px', marginBottom: '26px', lineHeight: '1.7' }}>{message}</div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onClose} style={{ ...S.btn('ghost'), flex: 1 }} disabled={loading}>Cancel</button>
        <button onClick={onConfirm} style={{ ...S.btn('danger'), flex: 1, opacity: loading ? .6 : 1 }} disabled={loading}>{loading ? 'Deleting...' : 'Delete'}</button>
      </div>
    </Modal>
  )
}

function DbBadge() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: DB_READY ? 'rgba(80,200,120,.1)' : 'rgba(253,90,85,.08)', border: `1px solid ${DB_READY ? 'rgba(80,200,120,.3)' : 'rgba(253,90,85,.25)'}`, borderRadius: '50px', padding: '3px 10px', fontSize: '11px', color: DB_READY ? '#60c880' : '#FD5A55' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: DB_READY ? '#60c880' : '#FD5A55', display: 'inline-block' }} />
      {DB_READY ? 'Supabase' : 'Local'}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
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
  const fileRef   = useRef()
  const cameraRef = useRef()

  useEffect(() => {
    fetchExpenses()
      .then(rows => { setExpenses(rows); setLoading(false) })
      .catch(e   => { setDbError(e.message); setLoading(false) })
  }, [])

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
        setImage(comp)
        scanWithClaude(comp.split(',')[1], 'image/jpeg')
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
      const saved = await insertExpense({ ...extracted, category, image: imagePreview })
      setExpenses(prev => [saved, ...prev])
      setCategory(''); setImage(null); setStage('saved')
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0a0408,#180a12 60%,#0a0408)', fontFamily: 'Georgia, serif', color: '#f0ebe8' }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideup{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:#444}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.5)}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#FD5A55;border-radius:2px}
        button:active{opacity:.82;transform:scale(.98)}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(90deg,#340A22,#4a1030)', borderBottom: '2px solid #FD5A55', padding: '16px 22px', paddingTop: 'max(16px,env(safe-area-inset-top))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 20px rgba(253,90,85,.18)' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#FD5A55', textTransform: 'uppercase', marginBottom: '3px' }}>KGreen Technologies</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff', letterSpacing: '1px' }}>ExpenseScan</div>
            <DbBadge />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setStage('home'); setError(''); exitSel() }} style={S.nav(['home','scanning'].includes(stage))}>Scan</button>
          <button onClick={() => { setStage('list'); exitSel() }} style={S.nav(['list','saved'].includes(stage))}>
            Expenses {expenses.length > 0 && <span style={{ background: '#FD5A55', borderRadius: '50%', padding: '1px 7px', fontSize: '11px', marginLeft: '5px' }}>{expenses.length}</span>}
          </button>
        </div>
      </div>

      {dbError && (
        <div style={{ background: 'rgba(253,90,85,.08)', borderBottom: '1px solid rgba(253,90,85,.3)', padding: '11px 22px', fontSize: '13px', color: '#FD5A55', display: 'flex', justifyContent: 'space-between' }}>
          <span>DB error: {dbError}</span>
          <button onClick={() => setDbError('')} style={{ background: 'none', border: 'none', color: '#FD5A55', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 18px', paddingBottom: 'max(24px,env(safe-area-inset-bottom))' }}>

        {/* ── HOME ── */}
        {stage === 'home' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '12px', color: '#FD5A55', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Capture Your Expense</div>
              <div style={{ fontSize: '26px', fontWeight: '700', color: '#fff' }}>Scan a Bill</div>
              <div style={{ fontSize: '14px', color: '#777', marginTop: '6px' }}>Upload or photograph any receipt for instant extraction</div>
            </div>
            {!ANTHROPIC_API_KEY && (
              <div style={{ background: 'rgba(253,90,85,.07)', border: '1px solid rgba(253,90,85,.25)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#FD5A55', fontWeight: '700', marginBottom: '5px' }}>API KEY NOT CONFIGURED</div>
                <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.6' }}>Set VITE_ANTHROPIC_API_KEY in Vercel environment variables. Manual entry still works.</div>
              </div>
            )}
            <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current.click()}
              style={{ border: '2px dashed #FD5A55', borderRadius: '18px', padding: '48px 22px', textAlign: 'center', cursor: 'pointer', background: 'rgba(253,90,85,.03)', transition: 'background .2s', marginBottom: '14px' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(253,90,85,.08)'} onMouseLeave={e => e.currentTarget.style.background='rgba(253,90,85,.03)'}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>📄</div>
              <div style={{ fontSize: '16px', color: '#fff', fontWeight: '600' }}>Drop bill here or click to upload</div>
              <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>JPG, PNG, WEBP</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            <div style={{ textAlign: 'center', color: '#444', fontSize: '13px', margin: '10px 0' }}>— or —</div>
            <button onClick={() => cameraRef.current.click()} style={{ width: '100%', padding: '16px', background: '#340A22', border: '1px solid #FD5A55', borderRadius: '12px', color: '#FD5A55', fontSize: '16px', fontWeight: '600', cursor: 'pointer', letterSpacing: '1px', fontFamily: 'inherit', marginBottom: '12px' }}>
              📷  Take a Photo
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            <button onClick={() => { setExtracted({ vendor: '', amount: '', date: new Date().toISOString().split('T')[0], notes: '' }); setImage(null); setError(''); setStage('review') }}
              style={{ width: '100%', padding: '13px', background: 'transparent', border: '1px solid #2e1020', borderRadius: '12px', color: '#777', fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Enter Manually
            </button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {stage === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '60px 0', animation: 'fadein .3s ease' }}>
            {imagePreview && <img src={imagePreview} alt="" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '16px', border: '2px solid #FD5A55', marginBottom: '26px', opacity: .8 }} />}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '11px', marginBottom: '16px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FD5A55', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i*.3}s` }} />)}
            </div>
            <div style={{ color: '#FD5A55', fontSize: '13px', letterSpacing: '3px', textTransform: 'uppercase' }}>Reading Bill...</div>
            <div style={{ color: '#555', fontSize: '13px', marginTop: '8px' }}>Extracting vendor, amount, and date</div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {stage === 'review' && (
          <div style={{ animation: 'fadein .3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <button onClick={() => { setStage('home'); setError('') }} style={{ background: 'none', border: '1px solid #2e1020', color: '#FD5A55', cursor: 'pointer', fontSize: '16px', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              <div>
                <div style={{ fontSize: '11px', color: '#FD5A55', letterSpacing: '3px', textTransform: 'uppercase' }}>Review & Categorize</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Confirm Expense Details</div>
              </div>
            </div>
            {imagePreview && <img src={imagePreview} alt="Bill" style={{ width: '100%', maxHeight: '170px', objectFit: 'cover', borderRadius: '12px', marginBottom: '18px', border: '1px solid #2e1020' }} />}
            {error && <div style={{ background: 'rgba(253,90,85,.07)', border: '1px solid rgba(253,90,85,.3)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', color: '#FD5A55', fontSize: '14px', lineHeight: '1.5' }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '22px' }}>
              {[{ label: 'Vendor / Hotel / Shop', key: 'vendor', placeholder: 'e.g. Taj Hotel, Ola, BPCL' }, { label: 'Amount (INR)', key: 'amount', placeholder: 'e.g. 1250.00', type: 'number' }, { label: 'Date', key: 'date', type: 'date' }, { label: 'Notes (optional)', key: 'notes', placeholder: 'Brief description' }].map(f => (
                <div key={f.key}>
                  <label style={S.label}>{f.label}</label>
                  <input type={f.type||'text'} value={extracted[f.key]} onChange={e => { setExtracted(p=>({...p,[f.key]:e.target.value})); setError('') }} placeholder={f.placeholder||''} style={S.input} onFocus={e=>e.target.style.borderColor='#FD5A55'} onBlur={e=>e.target.style.borderColor='#3a1a28'} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={S.label}>Category *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {CATEGORIES.map(c => <button key={c.id} onClick={() => { setCategory(c.id); setError('') }} style={S.pill(category===c.id)}>{c.icon} {c.label}</button>)}
              </div>
            </div>
            <button onClick={saveExpense} disabled={saving} style={{ width: '100%', padding: '17px', background: 'linear-gradient(90deg,#FD5A55,#c73c38)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', letterSpacing: '2px', fontFamily: 'inherit', textTransform: 'uppercase', opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        )}

        {/* ── SAVED ── */}
        {stage === 'saved' && (
          <div style={{ textAlign: 'center', padding: '56px 0', animation: 'fadein .4s ease' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(253,90,85,.12)', border: '2px solid #FD5A55', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: '32px' }}>✓</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Expense Saved</div>
            <div style={{ fontSize: '14px', color: '#777', marginBottom: '8px' }}>Stored in {DB_READY ? 'Supabase database' : 'local device storage'}</div>
            {DB_READY && <div style={{ fontSize: '13px', color: '#555', marginBottom: '20px' }}>Accessible from any device</div>}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '18px' }}>
              <button onClick={() => setStage('home')} style={S.btn('primary')}>Scan Another</button>
              <button onClick={() => setStage('list')} style={S.btn('outline')}>View All</button>
            </div>
          </div>
        )}

        {/* ── LIST ── */}
        {stage === 'list' && (
          <div style={{ animation: 'fadein .3s ease' }}>

            {/* List header */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#FD5A55', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '5px' }}>Expense Register</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#fff' }}>My Expenses</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontSize: '15px', color: '#FD5A55', fontWeight: '700' }}>{fmtCurrency(total)}</div>

                  {/* Pie chart icon */}
                  {expenses.length > 0 && (
                    <button onClick={() => setShowChart(true)} title="Category chart" style={{ background: 'rgba(253,90,85,.08)', border: '1px solid rgba(253,90,85,.25)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '18px' }}>
                      🥧
                    </button>
                  )}

                  {/* CSV export */}
                  {filtered.length > 0 && (
                    <button onClick={() => exportCSV(filtered)} title="Export CSV" style={{ background: 'rgba(96,200,128,.08)', border: '1px solid rgba(96,200,128,.25)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px' }}>
                      ⬇
                    </button>
                  )}

                  {/* Select toggle */}
                  {!selectMode && filtered.length > 0 && (
                    <button onClick={() => setSelMode(true)} style={{ background: 'none', border: '1px solid #3a1a28', color: '#aaa', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Select</button>
                  )}
                  {selectMode && (
                    <button onClick={exitSel} style={{ background: 'none', border: '1px solid #3a1a28', color: '#FD5A55', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  )}
                </div>
              </div>
            </div>

            {/* Select-all bar */}
            {selectMode && filtered.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1c0e18', border: '1px solid #2e1020', borderRadius: '10px', padding: '10px 16px', marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '15px', color: '#ccc' }}>
                  <input type="checkbox" checked={allSelVis} onChange={() => toggleSelAll(visIds)} style={{ accentColor: '#FD5A55', width: '18px', height: '18px', cursor: 'pointer' }} />
                  {allSelVis ? 'Deselect All' : 'Select All'}
                  {selected.size > 0 && <span style={{ color: '#FD5A55', fontSize: '13px' }}>({selected.size} selected)</span>}
                </label>
                {selected.size > 0 && (
                  <button onClick={() => setConfDel('selected')} style={{ background: 'rgba(180,20,20,.15)', border: '1px solid rgba(200,50,50,.3)', color: '#ff8080', borderRadius: '7px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Delete {selected.size}
                  </button>
                )}
              </div>
            )}

            {/* Category filter */}
            <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
              {['all', ...CATEGORIES.map(c => c.id)].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 14px', borderRadius: '50px', border: `1px solid ${filter===f?'#FD5A55':'#2e1020'}`, background: filter===f?'rgba(253,90,85,.12)':'transparent', color: filter===f?'#FD5A55':'#777', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {f==='all' ? 'All' : CATEGORIES.find(c=>c.id===f)?.icon+' '+f}
                </button>
              ))}
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#555' }}>
                <div style={{ width: '26px', height: '26px', border: '2px solid #3a1a28', borderTop: '2px solid #FD5A55', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                <div style={{ fontSize: '14px' }}>Loading expenses...</div>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '54px 0', color: '#444' }}>
                <div style={{ fontSize: '38px', marginBottom: '12px' }}>🧾</div>
                <div style={{ marginBottom: '16px', fontSize: '15px' }}>No expenses recorded yet</div>
                <button onClick={() => setStage('home')} style={S.btn('primary')}>Scan First Bill</button>
              </div>
            )}

            {/* Expense cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filtered.map(exp => {
                const cat   = CATEGORIES.find(c => c.id === exp.category)
                const isSel = selected.has(exp.id)
                const img   = exp.image_b64 || exp.image
                return (
                  <div key={exp.id} onClick={() => selectMode && toggleSel(exp.id)}
                    style={{ background: isSel ? 'linear-gradient(135deg,#2a0a1a,#260e1c)' : 'linear-gradient(135deg,#160a10,#1c0e14)', border: `1px solid ${isSel?'#FD5A55':'#2a1020'}`, borderRadius: '14px', padding: '15px', display: 'flex', gap: '13px', alignItems: 'flex-start', cursor: selectMode?'pointer':'default', transition: 'border-color .15s,background .15s' }}>

                    {/* Thumbnail or checkbox */}
                    {selectMode ? (
                      <div style={{ width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSel(exp.id)} onClick={e=>e.stopPropagation()} style={{ accentColor: '#FD5A55', width: '20px', height: '20px', cursor: 'pointer' }} />
                      </div>
                    ) : img ? (
                      <img src={img} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #2e1020', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#220a18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>{cat?.icon}</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: '700', color: '#fff', fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '10px' }}>{exp.vendor}</div>
                        <div style={{ fontWeight: '700', color: '#FD5A55', fontSize: '15px', flexShrink: 0 }}>{fmtCurrency(exp.amount)}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>{fmtDate(exp.date)}</div>
                      {exp.notes && <div style={{ fontSize: '13px', color: '#887080', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.notes}</div>}
                      <div style={{ marginTop: '9px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ background: `${cat?.color}18`, border: `1px solid ${cat?.color}44`, borderRadius: '50px', padding: '3px 10px', fontSize: '12px', color: cat?.color || '#FD5A55' }}>{cat?.icon} {cat?.label}</span>
                        {!selectMode && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={e => { e.stopPropagation(); setEditing(exp) }} style={{ background: 'rgba(253,90,85,.08)', border: '1px solid rgba(253,90,85,.2)', color: '#FD5A55', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                            <button onClick={e => { e.stopPropagation(); setConfDel(exp.id) }} style={{ background: 'rgba(180,20,20,.1)', border: '1px solid rgba(200,50,50,.2)', color: '#ff8080', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
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

      {/* ── MODALS ── */}
      {editingExp && <EditModal expense={editingExp} onSave={applyEdit} onClose={() => setEditing(null)} />}

      {confirmDel && (
        <ConfirmModal
          message={confirmDel === 'selected'
            ? `Permanently delete ${selected.size} selected expense${selected.size>1?'s':''}? This action cannot be undone.`
            : 'Permanently delete this expense? This action cannot be undone.'}
          onConfirm={doDelete} onClose={() => setConfDel(null)} loading={delLoading}
        />
      )}

      {/* Pie chart modal */}
      {showChart && (
        <Modal title="Spending by Category" onClose={() => setShowChart(false)}>
          <PieChart expenses={expenses} />
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowChart(false)} style={{ ...S.btn('ghost'), flex: 1 }}>Close</button>
            {filtered.length > 0 && (
              <button onClick={() => { exportCSV(filtered); setShowChart(false) }} style={{ ...S.btn('outline'), flex: 1, fontSize: '14px' }}>
                ⬇ Export CSV
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
