import { useState } from 'react';
import { Typography } from '@northslopetech/altitude-ui';
import { PricingLab } from './PricingLab';
import { Backtesting } from './Backtesting';

export function Results() {
  const [section, setSection] = useState<'pricing-lab' | 'validation'>('pricing-lab');

  return (
    <div>
      {/* Section toggle */}
      <div style={{ display: 'flex', gap: '0', padding: '32px 0 0 0' }}>
        <button
          onClick={() => setSection('pricing-lab')}
          style={{
            padding: '8px 20px',
            borderRadius: '8px 0 0 8px',
            border: '1px solid var(--color-subtle)',
            borderRight: 'none',
            fontSize: '13px',
            fontWeight: section === 'pricing-lab' ? 700 : 400,
            backgroundColor: section === 'pricing-lab' ? 'var(--color-interactive)' : 'var(--color-base-white)',
            color: section === 'pricing-lab' ? 'white' : 'var(--color-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Pricing Lab
        </button>
        <button
          onClick={() => setSection('validation')}
          style={{
            padding: '8px 20px',
            borderRadius: '0 8px 8px 0',
            border: '1px solid var(--color-subtle)',
            fontSize: '13px',
            fontWeight: section === 'validation' ? 700 : 400,
            backgroundColor: section === 'validation' ? 'var(--color-interactive)' : 'var(--color-base-white)',
            color: section === 'validation' ? 'white' : 'var(--color-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Validation
        </button>
      </div>

      {section === 'pricing-lab' ? <PricingLab /> : <Backtesting />}
    </div>
  );
}
