import { useCallback, useMemo, useState } from 'react';
import {
  Typography, Button, BarChart, LineChart, Table, Badge,
  CHART_COLORS, getSeriesColor,
} from '@northslopetech/altitude-ui';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useCsvData } from '../hooks/useCsvData';
import { MetricCard } from '../components/MetricCard';
import type { RetailRow } from '../types/data';

const columnHelper = createColumnHelper<RetailRow>();

const columns = [
  columnHelper.accessor('product_id', { header: 'Product ID' }),
  columnHelper.accessor('product_category_name', { header: 'Category' }),
  columnHelper.accessor('unit_price', {
    header: 'Unit Price',
    cell: info => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('qty', { header: 'Quantity' }),
  columnHelper.accessor('total_price', {
    header: 'Total Price',
    cell: info => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('comp_1', {
    header: 'Competitor',
    cell: info => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('lag_price', {
    header: 'Lag Price',
    cell: info => `$${info.getValue().toFixed(2)}`,
  }),
  columnHelper.accessor('month_year', { header: 'Date' }),
];

export function DataExplorer() {
  const { rows, products, categories, isLoaded, isLoading, error, loadFromFile, loadSampleData } = useCsvData();
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      loadFromFile(file);
    }
  }, [loadFromFile]);

  const handleFileInput = useCallback((files: FileList | null) => {
    if (files?.[0]) loadFromFile(files[0]);
  }, [loadFromFile]);

  const priceDistribution = useMemo(() => {
    if (!isLoaded) return [];
    const buckets: Record<string, number> = {};
    for (const row of rows) {
      const bucket = `$${(Math.floor(row.unit_price / 20) * 20).toFixed(0)}`;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => parseFloat(a.slice(1)) - parseFloat(b.slice(1)))
      .map(([range, count]) => ({ range, count }));
  }, [rows, isLoaded]);

  const priceTrends = useMemo(() => {
    if (!isLoaded) return [];
    const byDate = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const date = row.month_year;
      if (!byDate.has(date)) byDate.set(date, { total: 0, count: 0 });
      const entry = byDate.get(date)!;
      entry.total += row.unit_price;
      entry.count++;
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, count }]) => ({
        date,
        avgPrice: Math.round((total / count) * 100) / 100,
      }));
  }, [rows, isLoaded]);

  const dateRange = useMemo(() => {
    if (!isLoaded || rows.length === 0) return 'N/A';
    const dates = rows.map(r => r.month_year).filter(Boolean).sort();
    return `${dates[0]} — ${dates[dates.length - 1]}`;
  }, [rows, isLoaded]);

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg" style={{ marginBottom: '8px' }}>Data Explorer</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '32px' }}>
          Upload a CSV file or load the sample Kaggle Retail Price Optimization dataset to begin.
        </Typography>

        {error && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-error-subtle)',
            border: '1px solid var(--color-error)',
            marginBottom: '24px',
          }}>
            <Typography variant="body-sm" style={{ color: 'var(--color-error)' }}>{error}</Typography>
          </div>
        )}

        <div
          style={{
            border: '2px dashed var(--color-subtle)',
            borderRadius: '8px',
            padding: '48px 32px',
            textAlign: 'center',
            backgroundColor: 'var(--color-gray)',
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>
            Drag & Drop CSV Here
          </Typography>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '24px' }}>
            or use the buttons below
          </Typography>
          <div className="flex justify-center" style={{ gap: '12px' }}>
            <Button onClick={loadSampleData} disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Load Sample Data'}
            </Button>
            <Button variant="outline" onClick={() => document.getElementById('csv-upload')?.click()}>
              Upload CSV
            </Button>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => handleFileInput(e.target.files)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <Typography variant="heading-lg">Data Explorer</Typography>
        <Badge variant="success">{rows.length.toLocaleString()} rows loaded</Badge>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <MetricCard label="Total Rows" value={rows.length.toLocaleString()} />
        <MetricCard label="Products" value={products.length} />
        <MetricCard label="Categories" value={categories.length} />
        <MetricCard label="Date Range" value={dateRange} />
      </div>

      {/* Charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {priceDistribution.length > 0 && (
          <BarChart
            data={priceDistribution}
            xAxisKey="range"
            yAxisKey="count"
            title="Price Distribution"
            xAxisLabel="Price Range"
            yAxisLabel="Count"
            barColor={CHART_COLORS.PRIMARY}
            rotateXAxisLabels
          />
        )}
        {priceTrends.length > 0 && (
          <LineChart
            data={priceTrends}
            xAxisKey="date"
            series={[{ dataKey: 'avgPrice', color: getSeriesColor(0), strokeWidth: 2 }]}
            title="Average Price Over Time"
            xAxisLabel="Date"
            yAxisLabel="Avg Price ($)"
          />
        )}
      </div>

      {/* Data Table */}
      <div>
        <Typography variant="heading-sm" style={{ marginBottom: '16px' }}>Raw Data</Typography>
        <Table table={table} showPagination />
      </div>
    </div>
  );
}
