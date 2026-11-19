import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useMagnetic } from '../state/hooks'

/** Headline set line by line, each line rising through its own mask. */
export function Lines({ lines, className = 'headline', delay = 0, as: Tag = 'h2' }: { lines: string[]; className?: string; delay?: number; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <Tag className={className}>
      {lines.map((l, i) => (
        <span className="line" key={i}>
          <span className="line-inner" style={{ '--i': i, '--d': `${delay}ms` } as CSSProperties}>
            {l}
          </span>
        </span>
      ))}
    </Tag>
  )
}

/** 02 —— Engineering */
export function Index({ num, label }: { num: string; label: string }) {
  return (
    <p className="index">
      <span className="index-num">{num}</span>
      <span className="index-rule" />
      <span className="index-label">{label}</span>
    </p>
  )
}

export function Specs({ rows, className = '' }: { rows: [string, string][]; className?: string }) {
  return (
    <dl className={`specs ${className}`}>
      {rows.map(([k, v], i) => (
        <div className="spec" key={k} style={{ '--i': i } as CSSProperties}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The primary action: a hairline box whose fill wipes up; leans toward the cursor. */
export function Cta({ children, onClick, className = '', arrow = true }: { children: ReactNode; onClick: () => void; className?: string; arrow?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  useMagnetic(ref)
  return (
    <button ref={ref} type="button" className={`cta ${className}`} onClick={onClick}>
      <span className="cta-fill" aria-hidden />
      <span className="cta-label">{children}</span>
      {arrow && (
        <span className="cta-arrow" aria-hidden>
          <svg viewBox="0 0 20 10" width="20" height="10">
            <path d="M0 5h18M14 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </span>
      )}
    </button>
  )
}

/** Quiet text action with an underline that draws on hover. */
export function TextButton({ children, onClick, className = '' }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`text-button ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** One choice in a set: typographic, with an optional finish swatch. */
export function Choice({
  selected,
  onSelect,
  children,
  swatch,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  swatch?: readonly [string, string]
}) {
  return (
    <button type="button" className={`choice ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      {swatch && <span className="swatch" style={{ '--a': swatch[0], '--b': swatch[1] } as CSSProperties} aria-hidden />}
      <span className="choice-label">{children}</span>
    </button>
  )
}
