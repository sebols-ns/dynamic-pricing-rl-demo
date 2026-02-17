import { Learn } from '../pages/Learn';

interface LearnPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (step: string) => void;
}

export function LearnPanel({ isOpen, onClose, onNavigate }: LearnPanelProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            zIndex: 998,
            transition: 'opacity 0.3s',
          }}
        />
      )}

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '420px',
          maxWidth: '90vw',
          height: '100vh',
          backgroundColor: 'var(--color-base-white)',
          borderLeft: '1px solid var(--color-subtle)',
          zIndex: 999,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen ? '-4px 0 24px rgba(0, 0, 0, 0.1)' : 'none',
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-subtle)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '16px' }}>Learn</span>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid var(--color-subtle)',
              backgroundColor: 'var(--color-base-white)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              color: 'var(--color-secondary)',
            }}
          >
            x
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Learn onNavigate={onNavigate} />
        </div>
      </div>
    </>
  );
}
