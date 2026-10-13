import { useEffect, useState } from 'react'
import { MODES } from './api.js'
import { copy, goSearch } from './util.js'

export function Header() {
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <a className="brand" href="#/" aria-label="Home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="7" fill="#0074c8" /><path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span className="brand-name">CT Logs <b>Discovery</b></span>
        </a>
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
          Certificate data provided by the <a href="https://ctlogs.dev/" target="_blank" rel="noreferrer">ctlogs.dev</a> Certificate
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
