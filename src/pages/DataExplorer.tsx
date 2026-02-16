import { useCallback, useMemo, useState } from 'react';
import {
  Typography, Button, BarChart, LineChart, Table, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
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
  const [chartProduct, setChartProduct] = useState<string>('all');
  const [tableProduct, setTableProduct] = useState<string>('all');

  // Filtered rows for charts
  const chartRows = useMemo(() => {
    if (chartProduct === 'all') return rows;
    return rows.filter(r => r.product_id === chartProduct);
  }, [rows, chartProduct]);

  // Filtered rows for table
  const tableRows = useMemo(() => {
    if (tableProduct === 'all') return rows;
    return rows.filter(r => r.product_id === tableProduct);
  }, [rows, tableProduct]);

  const table = useReactTable({
    data: tableRows,
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
    if (!isLoaded || chartRows.length === 0) return [];
    const buckets: Record<string, number> = {};
    for (const row of chartRows) {
      const bucket = `$${(Math.floor(row.unit_price / 20) * 20).toFixed(0)}`;
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => parseFloat(a.slice(1)) - parseFloat(b.slice(1)))
      .map(([range, count]) => ({ range, count }));
  }, [chartRows, isLoaded]);

  // Group by year-month, sorted, with cleaner labels
  const priceTrends = useMemo(() => {
    if (!isLoaded || chartRows.length === 0) return [];
    const byDate = new Map<string, { total: number; count: number }>();
    for (const row of chartRows) {
      // Normalize date to YYYY-MM for sorting
      const raw = row.month_year;
      const key = raw; // already in sortable format from our CSV
      if (!byDate.has(key)) byDate.set(key, { total: 0, count: 0 });
      const entry = byDate.get(key)!;
      entry.total += row.unit_price;
      entry.count++;
    }
    const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

    // Downsample if too many points — show max ~30 for clean x-axis
    const maxPoints = 30;
    let entries = sorted;
    if (entries.length > maxPoints) {
      const step = entries.length / maxPoints;
      const sampled = [];
      for (let i = 0; i < maxPoints; i++) {
        sampled.push(entries[Math.floor(i * step)]);
      }
      sampled.push(entries[entries.length - 1]);
      entries = sampled;
    }

    // Show labels at intervals for a clean x-axis (~8-10 labels max)
    const labelInterval = Math.max(1, Math.ceil(entries.length / 10));
    return entries.map(([date, { total, count }], i) => ({
      date: i % labelInterval === 0 || i === entries.length - 1 ? date : '',
      avgPrice: Math.round((total / count) * 100) / 100,
    }));
  }, [chartRows, isLoaded]);

  const dateRange = useMemo(() => {
    if (!isLoaded || rows.length === 0) return 'N/A';
    const dates = rows.map(r => r.month_year).filter(Boolean).sort();
    return `${dates[0]} — ${dates[dates.length - 1]}`;
  }, [rows, isLoaded]);

  const productFilterUI = (
    value: string,
    onChange: (v: string) => void,
    label: string,
  ) => (
    <div style={{ width: '220px' }}>
      <Typography variant="label-sm-bold" style={{ marginBottom: '6px' }}>{label}</Typography>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger width="fill">
          <SelectValue placeholder="All Products" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Products</SelectItem>
          {products.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.id} ({p.category})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

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

        {/* Dataset context */}
        <div style={{
          border: '1px solid var(--color-subtle)',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'var(--color-info-subtle)',
          borderColor: 'var(--color-blue-200)',
          marginBottom: '24px',
        }}>
          <Typography variant="heading-sm" style={{ marginBottom: '8px' }}>About the Dataset</Typography>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '8px' }}>
            The sample data comes from the <strong>Kaggle Retail Price Optimization</strong> dataset (CC0 Public Domain).
            It contains 607 rows of monthly product-level retail data from a Brazilian e-commerce platform, covering
            demand volumes, unit prices, freight costs, competitor pricing, and seasonal patterns.
          </Typography>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
            Key columns used by the RL agent: <strong>qty</strong> (demand), <strong>unit_price</strong> (current price),
            <strong> comp_1</strong> (primary competitor price), <strong>freight_price</strong> (cost proxy),
            <strong> lag_price</strong> (previous period price), and <strong>month</strong> (seasonality).
          </Typography>
        </div>

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

      {/* Dataset context */}
      <div style={{
        border: '1px solid var(--color-blue-200)',
        borderRadius: '8px',
        padding: '16px 20px',
        backgroundColor: 'var(--color-info-subtle)',
        marginBottom: '24px',
      }}>
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          <strong>Kaggle Retail Price Optimization</strong> — Monthly product-level data from a Brazilian
          e-commerce platform. Each row captures demand (<code>qty</code>), pricing (<code>unit_price</code>),
          shipping cost (<code>freight_price</code>), competitor prices (<code>comp_1/2/3</code>),
          historical price (<code>lag_price</code>), and time features (<code>month</code>, <code>weekday/weekend/holiday</code>).
          The RL agent uses these to learn state-dependent pricing strategies.
        </Typography>
      </div>

      {/* Chart filter */}
      <div className="flex items-end" style={{ gap: '16px', marginBottom: '16px' }}>
        {productFilterUI(chartProduct, setChartProduct, 'Filter Charts by Product')}
        {chartProduct !== 'all' && (
          <Badge variant="primary">{chartRows.length} rows</Badge>
        )}
      </div>

      {/* Charts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '24px',
          marginBottom: '48px',
        }}
      >
        {priceDistribution.length > 0 && (
          <BarChart
            data={priceDistribution}
            xAxisKey="range"
            yAxisKey="count"
            title={`Price Distribution${chartProduct !== 'all' ? ` — ${chartProduct}` : ''}`}
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
            series={[{ dataKey: 'avgPrice', color: getSeriesColor(0), strokeWidth: 2, dot: false }]}
            title={`Avg Price Over Time${chartProduct !== 'all' ? ` — ${chartProduct}` : ''}`}
            xAxisLabel="Date"
            yAxisLabel="Avg Price ($)"
          />
        )}
      </div>

      {/* Table filter + Data Table */}
      <div className="flex items-end justify-between" style={{ marginBottom: '16px' }}>
        {productFilterUI(tableProduct, setTableProduct, 'Filter Table by Product')}
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
          Showing {tableRows.length.toLocaleString()} rows
        </Typography>
      </div>
      <Table table={table} showPagination />
    </div>
  );
}
