import { useCallback, useMemo, useState } from 'react';
import {
  Typography, Button, BarChart, Table, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  CHART_COLORS,
} from '@northslopetech/altitude-ui';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useCsvData } from '../hooks/useCsvData';
import type { DatasetName } from '../hooks/useCsvData';
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
  const { rows, products, categories, isLoaded, isLoading, error, datasetName, loadFromFile, loadSampleData, loadInventoryData } = useCsvData();
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
      const step = (entries.length - 1) / (maxPoints - 1);
      const sampled = [];
      for (let i = 0; i < maxPoints; i++) {
        sampled.push(entries[Math.round(i * step)]);
      }
      entries = sampled;
    }

    return entries.map(([date, { total, count }]) => ({
      date,
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
    const datasetCardStyle: React.CSSProperties = {
      border: '1px solid var(--color-subtle)',
      borderRadius: '8px',
      padding: '24px',
      backgroundColor: 'var(--color-base-white)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    };

    return (
      <div style={{ padding: '32px 0' }}>
        <Typography variant="heading-lg" style={{ marginBottom: '8px' }}>Data Explorer</Typography>
        <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '32px' }}>
          Choose a sample dataset to get started, or upload your own CSV.
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

        {/* Dataset cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}>
          {/* Retail Price — lightweight */}
          <div style={datasetCardStyle}>
            <div className="flex items-center justify-between">
              <Typography variant="heading-sm">Retail Price</Typography>
              <Badge variant="success">607 rows</Badge>
            </div>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', flex: 1 }}>
              Monthly product-level data from a Brazilian e-commerce platform.
              Covers demand, unit prices, freight costs, competitor pricing, and seasonal patterns.
              Loads instantly — great for a quick walkthrough.
            </Typography>
            <Button onClick={loadSampleData} disabled={isLoading} style={{ alignSelf: 'flex-start' }}>
              {isLoading && datasetName === 'retail_price' ? 'Loading...' : 'Load Retail Price'}
            </Button>
          </div>

          {/* Store Inventory — heavier */}
          <div style={datasetCardStyle}>
            <div className="flex items-center justify-between">
              <Typography variant="heading-sm">Store Inventory</Typography>
              <Badge variant="neutral">73K rows</Badge>
            </div>
            <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', flex: 1 }}>
              Daily store-product data across multiple regions with demand forecasts,
              inventory levels, competitor pricing, weather, and seasonality.
              Columns are automatically mapped to the RL format.
            </Typography>
            <Button onClick={loadInventoryData} disabled={isLoading} variant="outline" style={{ alignSelf: 'flex-start' }}>
              {isLoading && datasetName === 'store_inventory' ? 'Loading...' : 'Load Store Inventory'}
            </Button>
          </div>
        </div>

        {/* Custom upload */}
        <div
          style={{
            border: '2px dashed var(--color-subtle)',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
            backgroundColor: 'var(--color-gray)',
          }}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <Typography variant="body-md" style={{ marginBottom: '4px', fontWeight: 500 }}>
            Upload Your Own CSV
          </Typography>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Drag & drop a file here, or click below. You'll map columns to the RL fields after upload.
          </Typography>
          <Button variant="outline" onClick={() => document.getElementById('csv-upload')?.click()} disabled={isLoading}>
            Choose File
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
    );
  }

  return (
    <div style={{ padding: '32px 0' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <Typography variant="heading-lg">Data Explorer</Typography>
        <div className="flex items-center" style={{ gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '6px',
              border: '1px solid var(--color-subtle)',
              overflow: 'hidden',
            }}
          >
            {([
              { key: 'retail_price' as DatasetName, label: 'Retail Price' },
              { key: 'store_inventory' as DatasetName, label: 'Store Inventory' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  if (key === datasetName || isLoading) return;
                  if (key === 'retail_price') loadSampleData();
                  else loadInventoryData();
                }}
                disabled={isLoading}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: key === datasetName ? 'default' : 'pointer',
                  border: 'none',
                  backgroundColor: key === datasetName ? 'var(--color-interactive)' : 'var(--color-base-white)',
                  color: key === datasetName ? 'white' : 'var(--color-dark)',
                  transition: 'background-color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Badge variant="success">{rows.length.toLocaleString()} rows loaded</Badge>
        </div>
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
        {datasetName === 'store_inventory' ? (
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
            <strong>Retail Store Inventory Dataset</strong> — 73K rows of daily store-product-level data
            across multiple regions. Includes demand forecasts, inventory levels, competitor pricing,
            weather conditions, and seasonality. Columns are mapped to the RL agent's format
            (e.g. <code>Units Sold</code> → <code>qty</code>, <code>Price</code> → <code>unit_price</code>,
            <code>Competitor Pricing</code> → <code>comp_1</code>).
          </Typography>
        ) : (
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)' }}>
            <strong>Kaggle Retail Price Optimization</strong> — Monthly product-level data from a Brazilian
            e-commerce platform. Each row captures demand (<code>qty</code>), pricing (<code>unit_price</code>),
            shipping cost (<code>freight_price</code>), competitor prices (<code>comp_1/2/3</code>),
            historical price (<code>lag_price</code>), and time features (<code>month</code>, <code>weekday/weekend/holiday</code>).
            The RL agent uses these to learn state-dependent pricing strategies.
          </Typography>
        )}
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
          <div>
            <Typography variant="label-md-bold" style={{ marginBottom: '8px' }}>
              {`Avg Price Over Time${chartProduct !== 'all' ? ` — ${chartProduct}` : ''}`}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                  interval={Math.max(0, Math.ceil(priceTrends.length / 8) - 1)}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: 'var(--color-secondary)' }}
                  label={{ value: 'Avg Price ($)', angle: -90, position: 'insideLeft', offset: 4, fontSize: 12, fill: 'var(--color-secondary)' }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-base-white)',
                    borderColor: 'var(--color-subtle)',
                    color: 'var(--color-dark)',
                  }}
                  formatter={((value: number) => [`$${value.toFixed(2)}`, 'Avg Price']) as any}
                />
                <Line
                  type="monotone"
                  dataKey="avgPrice"
                  stroke={CHART_COLORS.PRIMARY}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
