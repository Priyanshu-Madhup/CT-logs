import { useEffect, useState } from 'react'
import { MODES } from './api.js'
import { goSearch } from './util.js'
import { Header, Footer, SearchBox } from './components.jsx'
import Results from './Results.jsx'
import CertView from './CertView.jsx'

// Hash routes: #/s/{mode}/{query}  and  #/c/{certId}
function parseHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/')
  try {
    if (parts[0] === 's' && MODES[parts[1]] && parts[2]) return { page: 'search', mode: parts[1], q: decodeURIComponent(parts.slice(2).join('/')) }
    if (parts[0] === 'c' && parts[1]) return { page: 'cert', id: decodeURIComponent(parts[1]) }
  } catch { /* fall through */ }
  return { page: 'home' }
}

const EXAMPLES = [
  ['subdomains', 'digicert.com'],
  ['domain', 'www.digicert.com'],
  ['org', 'DigiCert'],
  ['bimi', 'cnn.com'],
  ['hosts', 'digicert.com'],
]

export default function App() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const home = route.page === 'home'

  return (
    <>
      <Header />
      <section className={`hero ${home ? 'hero-big' : ''}`}>
        <div className="wrap">
          {home && (
            <>
              <p className="eyebrow">Certificate Transparency</p>
              <h1>See every certificate issued for&nbsp;your&nbsp;domain.</h1>
              <p className="lede">
                Search public CT logs by domain, subdomain, organization, serial number or fingerprint — and inspect
                the full details of any TLS certificate.
              </p>
            </>
          )}
          <SearchBox
            key={route.page + (route.mode || '') + (route.q || route.id || '')}
            initialMode={route.mode || (route.page === 'cert' ? 'cert' : 'subdomains')}
            initialQuery={route.q || route.id || ''}
          />
          {home && (
            <div className="examples">
              <span>Try:</span>
              {EXAMPLES.map(([m, q]) => (
                <button key={m + q} className="chip" onClick={() => goSearch(m, q)}>
                  <b>{MODES[m].label}</b> {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="wrap main">
        {route.page === 'search' && <Results key={route.mode + route.q} mode={route.mode} q={route.q} />}
        {route.page === 'cert' && <CertView key={route.id} id={route.id} />}
        {home && <HomeInfo />}
      </main>

      <Footer />
    </>
  )
}

function HomeInfo() {
  const items = [
    ['Full certificate detail', 'Subject and issuer, SANs, validity window, key and signature algorithms, policies, fingerprints and every CT log sighting.'],
    ['Subdomain discovery', 'Enumerate every hostname with a valid or recently expired certificate, with first/last seen dates.'],
    ['Organization & BIMI', 'Find certificates by subject organization and browse Verified / Common Mark certificates with their logos.'],
    ['Straight from the logs', 'Data comes live from the public Certificate Transparency logs. No account needed.'],
  ]
  return (
    <section className="features">
      {items.map(([t, d]) => (
        <div className="feature" key={t}>
          <div className="feature-bar" />
          <h3>{t}</h3>
          <p>{d}</p>
        </div>
      ))}
    </section>
  )
}
