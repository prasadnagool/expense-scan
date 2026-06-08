import { useState } from 'react'
import { supabase } from './supabase.js'

const C = {
  primary:       '#2b475c',
  primaryDark:   '#1e3347',
  primaryBg:     '#0f1e2a',
  border:        'rgba(84,162,136,0.2)',
  accent:        '#54a288',
  accentDim:     'rgba(84,162,136,0.12)',
  white:         '#ffffff',
  whiteOff:      'rgba(255,255,255,0.85)',
  whiteMuted:    'rgba(255,255,255,0.5)',
  danger:        '#e07070',
  dangerBg:      'rgba(220,100,100,0.1)',
  dangerBorder:  'rgba(220,100,100,0.3)',
  successBg:     'rgba(84,162,136,0.1)',
  successBorder: 'rgba(84,162,136,0.35)',
}

const S = {
  input: {
    width: '100%', background: C.primaryDark,
    border: `1px solid ${C.border}`, borderRadius: '10px',
    padding: '14px 16px', color: C.white,
    fontSize: '17px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box'
  },
  label: {
    display: 'block', fontSize: '11px', letterSpacing: '2px',
    color: C.accent, textTransform: 'uppercase',
    marginBottom: '7px', fontWeight: '600'
  },
}

export default function Auth({ onAuth }) {
  const [mode, setMode]     = useState('login')   // login | signup | forgot
  const [email, setEmail]   = useState('')
  const [password, setPass] = useState('')
  const [name, setName]     = useState('')
  const [error, setError]   = useState('')
  const [msg, setMsg]       = useState('')
  const [loading, setLoad]  = useState(false)

  const clear = () => { setError(''); setMsg('') }

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password are required.'); return }
    setLoad(true); clear()
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password })
    setLoad(false)
    if (e) { setError(e.message); return }
    onAuth(data.user)
  }

  const handleSignup = async () => {
    if (!name.trim())        { setError('Full name is required.'); return }
    if (!email)              { setError('Email is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoad(true); clear()
    const { data, error: e } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name.trim() } }
    })
    setLoad(false)
    if (e) { setError(e.message); return }
    if (data.user && !data.session) {
      setMsg('Account created. Check your email to confirm, then sign in.')
      setMode('login')
    } else if (data.user) {
      onAuth(data.user)
    }
  }

  const handleForgot = async () => {
    if (!email) { setError('Enter your email address.'); return }
    setLoad(true); clear()
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setLoad(false)
    if (e) { setError(e.message); return }
    setMsg('Password reset link sent. Check your inbox.')
  }

  const submit = mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgot

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg,${C.primaryBg},${C.primaryDark} 60%,${C.primaryBg})`, fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:rgba(255,255,255,0.25)}
        button:active{opacity:.82;transform:scale(.98)}
      `}</style>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '5px', color: C.accent, textTransform: 'uppercase', marginBottom: '8px' }}>KGreen Technologies</div>
        <div style={{ fontSize: '30px', fontWeight: '700', color: C.white, letterSpacing: '1px' }}>ExpenseScan</div>
        <div style={{ fontSize: '14px', color: C.whiteMuted, marginTop: '6px' }}>
          {mode === 'login'  ? 'Sign in to your account'  :
           mode === 'signup' ? 'Create a new account'     : 'Reset your password'}
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: '400px', background: C.primary, border: `1px solid ${C.border}`, borderRadius: '18px', padding: '28px 24px' }}>

        {error && (
          <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: '8px', padding: '11px 14px', marginBottom: '18px', color: C.danger, fontSize: '14px', lineHeight: '1.5' }}>
            {error}
          </div>
        )}
        {msg && (
          <div style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: '8px', padding: '11px 14px', marginBottom: '18px', color: C.accent, fontSize: '14px', lineHeight: '1.5' }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          {mode === 'signup' && (
            <div>
              <label style={S.label}>Full Name</label>
              <input type="text" value={name} onChange={e => { setName(e.target.value); clear() }}
                placeholder="Your full name" style={S.input}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border} />
            </div>
          )}

          <div>
            <label style={S.label}>Email Address</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); clear() }}
              placeholder="you@example.com" style={S.input}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e  => e.target.style.borderColor = C.border} />
          </div>

          {mode !== 'forgot' && (
            <div>
              <label style={S.label}>Password</label>
              <input type="password" value={password} onChange={e => { setPass(e.target.value); clear() }}
                placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Your password'} style={S.input}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e  => e.target.style.borderColor = C.border}
                onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
          )}
        </div>

        <button onClick={submit} disabled={loading}
          style={{ width: '100%', padding: '16px', background: `linear-gradient(90deg,${C.accent},${C.primary})`, border: 'none', borderRadius: '12px', color: C.white, fontSize: '16px', fontWeight: '700', cursor: 'pointer', letterSpacing: '1px', fontFamily: 'inherit', textTransform: 'uppercase', opacity: loading ? .6 : 1 }}>
          {loading       ? 'Please wait...'   :
           mode === 'login'  ? 'Sign In'          :
           mode === 'signup' ? 'Create Account'   : 'Send Reset Link'}
        </button>

        <div style={{ marginTop: '22px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('signup'); clear() }}
                style={{ background: 'none', border: 'none', color: C.whiteMuted, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
                No account?{' '}<span style={{ color: C.accent, fontWeight: '600' }}>Create one</span>
              </button>
              <button onClick={() => { setMode('forgot'); clear() }}
                style={{ background: 'none', border: 'none', color: C.whiteMuted, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit', opacity: .7 }}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button onClick={() => { setMode('login'); clear() }}
              style={{ background: 'none', border: 'none', color: C.whiteMuted, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
              Already have an account?{' '}<span style={{ color: C.accent, fontWeight: '600' }}>Sign in</span>
            </button>
          )}
          {mode === 'forgot' && (
            <button onClick={() => { setMode('login'); clear() }}
              style={{ background: 'none', border: 'none', color: C.whiteMuted, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
              Back to{' '}<span style={{ color: C.accent, fontWeight: '600' }}>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
