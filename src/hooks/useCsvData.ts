import { createContext, useContext, useState, useCallback } from 'react';
import type { RetailRow, ProductSummary } from '../types/data';
import { parseCsv } from '../utils/csv-parser';
import { adaptInventoryRows } from '../utils/inventory-adapter';
import { mean } from '../utils/math';
import { splitTemporalData, type TrainTestSplit } from '../utils/data-split';
import Papa from 'papaparse';

export type DatasetName = 'retail_price' | 'store_inventory';

interface CsvDataState {
  rows: RetailRow[];
  products: ProductSummary[];
  categories: string[];
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  datasetName: DatasetName;
  trainTestSplit: TrainTestSplit | null;
  loadFromFile: (file: File) => Promise<void>;
  loadSampleData: () => Promise<void>;
  loadInventoryData: () => Promise<void>;
}

const defaultState: CsvDataState = {
  rows: [],
  products: [],
  categories: [],
  isLoaded: false,
  isLoading: false,
  error: null,
  datasetName: 'retail_price',
  trainTestSplit: null,
  loadFromFile: async () => {},
  loadSampleData: async () => {},
  loadInventoryData: async () => {},
};

export const CsvDataContext = createContext<CsvDataState>(defaultState);

export function useCsvData() {
  return useContext(CsvDataContext);
}

export function useCsvDataProvider(): CsvDataState {
  const [rows, setRows] = useState<RetailRow[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState<DatasetName>('retail_price');
  const [trainTestSplit, setTrainTestSplit] = useState<TrainTestSplit | null>(null);

  const processRows = useCallback((parsed: RetailRow[]) => {
    setRows(parsed);
    setTrainTestSplit(splitTemporalData(parsed));

    const productMap = new Map<string, RetailRow[]>();
    for (const row of parsed) {
      const id = row.product_id;
      if (!productMap.has(id)) productMap.set(id, []);
      productMap.get(id)!.push(row);
    }

    const summaries: ProductSummary[] = [];
    for (const [id, pRows] of productMap) {
      summaries.push({
        id,
        category: pRows[0].product_category_name,
        avgPrice: mean(pRows.map(r => r.unit_price)),
        avgQty: mean(pRows.map(r => r.qty)),
        rowCount: pRows.length,
      });
    }
    summaries.sort((a, b) => a.id.localeCompare(b.id));
    setProducts(summaries);

    const cats = [...new Set(parsed.map(r => r.product_category_name))].sort();
    setCategories(cats);
    setIsLoaded(true);
  }, []);

  const loadFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const parsed = await parseCsv(file);
      setDatasetName('retail_price');
      processRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV');
    } finally {
      setIsLoading(false);
    }
  }, [processRows]);

  const loadSampleData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}retail_price.csv`);
      const text = await response.text();
      const parsed = await parseCsv(text);
      setDatasetName('retail_price');
      processRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sample data');
    } finally {
      setIsLoading(false);
    }
  }, [processRows]);

  const loadInventoryData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}retail_store_inventory.csv`);
      const text = await response.text();
      const rawRows = await new Promise<Record<string, string>[]>((resolve, reject) => {
        Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          complete(results) { resolve(results.data); },
          error(err: Error) { reject(err); },
        });
      });
      const parsed = adaptInventoryRows(rawRows);
      setDatasetName('store_inventory');
      processRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  }, [processRows]);

  return { rows, products, categories, isLoaded, isLoading, error, datasetName, trainTestSplit, loadFromFile, loadSampleData, loadInventoryData };
}
