export const BASE = 'https://api.ctlogs.dev'
// Optional key supplied at build time (CTLOGS_KEY / CTLOGS_API_KEY).
const ENV_KEY = import.meta.env.CTLOGS_KEY || import.meta.env.CTLOGS_API_KEY || ''
export const getKey = () => ENV_KEY

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

// Anonymous and free callers may only have one request in flight, so every call is queued.
let chain = Promise.resolve()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run(path, params, raw) {
  const url = new URL(BASE + path)
  Object.entries(params || {}).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v))
  const key = getKey()
  const headers = key ? { Authorization: `Bearer ${key}` } : {}
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(url, { headers })
    } catch {
      throw new ApiError('Could not reach the certificate service. Check your connection and try again.', 0)
    }
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const wait = Number(res.headers.get('Retry-After'))
      // A short Retry-After means "one at a time"; a long one is the hourly cap, which we don't wait out.
      if (res.status === 503 || (wait && wait <= 5)) { await sleep((wait || 2) * 1000); continue }
    }
    const remaining = res.headers.get('X-Hourly-Remaining') ?? res.headers.get('X-RateLimit-Remaining')
    if (!res.ok) {
      const friendly = {
        400: "That doesn't look like a valid search. Please check it and try again.",
        403: "That search can't go any further right now.",
        404: 'Nothing was found for that search.',
        429: "We're getting a lot of searches right now. Please try again in a little while.",
        503: 'The service is busy. Please try again shortly.',
      }
      throw new ApiError(friendly[res.status] || 'Something went wrong. Please try again.', res.status)
    }
    if (raw) return { blob: await res.blob(), remaining }
    const data = await res.json()
    return { data, remaining }
  }
}

export function request(path, params, raw = false) {
  const p = chain.then(() => run(path, params, raw))
  chain = p.catch(() => {})
  return p
}

const enc = encodeURIComponent
export const MODES = {
  subdomains: { label: 'Subdomains', ph: 'digicert.com', hint: 'Certificates for a domain and every name under it', path: (q) => `/v1/subdomains/${enc(q)}` },
  domain: { label: 'Exact domain', ph: 'www.digicert.com', hint: 'Certificates naming exactly this hostname', path: (q) => `/v1/domain/${enc(q)}` },
  hosts: { label: 'Host finder', ph: 'digicert.com', hint: 'One row per hostname with certificate counts', path: (q) => `/v1/hosts/${enc(q)}` },
  org: { label: 'Organization', ph: 'DigiCert', hint: 'Certificates by subject organization', path: () => '/v1/org', params: (q) => ({ q }) },
  serial: { label: 'Serial', ph: '0624d0ab311558780b7d5213b9631831', hint: 'Find certificates by serial number (hex)', path: (q) => `/v1/serial/${enc(q)}` },
  cert: { label: 'Fingerprint / ID', ph: 'SHA-256 fingerprint or certificate id', hint: 'Open the full record of one certificate', path: (q) => `/v1/cert/${enc(q)}` },
  bimi: { label: 'BIMI marks', ph: 'cnn.com or organization', hint: 'Verified / Common Mark Certificates', path: () => '/v1/bimi', params: (q) => ({ q }) },
}

export function search(mode, q, after) {
  const m = MODES[mode]
  return request(m.path(q), { ...(m.params ? m.params(q) : {}), after })
}
export const getCert = (id) => request(`/v1/cert/${enc(id)}`)
export const downloadCert = (id, file) => request(`/v1/cert/${enc(id)}/${file}`, {}, true)
