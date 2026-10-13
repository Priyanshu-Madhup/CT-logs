import { useEffect, useState } from 'react'
import { MODES, getKey, setKey, getUsage } from './api.js'
import { copy, goSearch } from './util.js'

export function Header({ hasKey, onSettings }) {
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <a className="brand" href="#/" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="7" fill="#0074c8" /><path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span className="brand-name">CT Logs <b>Discovery</b></span>
        </a>
        <nav className="topnav">
          <a href="https://api.ctlogs.dev/" target="_blank" rel="noreferrer">API docs</a>
          <button className="btn btn-outline btn-sm" onClick={onSettings}>
            {hasKey ? '● API key active' : 'API key'}
          </button>
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <span className="brand-name footer-brand">CT Logs <b>Discovery</b></span>
        <p>
          Certificate data provided by the <a href="https://api.ctlogs.dev/" target="_blank" rel="noreferrer">ctlogs.dev</a> Certificate
          Transparency index.
        </p>
      </div>
    </footer>
  )
}

export function SearchBox({ initialMode, initialQuery }) {
  const [mode, setMode] = useState(initialMode)
  const [q, setQ] = useState(initialQuery)
  const m = MODES[mode]
  const submit = (e) => {
    e.preventDefault()
    const v = q.trim()
    if (v) goSearch(mode, v)
  }
  return (
    <form className="searchbox" onSubmit={submit}>
      <div className="tabs" role="tablist">
        {Object.entries(MODES).map(([k, v]) => (
          <button type="button" role="tab" aria-selected={k === mode} key={k} className={`tab ${k === mode ? 'on' : ''}`} onClick={() => setMode(k)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="searchrow">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={m.ph}
          aria-label="Search query"
          spellCheck="false"
          autoCapitalize="off"
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit">Search</button>
      </div>
      <p className="hint">{m.hint}</p>
    </form>
  )
}

export function CopyBtn({ text, label = 'Copy' }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      className="copy"
      onClick={async () => { if (await copy(text)) { setOk(true); setTimeout(() => setOk(false), 1200) } }}
      title="Copy to clipboard"
    >
      {ok ? 'Copied' : label}
    </button>
  )
}

export function StatusBadge({ status }) {
  return <span className={`badge st-${status.key}`}>{status.label}</span>
}

export function SettingsModal({ onClose, onChange }) {
  const [val, setVal] = useState(getKey())
  const [usage, setUsage] = useState(null)
  const [err, setErr] = useState('')

  const loadUsage = async () => {
    setErr(''); setUsage(null)
    try { setUsage((await getUsage()).data) } catch (e) { setErr(e.message) }
  }
  useEffect(() => { if (getKey()) loadUsage() }, [])

  const save = () => {
    const k = val.trim()
    setKey(k); onChange(!!k)
    if (k) loadUsage(); else { setUsage(null); setErr('') }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>API settings</h3>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="muted">
          Searches work without a key (100 requests per hour, shared pool). A free key from the{' '}
          <a href="https://account.ctlogs.dev/" target="_blank" rel="noreferrer">ctlogs.dev account</a> raises the quota and enables deep paging.
          The key is stored only in this browser and sent only to api.ctlogs.dev.
        </p>
        <label className="field-label" htmlFor="apikey">API key</label>
        <input id="apikey" className="input" type="password" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Paste your key" autoComplete="off" />
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={save}>Save</button>
          {getKey() && <button className="btn btn-outline" onClick={() => { setVal(''); setKey(''); onChange(false); setUsage(null) }}>Remove key</button>}
        </div>
        {err && <div className="alert alert-err">{err}</div>}
        {usage && (
          <dl className="kv usage">
            <dt>Plan</dt><dd>{usage.plan}</dd>
            <dt>Monthly limit</dt><dd>{usage.monthly_limit?.toLocaleString()}</dd>
            <dt>Used</dt><dd>{usage.used?.toLocaleString()}</dd>
            <dt>Remaining</dt><dd>{usage.remaining?.toLocaleString()}</dd>
            <dt>Resets</dt><dd>{usage.resets_at}</dd>
          </dl>
        )}
      </div>
    </div>
  )
}
