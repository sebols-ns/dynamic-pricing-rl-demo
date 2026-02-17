import { Typography, Badge } from '@northslopetech/altitude-ui';
import { useCsvData } from '../hooks/useCsvData';

interface DatasetSelectorProps {
  onSelected: () => void;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-subtle)',
  borderRadius: '12px',
  padding: '28px',
  backgroundColor: 'var(--color-base-white)',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

export function DatasetSelector({ onSelected }: DatasetSelectorProps) {
  const { loadSampleData, loadInventoryData, isLoading, datasetName, isLoaded } = useCsvData();

  const handleSelect = async (dataset: 'retail_price' | 'store_inventory') => {
    if (isLoading) return;
    if (dataset === 'retail_price') {
      await loadSampleData();
    } else {
      await loadInventoryData();
    }
    onSelected();
  };

  return (
    <div style={{ padding: '32px 0' }}>
      <Typography variant="heading-lg" style={{ marginBottom: '8px' }}>Choose a Dataset</Typography>
      <Typography variant="body-md" style={{ color: 'var(--color-secondary)', marginBottom: '32px' }}>
        Select a dataset to explore and train the pricing agent on.
      </Typography>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
      }}>
        {/* Retail Price */}
        <div
          onClick={() => handleSelect('retail_price')}
          style={{
            ...cardStyle,
            borderColor: isLoaded && datasetName === 'retail_price' ? 'var(--color-interactive)' : 'var(--color-subtle)',
            borderWidth: isLoaded && datasetName === 'retail_price' ? '2px' : '1px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-interactive)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = isLoaded && datasetName === 'retail_price' ? 'var(--color-interactive)' : 'var(--color-subtle)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <div className="flex items-center" style={{ gap: '10px', marginBottom: '12px' }}>
            <Typography variant="heading-sm">Retail Price</Typography>
            {isLoaded && datasetName === 'retail_price' && (
              <Badge variant="success">Loaded</Badge>
            )}
          </div>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Brazilian e-commerce dataset with detailed product attributes, competitor pricing, and customer metrics.
            Rich feature set ideal for learning price-demand relationships.
          </Typography>
          <div className="flex flex-wrap" style={{ gap: '6px', marginBottom: '12px' }}>
            <Badge variant="neutral">~480 rows</Badge>
            <Badge variant="neutral">30+ features</Badge>
            <Badge variant="neutral">5 products</Badge>
          </div>
          <div style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-info-subtle)',
            fontSize: '12px',
            color: 'var(--color-interactive)',
            fontWeight: 500,
          }}>
            Supports LGBM demand forecasting — train a gradient boosted model directly from data
          </div>
        </div>

        {/* Store Inventory */}
        <div
          onClick={() => handleSelect('store_inventory')}
          style={{
            ...cardStyle,
            borderColor: isLoaded && datasetName === 'store_inventory' ? 'var(--color-interactive)' : 'var(--color-subtle)',
            borderWidth: isLoaded && datasetName === 'store_inventory' ? '2px' : '1px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-interactive)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = isLoaded && datasetName === 'store_inventory' ? 'var(--color-interactive)' : 'var(--color-subtle)';
            e.currentTarget.style.transform = 'none';
          }}
        >
          <div className="flex items-center" style={{ gap: '10px', marginBottom: '12px' }}>
            <Typography variant="heading-sm">Store Inventory</Typography>
            {isLoaded && datasetName === 'store_inventory' && (
              <Badge variant="success">Loaded</Badge>
            )}
          </div>
          <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginBottom: '16px' }}>
            Large multi-store retail dataset with inventory levels, weather, seasonality, and a pre-computed demand forecast.
          </Typography>
          <div className="flex flex-wrap" style={{ gap: '6px', marginBottom: '12px' }}>
            <Badge variant="neutral">~73,100 rows</Badge>
            <Badge variant="neutral">15 features</Badge>
            <Badge variant="neutral">500 products</Badge>
          </div>
          <div style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-gray)',
            fontSize: '12px',
            color: 'var(--color-secondary)',
            fontWeight: 500,
          }}>
            Includes pre-computed demand forecast — uses elasticity model with dataset predictions
          </div>
        </div>
      </div>

      {isLoading && (
        <Typography variant="body-sm" style={{ color: 'var(--color-secondary)', marginTop: '16px' }}>
          Loading dataset...
        </Typography>
      )}
    </div>
  );
}
