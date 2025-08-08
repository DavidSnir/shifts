import { useState, type ReactNode } from 'react'

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)

  return (
    <div style={{ border: '2px solid #000000', backgroundColor: '#ffffff', marginBottom: '20px' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer'
        }}
        aria-expanded={open}
        aria-controls={`section-${title.replace(/\s+/g, '-')}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{title}</span>
          {typeof count === 'number' && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 'bold',
                border: '1px solid #000000',
                padding: '2px 6px',
                borderRadius: '9999px',
                backgroundColor: '#ffffff'
              }}
            >
              {count}
            </span>
          )}
        </div>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id={`section-${title.replace(/\s+/g, '-')}`} style={{ padding: '8px 12px', borderTop: '2px solid #000000' }}>
          {children}
        </div>
      )}
    </div>
  )
}


