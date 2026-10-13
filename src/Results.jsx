import { useEffect, useMemo, useRef, useState } from 'react'
import { MODES, search, getCert } from './api.js'
import { certStatus, fmtDate, isDigiCert, dnValue, countryName, countryFlag, orgDomain, groupOrgDomains, orgKey } from './util.js'
import { StatusBadge, CopyBtn } from './components.jsx'
import Logo from './Logo.jsx'
import { Filters, Leaderboard, EMPTY_FILTERS, buildItems, applyFilters, exportRows } from './Insights.jsx'

export default function Results({ mode, q }) {
  const [rows, setRows] = useState([])
  const [page, setPage] = useState({ hasNext: false, cursor: '', ms: null, window: null, truncated: false, extra: null })
  const [state, setState] = useState('loading') // loading | done | error
  const [more, setMore] = useState(false)
  const [err, setErr] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [f, setF] = useState(EMPTY_FILTERS)
  const alive = useRef(true)
  const [issuers, setIssuers] = useState({}) // id -> { dn } | { error }
  const [issuerLimit, setIssuerLimit] = useState(0)
  const fetching = useRef(new Set())
  const started = useRef(false)
  const [auto, setAuto] = useState(false)  // fetch every remaining page (opt-in: costs one request per page)
  const stopRef = useRef(false)

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
    if (!started.current) { started.current = true; load() } // guard against the dev-mode double effect
    return () => { alive.current = false }
  }, [])

  // Fetch every page automatically (stoppable). Keyless callers are capped by the API at 10 pages.
  useEffect(() => {
    if (state !== 'done' || !auto || !page.hasNext || more || err || stopRef.current) return
    load(page.cursor)
  }, [state, auto, page, more, err])

  // Subject country (and, for org search, the issuer) live only in the full record: look up per certificate (1 credit each).
  useEffect(() => {
    if (mode === 'hosts' || mode === 'bimi') return
    rows.slice(0, issuerLimit).forEach((r) => {
      if (fetching.current.has(r.id)) return
      fetching.current.add(r.id)
      setIssuers((p) => ({ ...p, [r.id]: { loading: true } }))
      getCert(r.id)
        .then(({ data }) => alive.current && setIssuers((p) => ({ ...p, [r.id]: { dn: data.issuer_dn, country: dnValue(data.subject_dn, 'C') } })))
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

  const orgGroups = useMemo(() => (mode === 'org' ? groupOrgDomains(rows) : {}), [rows, mode])

  const certMode = !isHosts && !isBimi
  const items = useMemo(() => (certMode ? buildItems(enriched, issuers, mode === 'org') : []), [enriched, issuers, mode, certMode])
  const filtered = useMemo(() => applyFilters(items, f), [items, f])
  const hasLookup = items.some((i) => i.m.country !== undefined)
  const shown = useMemo(() => {
    if (certMode) return filtered.map((i) => i.r)
    const t = f.text.trim().toLowerCase()
    return t ? enriched.filter((x) => JSON.stringify(Object.values(x)).toLowerCase().includes(t)) : enriched
  }, [certMode, filtered, enriched, f.text])

  return (
    <section>
      <div className="results-head">
        <div>
          <p className="eyebrow dark">{MODES[mode].label}</p>
          <h2 className="results-title">{q}</h2>
        </div>
        {state === 'done' && (
          <p className="muted small">
            {rows.length} loaded{page.hasNext ? '+' : ' (all)'}
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
          {rows.length > 0 && certMode && (
            <>
              <Filters items={items} f={f} setF={setF} stats={stats} hasLookup={hasLookup} />
              <Leaderboard items={items} f={f} setF={setF} org={mode === 'org'} hasLookup={hasLookup} />
              <div className="table-meta">
                <span className="muted small">Showing {filtered.length} of {rows.length} certificates</span>
                <button className="btn btn-outline btn-sm" onClick={() => exportRows(filtered)}>Download CSV</button>
              </div>
            </>
          )}
          {rows.length > 0 && !certMode && (
            <div className="toolbar">
              <input className="input" placeholder="Filter loaded results…" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
            </div>
          )}

          {rows.length === 0 && <div className="empty">No certificates found for “{q}”.</div>}
          {rows.length > 0 && isHosts && <HostsTable rows={shown} />}
          {rows.length > 0 && isBimi && <BimiList rows={shown} />}
          {rows.length > 0 && !isHosts && !isBimi && <CertTable rows={shown} org={mode === 'org'} issuers={issuers} groups={orgGroups} />}
          {mode !== 'hosts' && mode !== 'bimi' && rows.length > issuerLimit && (
            <div className="more lookup">
              <p className="muted small">
                Country is not in the search results; each lookup is one extra API request
                ({Math.min(issuerLimit, rows.length)} of {rows.length} done).
              </p>
              {issuerLimit < 15 && rows.length > 15 && <button className="btn btn-outline btn-sm" onClick={() => setIssuerLimit(15)}>Look up first 15</button>}{' '}
              <button className="btn btn-outline btn-sm" onClick={() => setIssuerLimit(rows.length)}>Look up all {rows.length}</button>
            </div>
          )}
          {rows.length > 0 && shown.length === 0 && <div className="empty">No loaded rows match your filter.</div>}

          {err && <ErrorBox err={err} />}
          {page.hasNext && (
            <div className="more">
              {auto && !err ? (
                <>
                  <p className="muted small">Loading all pages… {rows.length} certificates so far.</p>
                  <button className="btn btn-outline btn-sm" onClick={() => { stopRef.current = true; setAuto(false) }}>Stop</button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" disabled={more} onClick={() => { setErr(null); load(page.cursor) }}>
                    {more ? 'Loading…' : err ? 'Retry' : 'Load more'}
                  </button>{' '}
                  <button className="btn btn-outline" disabled={more} onClick={() => { stopRef.current = false; setAuto(true); setErr(null) }}>
                    Load all remaining
                  </button>
                </>
              )}
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
  if (!info) return <span className="muted small" title="Use “Look up” below the table">—</span>
  if (info.loading) return <span className="muted small">Loading…</span>
  if (info.error) return <span className="muted small">Unavailable</span>
  const cn = dnValue(info.dn, 'CN') || info.dn
  return (
    <div className="namecell">
      <Logo domain={orgDomain(info.dn)} name={cn} size={24} />
      <div>{cn}{isDigiCert(info.dn) && <span className="badge brand">DigiCert</span>}<div className="sub">{dnValue(info.dn, 'O')}</div></div>
    </div>
  )
}

function CountryCell({ info }) {
  if (!info) return <span className="muted small" title="Use “Look up” below the table">—</span>
  if (info.loading) return <span className="muted small">…</span>
  if (info.error) return <span className="muted small">n/a</span>
  if (!info.country) return <span className="muted small" title="Domain-validated certificates carry no subject country">—</span>
  return <span title={info.country}>{countryFlag(info.country)} {countryName(info.country)}</span>
}

function CertTable({ rows, org, issuers = {}, groups = {} }) {
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
            <th>Country</th>
            <th className="num">{org ? 'Domains' : 'SANs'}</th>
            <th>Serial</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="clickrow" onClick={() => { window.location.hash = `#/c/${r.id}` }}>
              <td><StatusBadge status={r._st} /></td>
              <td className="name">
                <div className="namecell">
                  <Logo domain={org ? groups[orgKey(r.match || r.subject_cn)] || r.domains : r.match} group={org ? orgKey(r.match || r.subject_cn) : undefined} name={r.match || r.subject_cn} />
                  <div>
                    <a href={`#/c/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.match || r.subject_cn}</a>
                    {org && r.subject_cn && r.subject_cn !== r.match && <div className="sub">{r.subject_cn}</div>}
                  </div>
                </div>
              </td>
              <td>
                {org && !r.issuer ? <IssuerCell info={issuers[r.id]} /> : (
                  <div className="namecell">
                    <Logo domain={orgDomain(r.issuer)} name={r.issuer} size={24} />
                    <div>{r.issuer}{isDigiCert(r.issuer) && <span className="badge brand">DigiCert</span>}</div>
                  </div>
                )}
              </td>
              <td className="nowrap">{fmtDate(r.not_before)}</td>
              <td className="nowrap">
                {fmtDate(r.not_after)}
                <div className="sub">{r._st.key === 'expired' ? `${r._st.days}d ago` : `in ${r._st.days}d`}</div>
              </td>
              {!org && <td className="nowrap">{r.key_algo || '—'}</td>}
              <td className="nowrap"><CountryCell info={issuers[r.id]} /></td>
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
                <td className="name"><div className="namecell"><Logo domain={h.host} name={h.host} /><span className="mono">{h.host}</span></div></td>
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
              {r.logo_url ? <img src={r.logo_url} alt={`${r.subject_o} logo`} loading="lazy" /> : <Logo domain={r.domains} name={r.subject_o} size={64} />}
            </div>
            <div className="bimi-body">
              <div className="bimi-top">
                <h3>{r.subject_o || r.subject_cn}</h3>
                <span className="badge brand">{r.kind}</span>
                <StatusBadge status={st} />
              </div>
              <p className="sub">{(r.domains || []).join(', ')}</p>
              <dl className="kv compact">
                <dt>Issuer</dt><dd><span className="namecell"><Logo domain={orgDomain(r.issuer_dn)} name={dnValue(r.issuer_dn, 'CN')} size={20} />{dnValue(r.issuer_dn, 'CN') || r.issuer_dn}</span></dd>
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
