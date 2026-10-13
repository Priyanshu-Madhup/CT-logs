import { useState } from 'react'
import { baseDomain } from './util.js'

// logo.dev publishable key (pk_...) from LOGODEV_KEY. Without it, letter placeholders are shown.
const TOKEN = import.meta.env.LOGODEV_KEY || ''

export default function Logo({ domain, name, size = 32 }) {
  const d = baseDomain(domain)
  const [failed, setFailed] = useState(false)
  const letter = (name || domain || '?').replace(/^\*\./, '').charAt(0).toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.45 }
  if (!d || !TOKEN || failed) return <span className="logo logo-fallback" style={style} aria-hidden="true">{letter}</span>
  return (
    <img
      className="logo"
      style={style}
      src={`https://img.logo.dev/${encodeURIComponent(d)}?token=${TOKEN}&size=${size * 2}&format=png&retina=true`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
