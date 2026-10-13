import { useEffect, useMemo, useRef, useState } from 'react'
import { MODES, search, getCert } from './api.js'
import { certStatus, fmtDate, isDigiCert, dnValue } from './util.js'
import { StatusBadge, CopyBtn } from './components.jsx'

export default function Results({ mode, q }) {
  const [rows, setRows] = useState([])
  const [page, setPage] = useState({ hasNext: false, cursor: '', ms: null, window: null, truncated: false, extra: null })
  const [state, setState] = useState('loading') // loading | done | error
  const [more, setMore] = useState(false)
  const [err, setErr] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('all')
  const alive = useRef(true)
  const [issuers, setIssuers] = useState({}) // id -> { dn } | { error }
  const [issuerLimit, setIssuerLimit] = useState(15)
  const fetching = useRef(new Set())

  const load = async (after) => {
    after ? setMore(true) : setState('loading')
    setErr(null)
    try {
      const { data, remaining: rem } = await search(mode, q, after)
      if (!alive.current) return
      const list = data.rows || data.hosts || []
      setRows((prev) => (after ? [...prev, ...list] : list))
      setPage({
        hasNext: !!data.has_next, cursor: data.next_cursor || '', ms: data.duration_ms,
        window: data.history_window_days, truncated: !!data.history_truncated, extra: data,
      })
      if (rem != null) setRemaining(rem)
      setState('done')
    } catch (e) {
      if (!alive.current) return
      setErr(e)
      if (!after) setState('error')
    } finally {
      if (alive.current) setMore(false)
    }
  }

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false }
  }, [])

  // Org search rows carry no issuer, so look it up per certificate (1 credit each).
  useEffect(() => {
    if (mode !== 'org') return
    rows.slice(0, issuerLimit).forEach((r) => {
      if (fetching.current.has(r.id)) return
      fetching.current.add(r.id)
      getCert(r.id)
        .then(({ data }) => alive.current && setIssuers((p) => ({ ...p, [r.id]: { dn: data.issuer_dn } })))
        .catch(() => alive.current && setIssuers((p) => ({ ...p, [r.id]: { error: true } })))
    })
  }, [rows, issuerLimit, mode])

  const isHosts = mode === 'hosts'
  const isBimi = mode === 'bimi'

  const enriched = useMemo(
    () => rows.map((r) => (r.not_after ? { ...r, _st: certStatus(r.not_before, r.not_after) } : r)),
    [rows]
  )
  const stats = useMemo(() => {
    if (isHosts || isBimi) return null
    const c = { valid: 0, expiring: 0, expired: 0, digicert: 0 }
    const issuers = new Set()
    enriched.forEach((r) => {
      if (!r._st) return
      if (r._st.key === 'valid' || r._st.key === 'pending') c.valid++
      else c[r._st.key]++
      if (r.issuer) issuers.add(r.issuer)
      if (isDigiCert(r.issuer)) c.digicert++
    })
    return { ...c, issuers: issuers.size }
  }, [enriched, isHosts, isBimi])

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return enriched.filter((r) => {
      if (status !== 'all' && r._st && r._st.key !== status) return false
      if (!f) return true
      return JSON.stringify(Object.values(r)).toLowerCase().includes(f)
    })
  }, [enriched, filter, status])

  return (
    <section>
      <div className="results-head">
        <div>
          <p className="eyebrow dark">{MODES[mode].label}</p>
          <h2 className="results-title">{q}</h2>
        </div>
        {state === 'done' && (
          <p className="muted small">
            {rows.length} loaded{page.hasNext ? '+' : ''}
            {page.ms != null && <> · {page.ms} ms</>}
            {remaining != null && <> · {remaining} requests left</>}
          </p>
        )}
      </div>

      {state === 'loading' && <Skeleton />}
      {state === 'error' && <ErrorBox err={err} retry={() => load()} />}

      {state === 'done' && (
        <>
          {page.window && (
            <div className="alert alert-info">
              Showing certificates valid now or expired within the last {page.window} days.
              {page.truncated && ' Older certificates exist in the Pro archive.'}
            </div>
          )}
          {stats && rows.length > 0 && (
            <div className="stats">
              <Stat n={rows.length} l="Certificates" />
              <Stat n={stats.valid} l="Valid" cls="valid" />
              <Stat n={stats.expiring} l="Expiring ≤30d" cls="expiring" />
              <Stat n={stats.expired} l="Expired" cls="expired" />
              <Stat n={stats.digicert} l="Issued by DigiCert" cls="brand" />
              <Stat n={stats.issuers} l="Distinct issuers" />
            </div>
          )}
          {rows.length > 0 && (
            <div className="toolbar">
              <input className="input" placeholder="Filter loaded results…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              {stats && (
                <select className="input select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="valid">Valid</option>
                  <option value="expiring">Expiring soon</option>
                  <option value="expired">Expired</option>
                </select>
              )}
            </div>
          )}

          {rows.length === 0 && <div className="empty">No certificates found for “{q}”.</div>}
          {rows.length > 0 && isHosts && <HostsTable rows={shown} />}
          {rows.length > 0 && isBimi && <BimiList rows={shown} />}
          {rows.length > 0 && !isHosts && !isBimi && <CertTable rows={shown} org={mode === 'org'} issuers={issuers} />}
          {mode === 'org' && rows.length > issuerLimit && (
            <div className="more">
              <p className="muted small">Issuers are looked up one certificate at a time (1 API credit each) — {issuerLimit} of {rows.length} so far.</p>
              <button className="btn btn-outline btn-sm" onClick={() => setIssuerLimit(rows.length)}>Look up issuer for all {rows.length}</button>
            </div>
          )}
          {rows.length > 0 && shown.length === 0 && <div className="empty">No loaded rows match your filter.</div>}

          {err && <ErrorBox err={err} />}
          {page.hasNext && (
            <div className="more">
              <button className="btn btn-primary" disabled={more} onClick={() => load(page.cursor)}>
                {more ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

const Stat = ({ n, l, cls = '' }) => (
  <div className={`stat ${cls}`}><b>{n}</b><span>{l}</span></div>
)

function ErrorBox({ err, retry }) {
  return (
    <div className="alert alert-err">
      <strong>{err.status === 404 ? 'Not found' : 'Something went wrong'}</strong>
      <div>{err.message}</div>
      {retry && err.status !== 404 && <button className="btn btn-outline btn-sm" onClick={retry}>Try again</button>}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="skeleton">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk-row" />)}
    </div>
  )
}

function IssuerCell({ info }) {
  if (!info) return <span className="muted small">Loading…</span>
  if (info.error) return <span className="muted small">Unavailable</span>
  const cn = dnValue(info.dn, 'CN') || info.dn
  return <>{cn}{isDigiCert(info.dn) && <span className="badge brand">DigiCert</span>}<div className="sub">{dnValue(info.dn, 'O')}</div></>
}

function CertTable({ rows, org, issuers = {} }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>{org ? 'Organization / CN' : 'Matched name'}</th>
            <th>Issuer (CA)</th>
            <th>Valid from</th>
            <th>Valid to</th>
            {!org && <th>Key</th>}
            <th className="num">{org ? 'Domains' : 'SANs'}</th>
            <th>Serial</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="clickrow" onClick={() => { window.location.hash = `#/c/${r.id}` }}>
              <td><StatusBadge status={r._st} /></td>
              <td className="name">
                <a href={`#/c/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.match || r.subject_cn}</a>
                {org && r.subject_cn && r.subject_cn !== r.match && <div className="sub">{r.subject_cn}</div>}
              </td>
              <td>
                {org ? <IssuerCell info={issuers[r.id]} /> : (
                  <>{r.issuer}{isDigiCert(r.issuer) && <span className="badge brand">DigiCert</span>}</>
                )}
              </td>
              <td className="nowrap">{fmtDate(r.not_before)}</td>
              <td className="nowrap">
                {fmtDate(r.not_after)}
                <div className="sub">{r._st.key === 'expired' ? `${r._st.days}d ago` : `in ${r._st.days}d`}</div>
              </td>
              {!org && <td className="nowrap">{r.key_algo || '—'}</td>}
              <td className="num">
                {org ? <DomainSample r={r} /> : r.san_count ?? '—'}
              </td>
              <td className="mono small" title={r.serial_hex}>{(r.serial_hex || '').slice(0, 16)}{(r.serial_hex || '').length > 16 ? '…' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DomainSample({ r }) {
  const d = r.domains || []
  if (!d.length) return '—'
  return (
    <div className="domain-sample">
      {d.slice(0, 3).join(', ')}
      {(r.domains_more > 0 || d.length > 3) && <span className="sub"> +{(r.domains_more || 0) + Math.max(0, d.length - 3)} more</span>}
    </div>
  )
}

function HostsTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Hostname</th><th className="num">Certs</th><th>First seen</th><th>Last seen</th><th>Latest expiry</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const st = h.last_not_after ? certStatus(h.first_seen, h.last_not_after) : null
            return (
              <tr key={h.host}>
                <td className="name mono">{h.host}</td>
                <td className="num">{h.certs}</td>
                <td className="nowrap">{fmtDate(h.first_seen)}</td>
                <td className="nowrap">{fmtDate(h.last_seen)}</td>
                <td className="nowrap">{fmtDate(h.last_not_after)} {st && <StatusBadge status={st} />}</td>
                <td><a href={`#/s/domain/${encodeURIComponent(h.host)}`}>Certificates →</a></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BimiList({ rows }) {
  return (
    <div className="bimi-grid">
      {rows.map((r) => {
        const st = certStatus(r.not_before, r.not_after)
        return (
          <article className="card bimi" key={r.id}>
            <div className="bimi-logo">
              {r.logo_url ? <img src={r.logo_url} alt={`${r.subject_o} logo`} loading="lazy" /> : <span className="muted small">No logo</span>}
            </div>
            <div className="bimi-body">
              <div className="bimi-top">
                <h3>{r.subject_o || r.subject_cn}</h3>
                <span className="badge brand">{r.kind}</span>
                <StatusBadge status={st} />
              </div>
              <p className="sub">{(r.domains || []).join(', ')}</p>
              <dl className="kv compact">
                <dt>Issuer</dt><dd>{dnValue(r.issuer_dn, 'CN') || r.issuer_dn}</dd>
                <dt>Validity</dt><dd>{fmtDate(r.not_before)} → {fmtDate(r.not_after)}</dd>
                <dt>Mark type</dt><dd>{r.mark_type || '—'}{r.word_mark ? ` · “${r.word_mark}”` : ''}</dd>
                {r.trademark_registration && <><dt>Trademark</dt><dd>{r.trademark_country} #{r.trademark_registration}</dd></>}
                <dt>Serial</dt><dd className="mono small">{r.serial_hex}</dd>
                <dt>SHA-256</dt><dd className="mono small wrap-any">{r.sha256} <CopyBtn text={r.sha256} /></dd>
              </dl>
              <div className="links">
                <a href={r.pem_url} target="_blank" rel="noreferrer">PEM</a>
                <a href={r.der_url} target="_blank" rel="noreferrer">DER</a>
                <a href={r.page_url} target="_blank" rel="noreferrer">ctlogs.dev page ↗</a>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
