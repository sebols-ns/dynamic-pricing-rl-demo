import { Typography } from '@northslopetech/altitude-ui';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function MetricCard({ label, value, subtitle, icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-gray)', background: 'var(--color-light)' }}>
      <div className="flex items-center gap-2 mb-1">
        {icon && <span style={{ color: 'var(--color-interactive)' }}>{icon}</span>}
        <Typography variant="label-sm" style={{ color: 'var(--color-secondary)' }}>
          {label}
        </Typography>
      </div>
      <Typography variant="heading-lg" as="div">
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          {subtitle}
        </Typography>
      )}
    </div>
  );
}
