import type { ReactNode } from 'react'

export default function SmallIconButton({
  label,
  title,
  onClick,
  disabled,
  children
}: {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 20,
        height: 20,
        minWidth: 20,
        minHeight: 20,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        backgroundColor: '#ffffff',
        color: '#000000',
        border: '1px solid #000000',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0
      }}
    >
      {children || '✕'}
    </button>
  )
}


