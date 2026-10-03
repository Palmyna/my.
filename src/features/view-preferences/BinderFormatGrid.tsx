import type { CSSProperties } from 'react'
import type { BinderFormat } from '../../types/view-preferences'
import './binder-format-grid.css'

export function BinderFormatGrid({ format }: { format: BinderFormat }) {
  const [columns, rows] = format.split('x').map(Number)
  return <span className="binder-format-grid" style={{ '--binder-columns': columns } as CSSProperties} aria-hidden="true">
    {Array.from({ length: columns! * rows! }, (_, index) => <i key={index} />)}
  </span>
}
