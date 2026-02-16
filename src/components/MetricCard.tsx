import { Typography } from '@northslopetech/altitude-ui';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function MetricCard({ label, value, subtitle, icon }: MetricCardProps) {
  return (
    <div
      style={{
        border: '1px solid var(--color-subtle)',
        borderRadius: '8px',
        padding: '16px 20px',
        backgroundColor: 'var(--color-base-white)',
      }}
    >
      <div className="flex items-center" style={{ gap: '8px', marginBottom: '8px' }}>
        {icon && <span style={{ color: 'var(--color-interactive)' }}>{icon}</span>}
        <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>
          {label}
        </Typography>
      </div>
      <Typography variant="heading-md" as="div">
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body-xs" style={{ color: 'var(--color-secondary)', marginTop: '4px' }}>
          {subtitle}
        </Typography>
      )}
    </div>
  );
}
