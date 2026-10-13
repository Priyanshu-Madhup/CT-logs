import { useEffect, useMemo, useState } from 'react'
import { getCert, downloadCert } from './api.js'
import {
  certStatus, fmtDate, lifetimeDays, parseDN, dnLabel, dnValue, isDigiCert, policyName, countryName, countryFlag, orgDomain, validationLevel, saveBlob, groupHex,
} from './util.js'
import { CopyBtn, StatusBadge } from './components.jsx'
import Logo from './Logo.jsx'

export default function CertView({ id }) {
  const [cert, setCert] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    getCert(id).then(({ data }) => alive && setCert(data)).catch((e) => alive && setErr(e))
    return () => { alive = false }
  }, [id])

  if (err) {
    return (
      <div className="alert alert-err">
        <strong>{err.status === 404 ? 'Certificate not found' : 'Could not load certificate'}</strong>
        <div>{err.message}</div>
        <a href="#/">← Back to search</a>
      </div>
    )
  }
  if (!cert) return <div className="skeleton"><div className="sk-row tall" /><div className="sk-row" /><div className="sk-row" /><div className="sk-row" /></div>
  return <Detail cert={cert} />
}

function Section({ title, children, right }) {
  return (
    <section className="card section">
      <div className="section-head"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  )
}

function Row({ k, children, mono, copyText }) {
  if (children == null || children === '' || children === false) return null
  return (
    <>
      <dt>{k}</dt>
      <dd className={mono ? 'mono small wrap-any' : ''}>
        {children}
        {copyText && <CopyBtn text={copyText} />}
      </dd>
    </>
  )
}

function Dn({ dn }) {
  const parts = parseDN(dn)
  if (!parts.length) return <p className="muted">—</p>
  return (
    <dl className="kv">
      {parts.map((p, i) => <Row key={i} k={dnLabel(p.k)}>{p.k === 'C' ? `${countryFlag(p.v)} ${countryName(p.v)} (${p.v})` : p.v}</Row>)}
    </dl>
  )
}

function Detail({ cert: c }) {
  const st = certStatus(c.not_before, c.not_after)
  const total = lifetimeDays(c.not_before, c.not_after)
  const pct = Math.min(100, Math.max(0, ((Date.now() - Date.parse(c.not_before)) / (Date.parse(c.not_after) - Date.parse(c.not_before))) * 100))
  const issuerCN = dnValue(c.issuer_dn, 'CN')
  const subjO = dnValue(c.subject_dn, 'O')
  const country = dnValue(c.subject_dn, 'C')
  const level = validationLevel(c.policy_oids)
  const [sanFilter, setSanFilter] = useState('')
  const [dl, setDl] = useState({ busy: '', err: '' })

  const sans = c.san_dns || []
  const shownSans = useMemo(() => {
    const f = sanFilter.trim().toLowerCase()
    return f ? sans.filter((s) => s.toLowerCase().includes(f)) : sans
  }, [sans, sanFilter])

  const download = async (file) => {
    setDl({ busy: file, err: '' })
    try {
      const { blob } = await downloadCert(c.id, file)
      saveBlob(blob, `${c.serial_hex || c.id}-${file.replace('/', '.')}`.replace('/', '-'))
      setDl({ busy: '', err: '' })
    } catch (e) {
      setDl({ busy: '', err: e.message })
    }
  }

  const files = [
    c.final_body_archived && ['final.pem', 'Final PEM'],
    c.final_body_archived && ['final.der', 'Final DER'],
    c.precert_body_archived && ['precert.pem', 'Precert PEM'],
    c.precert_body_archived && ['precert.der', 'Precert DER'],
  ].filter(Boolean)

  return (
    <div className="detail">
      <a className="back" href="#/" onClick={(e) => { e.preventDefault(); window.history.length > 1 ? window.history.back() : (window.location.hash = '#/') }}>← Back</a>

      <div className={`banner st-${st.key}`}>
        <div className="banner-main">
          <div className="banner-top">
            <StatusBadge status={st} />
            {level && <span className="badge level">{level}</span>}
            {isDigiCert(c.issuer_dn) && <span className="badge brand">Issued by DigiCert</span>}
            {c.is_ca && <span className="badge level">CA certificate</span>}
          </div>
          <div className="cn-row">
            <Logo domain={c.subject_cn && c.subject_cn.includes('.') ? c.subject_cn : (c.san_dns || [])[0]} name={subjO || c.subject_cn} size={48} />
            <h2 className="cn">{c.subject_cn || subjO || 'Certificate'}</h2>
          </div>
          {subjO && <p className="banner-org">{subjO}</p>}
          {country && <p className="banner-issuer">{countryFlag(country)} {countryName(country)}</p>}
          <p className="banner-issuer namecell">
            <Logo domain={orgDomain(c.issuer_dn)} name={issuerCN} size={24} />
            <span>Issued by <b>{issuerCN || c.issuer_dn}</b></span>
          </p>
        </div>
        <div className="banner-days">
          <b>{st.days}</b>
          <span>{st.key === 'expired' ? 'days since expiry' : st.key === 'pending' ? 'days until it expires' : 'days remaining'}</span>
        </div>
        <div className="lifebar" aria-hidden="true">
          <div className="lifebar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="lifebar-labels">
          <span>{fmtDate(c.not_before)}</span>
          <span>{total}-day certificate</span>
          <span>{fmtDate(c.not_after)}</span>
        </div>
      </div>

      <div className="grid2">
        <Section title="Subject">
          <div className="namecell dn-head"><Logo domain={c.subject_cn && c.subject_cn.includes('.') ? c.subject_cn : (c.san_dns || [])[0]} name={subjO || c.subject_cn} size={36} /><b>{subjO || c.subject_cn}</b></div>
          <Dn dn={c.subject_dn} />
        </Section>
        <Section title="Issuer">
          <div className="namecell dn-head"><Logo domain={orgDomain(c.issuer_dn)} name={issuerCN} size={36} /><b>{dnValue(c.issuer_dn, 'O') || issuerCN}</b></div>
          <Dn dn={c.issuer_dn} />
        </Section>
      </div>

      <Section title="Certificate">
        <dl className="kv">
          <Row k="Valid from">{fmtDate(c.not_before, true)}</Row>
          <Row k="Valid to">{fmtDate(c.not_after, true)}</Row>
          <Row k="Lifetime">{total} days</Row>
          <Row k="Serial number" mono copyText={c.serial_hex}>{groupHex(c.serial_hex)}</Row>
          <Row k="Signature algorithm">{c.sig_algo}</Row>
          <Row k="Public key SHA-256" mono copyText={c.pubkey_sha256}>{c.pubkey_sha256}</Row>
          <Row k="Certificate type">{c.is_ca ? 'CA certificate' : 'End-entity (leaf)'}</Row>
          <Row k="Certificate ID" mono copyText={c.id}>{c.id}</Row>
        </dl>
      </Section>

      <div className="grid2">
        <Section title="Fingerprints">
          <dl className="kv">
            <Row k="Final SHA-256" mono copyText={c.final_sha256}>{c.final_sha256}</Row>
            <Row k="Precert SHA-256" mono copyText={c.precert_sha256}>{c.precert_sha256}</Row>
            <Row k="Final first seen">{c.final_first_seen ? fmtDate(c.final_first_seen, true) : 'never logged'}</Row>
            <Row k="Precert first seen">{c.precert_first_seen ? fmtDate(c.precert_first_seen, true) : 'never logged'}</Row>
          </dl>
        </Section>
        <Section title="Usage & policies">
          <dl className="kv">
            <Row k="Extended key usage">
              {(c.ext_key_usage || []).length ? (
                <div className="pills">{c.ext_key_usage.map((u) => <span className="pill" key={u}>{u.replace(/_/g, ' ')}</span>)}</div>
              ) : null}
            </Row>
            <Row k="Policy OIDs">
              {(c.policy_oids || []).length ? (
                <ul className="oids">
                  {c.policy_oids.map((o) => (
                    <li key={o}><span className="mono small">{o}</span>{policyName(o) && <span className="pill brand">{policyName(o)}</span>}</li>
                  ))}
                </ul>
              ) : null}
            </Row>
          </dl>
        </Section>
      </div>

      <Section
        title={`Subject alternative names (${sans.length})`}
        right={sans.length > 8 && (
          <input className="input input-sm" placeholder="Filter names…" value={sanFilter} onChange={(e) => setSanFilter(e.target.value)} />
        )}
      >
        {sans.length === 0 ? <p className="muted">None.</p> : (
          <>
            <ul className="sans">
              {shownSans.slice(0, 500).map((s) => (
                <li key={s}>
                  <Logo domain={s} name={s} size={18} />
                  <a href={`#/s/domain/${encodeURIComponent(s)}`} title="Find certificates for this name">{s}</a>
                </li>
              ))}
            </ul>
            {shownSans.length > 500 && <p className="muted small">Showing first 500 of {shownSans.length}. Use the filter to narrow down.</p>}
            {shownSans.length === 0 && <p className="muted">No names match.</p>}
            <div className="section-foot"><CopyBtn text={sans.join('\n')} label="Copy all names" /></div>
          </>
        )}
      </Section>

      <Section title={`Certificate Transparency log sightings (${(c.sightings || []).length})`}>
        {(c.sightings || []).length === 0 ? <p className="muted">No sightings recorded.</p> : (
          <div className="table-wrap flat">
            <table className="table">
              <thead><tr><th>Operator</th><th>Log</th><th>Type</th><th className="num">Entry</th><th>SCT timestamp</th></tr></thead>
              <tbody>
                {c.sightings.map((s, i) => (
                  <tr key={i}>
                    <td><span className="namecell"><Logo domain={orgDomain(s.operator, s.log_url)} name={s.operator} size={20} />{s.operator || '—'}</span></td>
                    <td className="mono small wrap-any">{s.log_url ? <a href={s.log_url} target="_blank" rel="noreferrer">{s.log_url.replace(/^https?:\/\//, '')}</a> : s.log_id}</td>
                    <td><span className="pill">{s.is_precert ? 'Precertificate' : 'Final'}</span></td>
                    <td className="num mono small">{s.entry_idx?.toLocaleString?.() ?? s.entry_idx}</td>
                    <td className="nowrap">{fmtDate(s.sct_ts, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Download & links">
        {files.length > 0 ? (
          <div className="dl-row">
            {files.map(([f, label]) => (
              <button key={f} className="btn btn-outline btn-sm" disabled={!!dl.busy} onClick={() => download(f)}>
                {dl.busy === f ? 'Downloading…' : label}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">The certificate file is only kept for 7 days after it first appears, so it is no longer available to download.</p>
        )}
        {dl.err && <div className="alert alert-err">{dl.err}</div>}
        <div className="links">
          <a href={`https://ctlogs.dev/cert/${c.id}`} target="_blank" rel="noreferrer">View on ctlogs.dev ↗</a>
          <a href={`https://crt.sh/?q=${c.final_sha256 || c.precert_sha256 || ''}`} target="_blank" rel="noreferrer">Search on crt.sh ↗</a>
        </div>
      </Section>
    </div>
  )
}
