export const DAY = 86400000

export function certStatus(notBefore, notAfter, now = Date.now()) {
  const nb = Date.parse(notBefore), na = Date.parse(notAfter)
  if (now < nb) return { key: 'pending', label: 'Not yet valid', days: Math.ceil((na - now) / DAY) }
  if (now > na) return { key: 'expired', label: 'Expired', days: Math.floor((now - na) / DAY) }
  const days = Math.ceil((na - now) / DAY)
  return { key: days <= 30 ? 'expiring' : 'valid', label: days <= 30 ? 'Expiring soon' : 'Valid', days }
}

export function fmtDate(s, time = false) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d)) return s
  const o = { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' }
  if (time) Object.assign(o, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short' })
  return d.toLocaleString('en-GB', o)
}

export function lifetimeDays(nb, na) {
  return Math.round((Date.parse(na) - Date.parse(nb)) / DAY)
}

// Split a distinguished name on unescaped commas -> [{k, v}]
export function parseDN(dn) {
  if (!dn) return []
  const parts = []
  let cur = ''
  for (let i = 0; i < dn.length; i++) {
    const c = dn[i]
    if (c === '\\' && i + 1 < dn.length) { cur += dn[++i]; continue }
    if (c === ',') { parts.push(cur); cur = ''; continue }
    cur += c
  }
  parts.push(cur)
  return parts.map((p) => {
    const i = p.indexOf('=')
    return i < 0 ? { k: '', v: p.trim() } : { k: p.slice(0, i).trim(), v: p.slice(i + 1).trim() }
  }).filter((x) => x.v)
}

const DN_NAMES = {
  CN: 'Common name', O: 'Organization', OU: 'Org. unit', C: 'Country', ST: 'State / province', L: 'Locality',
  STREET: 'Street', SERIALNUMBER: 'Registration no.', POSTALCODE: 'Postal code',
}
export const dnLabel = (k) => DN_NAMES[k] || k

export const dnValue = (dn, key) => parseDN(dn).find((x) => x.k === key)?.v || ''
export const isDigiCert = (s) => /digicert/i.test(s || '')

const POLICIES = {
  '2.23.140.1.2.1': 'Domain Validated (DV)',
  '2.23.140.1.2.2': 'Organization Validated (OV)',
  '2.23.140.1.2.3': 'Individual Validated (IV)',
  '2.23.140.1.1': 'Extended Validation (EV)',
  '2.23.140.1.31': 'Onion Domain',
  '2.23.140.1.3': 'Code Signing (EV)',
  '2.23.140.1.4.1': 'Code Signing',
  '2.16.840.1.114412.2.1': 'DigiCert EV',
  '2.16.840.1.114412.1.1': 'DigiCert OV',
  '2.16.840.1.114412.1.2': 'DigiCert Class 3 OV',
  '1.3.6.1.4.1.53087.1.2': 'BIMI Verified Mark (VMC)',
  '1.3.6.1.4.1.53087.1.5': 'BIMI Common Mark (CMC)',
}
export const policyName = (oid) => POLICIES[oid] || ''

export function validationLevel(oids = []) {
  if (oids.includes('2.23.140.1.1') || oids.includes('2.16.840.1.114412.2.1')) return 'EV'
  if (oids.includes('2.23.140.1.2.3')) return 'IV'
  if (oids.includes('2.23.140.1.2.2')) return 'OV'
  if (oids.includes('2.23.140.1.2.1')) return 'DV'
  return ''
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const t = document.createElement('textarea')
    t.value = text; document.body.appendChild(t); t.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { /* ignore */ }
    t.remove(); return ok
  }
}

export function saveBlob(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function groupHex(h) {
  return (h || '').replace(/(..)(?!$)/g, '$1:').toUpperCase()
}

export function goSearch(mode, q) {
  if (mode === 'cert') window.location.hash = `#/c/${encodeURIComponent(q.replace(/[\s:]/g, ''))}`
  else window.location.hash = `#/s/${mode}/${encodeURIComponent(q)}`
}

export function countryName(cc) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc.toUpperCase()) || cc } catch { return cc }
}
export function countryFlag(cc) {
  return '' // flag emoji don't render on Windows; keep names only
}

// Registrable domain (approximation): treats common second-level registries under a country TLD
// (co.uk, com.au, bank.in, gov.in ...) as part of the suffix.
const SLD = /^(co|com|org|net|gov|edu|ac|or|ne|go|mil|nic|res|bank|firm|gen|ind|sch|ltd|plc|nhs|police)$/
export function baseDomain(name) {
  const h = (name || '').toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return ''
  const p = h.split('.')
  if (p.length <= 2) return h
  const n = p[p.length - 1].length === 2 && SLD.test(p[p.length - 2]) ? 3 : 2
  return p.slice(-n).join('.')
}

// Known CA / CT-log-operator names -> website, so logos can be shown next to them.
const ORG_SITES = [
  [/digicert/i, 'digicert.com'], [/let'?s encrypt|isrg/i, 'letsencrypt.org'], [/sectigo|comodo/i, 'sectigo.com'],
  [/globalsign/i, 'globalsign.com'], [/godaddy|starfield/i, 'godaddy.com'], [/amazon/i, 'amazon.com'],
  [/google/i, 'google.com'], [/cloudflare/i, 'cloudflare.com'], [/microsoft/i, 'microsoft.com'],
  [/entrust/i, 'entrust.com'], [/zerossl|apilayer/i, 'zerossl.com'], [/buypass/i, 'buypass.com'],
  [/ssl\.com/i, 'ssl.com'], [/actalis/i, 'actalis.com'], [/certum|asseco/i, 'certum.pl'],
  [/identrust/i, 'identrust.com'], [/geotrust/i, 'geotrust.com'], [/thawte/i, 'thawte.com'],
  [/rapidssl/i, 'rapidssl.com'], [/telia/i, 'telia.com'], [/harica/i, 'harica.gr'],
  [/trustasia/i, 'trustasia.com'], [/sslcorp/i, 'ssl.com'], [/geomys|sunlight/i, 'geomys.org'],
  [/gts|trust services/i, 'pki.goog'], [/ssl\.?com/i, 'ssl.com'], [/swisssign/i, 'swisssign.com'],
  [/e-?tugra/i, 'etugra.com.tr'], [/hongkong post/i, 'hongkongpost.gov.hk'], [/izenpe/i, 'izenpe.com'],
  [/fnmt/i, 'fnmt.es'], [/camerfirma/i, 'camerfirma.com'], [/digidentity/i, 'digidentity.eu'],
]
export function orgDomain(...names) {
  for (const n of names) {
    if (!n) continue
    const hit = ORG_SITES.find(([re]) => re.test(n))
    if (hit) return hit[1]
  }
  return ''
}
