import { useState } from 'react'
import { baseDomain } from './util.js'

// logo.dev publishable key (pk_...) from LOGODEV_KEY. Without it, letter placeholders are shown.
const TOKEN = import.meta.env.LOGODEV_KEY || ''

// `domain` may be one hostname or a list; each distinct registrable domain is tried in turn
// (logo.dev answers 404 when it has no logo), then a letter placeholder is shown.
export default function Logo({ domain, name, size = 32 }) {
  const list = [...new Set((Array.isArray(domain) ? domain : [domain]).map(baseDomain).filter(Boolean))].slice(0, 4)
  const [i, setI] = useState(0)
  const letter = (name || list[0] || '?').replace(/^\*\./, '').charAt(0).toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.45 }
  const d = list[i]
  if (!d || !TOKEN) return <span className="logo logo-fallback" style={style} aria-hidden="true">{letter}</span>
  return (
    <img
      key={d}
      className="logo"
      style={style}
      src={`https://img.logo.dev/${encodeURIComponent(d)}?token=${TOKEN}&size=${size * 2}&format=png&retina=true&fallback=404`}
      alt=""
      loading="lazy"
      onError={() => setI(i + 1)}
    />
  )
}
