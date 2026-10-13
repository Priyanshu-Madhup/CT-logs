import { useMemo, useState } from 'react'
import { baseDomain, countryName, orgKey, saveBlob } from './util.js'
import Logo from './Logo.jsx'

export const EMPTY_FILTERS = { text: '', status: 'all', key: 'all', tld: 'all', country: 'all', issuer: 'all', org: 'all' }

// ccTLD -> ISO region. Generic TLDs (com, net, org, dev...) have no country.
export function tldCountry(host) {
  const t = (host || '').toLowerCase().replace(/\.$/, '').split('.').pop()
  if (!/^[a-z]{2}$/.test(t)) return ''
  return t === 'uk' ? 'GB' : t.toUpperCase()
}

const nameOf = (cc) => (cc === '' ? 'Global (generic TLD)' : countryName(cc))

/** Per-row facts used for filtering and ranking. `info` is the optional full-record lookup. */
export function buildItems(rows, issuers, org) {
  return rows.map((r) => {
    const info = issuers[r.id]
    const host = org ? (r.domains || [])[0] || r.subject_cn : r.match
    const base = baseDomain(host)
    const looked = info && info.dn !== undefined
    return {
      r,
      m: {
        orgKey: org ? orgKey(r.match || r.subject_cn) : base,
        orgLabel: org ? r.match || r.subject_cn : base,
        orgDomain: base,
        issuer: r.issuer || '', // org-search rows carry the issuer organisation too
        tld: tldCountry(host),
        country: looked ? info.country || '—' : undefined,
        key: r.key_algo || '',
      },
    }
  })
}

export function applyFilters(items, f, skip) {
  const t = f.text.trim().toLowerCase()
  return items.filter(({ r, m }) => {
    if (skip !== 'status' && f.status !== 'all' && r._st && r._st.key !== f.status) return false
    if (skip !== 'key' && f.key !== 'all' && m.key !== f.key) return false
    if (skip !== 'tld' && f.tld !== 'all' && m.tld !== f.tld) return false
    if (skip !== 'country' && f.country !== 'all' && m.country !== f.country) return false
    if (skip !== 'issuer' && f.issuer !== 'all' && m.issuer !== f.issuer) return false
    if (skip !== 'org' && f.org !== 'all' && m.orgKey !== f.org) return false
    if (t && !JSON.stringify(Object.values(r)).toLowerCase().includes(t)) return false
    return true
  })
}

function counts(items, pick) {
  const c = new Map()
  items.forEach((it) => { const v = pick(it.m); if (v !== undefined && v !== '') c.set(v, (c.get(v) || 0) + 1) })
  return [...c.entries()].sort((a, b) => b[1] - a[1])
}

export function Filters({ items, f, setF, stats, hasLookup }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const tlds = useMemo(() => [...new Map([...counts(items, (m) => m.tld), ...(items.some((i) => i.m.tld === '') ? [['', items.filter((i) => i.m.tld === '').length]] : [])])].sort((a, b) => b[1] - a[1]), [items])
  const issuers = useMemo(() => counts(items, (m) => m.issuer), [items])
  const keys = useMemo(() => counts(items, (m) => m.key), [items])
  const countries = useMemo(() => counts(items, (m) => m.country), [items])
  const active = Object.entries(f).some(([k, v]) => v !== EMPTY_FILTERS[k])

  return (
    <div className="card filters">
      <div className="filters-grid">
        <input className="input" placeholder="Search loaded results…" value={f.text} onChange={set('text')} />
        {stats && (
          <select className="input" value={f.status} onChange={set('status')} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="valid">Valid</option>
            <option value="expiring">Expiring ≤30d</option>
            <option value="expired">Expired</option>
          </select>
        )}
        <select className="input" value={f.tld} onChange={set('tld')} aria-label="Domain country">
          <option value="all">All domain countries (TLD)</option>
          {tlds.map(([c, n]) => <option key={c || 'g'} value={c}>{nameOf(c)} ({n})</option>)}
        </select>
        {hasLookup && (
          <select className="input" value={f.country} onChange={set('country')} aria-label="Subject country">
            <option value="all">All subject countries</option>
            {countries.map(([c, n]) => <option key={c} value={c}>{c === '—' ? 'No country (DV)' : countryName(c)} ({n})</option>)}
          </select>
        )}
        {issuers.length > 0 && (
          <select className="input" value={f.issuer} onChange={set('issuer')} aria-label="Issuer">
            <option value="all">All issuers</option>
            {issuers.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        )}
        {keys.length > 1 && (
          <select className="input" value={f.key} onChange={set('key')} aria-label="Key type">
            <option value="all">All key types</option>
            {keys.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        )}
      </div>
      {active && <button className="linkbtn clear" onClick={() => setF(EMPTY_FILTERS)}>Clear all filters</button>}
    </div>
  )
}

const DIMS = {
  org: { filter: 'org' },
  issuer: { filter: 'issuer' },
  tld: { filter: 'tld' },
  country: { filter: 'country' },
}

export function Leaderboard({ items, f, setF, org, hasLookup }) {
  const [dim, setDim] = useState('org')
  const [top, setTop] = useState(50)
  const d = DIMS[dim]

  const rows = useMemo(() => {
    // Rank over everything except the filter on this very dimension, so the list stays browsable.
    const base = applyFilters(items, f, d.filter)
    const g = new Map()
    base.forEach(({ r, m }) => {
      let key, label, domain
      if (dim === 'org') { key = m.orgKey; label = m.orgLabel; domain = m.orgDomain }
      else if (dim === 'issuer') { key = label = m.issuer }
      else if (dim === 'tld') { key = m.tld; label = nameOf(m.tld) }
      else { key = m.country; label = key === '—' ? 'No country (DV)' : key && countryName(key) }
      if (key === undefined || key === '' && dim !== 'tld') return
      const e = g.get(key) || { key, label, domain, n: 0, valid: 0, expiring: 0, expired: 0 }
      e.n++
      const s = r._st?.key
      if (s === 'expiring') e.expiring++
      else if (s === 'expired') e.expired++
      else e.valid++
      g.set(key, e)
    })
    return [...g.values()].sort((a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label)))
  }, [items, f, dim])

  const shown = rows.slice(0, top)
  const max = shown[0]?.n || 1
  const labelFor = { org: org ? 'Organizations' : 'Domains', issuer: 'Issuers', tld: 'Domain country', country: 'Subject country' }

  const exportCsv = () => {
    const csv = ['rank,name,certificates,valid,expiring,expired',
      ...shown.map((e, i) => [i + 1, `"${String(e.label).replace(/"/g, '""')}"`, e.n, e.valid, e.expiring, e.expired].join(','))].join('\n')
    saveBlob(new Blob([csv], { type: 'text/csv' }), `top-${dim}.csv`)
  }

  return (
    <div className="card board">
      <div className="board-head">
        <h3>Top {Math.min(top, rows.length)} by certificates</h3>
        <div className="board-controls">
          <div className="seg" role="tablist">
            {Object.keys(DIMS).filter((k) => k !== 'country' || hasLookup).map((k) => (
              <button key={k} role="tab" aria-selected={dim === k} className={dim === k ? 'on' : ''} onClick={() => setDim(k)}>{labelFor[k]}</button>
            ))}
          </div>
          <select className="input select" value={top} onChange={(e) => setTop(Number(e.target.value))} aria-label="How many">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={exportCsv}>CSV</button>
        </div>
      </div>
      {rows.length === 0 ? <p className="muted small">Nothing to rank with the current filters.</p> : (
        <ol className="rank">
          {shown.map((e, i) => {
            const on = f[d.filter] === e.key
            return (
              <li key={String(e.key)}>
                <button className={`rank-row ${on ? 'on' : ''}`} onClick={() => setF({ ...f, [d.filter]: on ? 'all' : e.key })} title="Click to filter the table">
                  <span className="rank-n">{i + 1}</span>
                  <span className="rank-name">
                    {dim === 'org' && <Logo domain={e.domain} name={e.label} size={22} group={org ? `${e.key}` : undefined} />}
                    <span>{e.label}</span>
                  </span>
                  <span className="rank-bar"><i style={{ width: `${(e.n / max) * 100}%` }} /></span>
                  <span className="rank-n2"><b>{e.n}</b></span>
                  <span className="rank-split muted small">{e.valid} valid{e.expiring ? ` · ${e.expiring} expiring` : ''}{e.expired ? ` · ${e.expired} expired` : ''}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {dim === 'country' && <p className="muted small">Counts only certificates already looked up (use “Look up” below the table).</p>}
      {rows.length > top && <p className="muted small">Showing {top} of {rows.length}.</p>}
    </div>
  )
}

export function exportRows(items) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['name', 'issuer', 'status', 'valid_from', 'valid_to', 'key', 'sans', 'tld_country', 'subject_country', 'serial', 'id']
  const lines = items.map(({ r, m }) => [
    r.match || r.subject_cn, m.issuer || r.issuer, r._st?.label, r.not_before, r.not_after, r.key_algo, r.san_count,
    m.tld, m.country && m.country !== '—' ? m.country : '', r.serial_hex, r.id,
  ].map(esc).join(','))
  saveBlob(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }), 'ct-logs-results.csv')
}
