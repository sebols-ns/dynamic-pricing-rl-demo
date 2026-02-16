import { createContext, useContext, useState, useCallback } from 'react';
import type { RetailRow, ProductSummary } from '../types/data';
import { parseCsv } from '../utils/csv-parser';
import { mean } from '../utils/math';

interface CsvDataState {
  rows: RetailRow[];
  products: ProductSummary[];
  categories: string[];
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  loadFromFile: (file: File) => Promise<void>;
  loadSampleData: () => Promise<void>;
}

const defaultState: CsvDataState = {
  rows: [],
  products: [],
  categories: [],
  isLoaded: false,
  isLoading: false,
  error: null,
  loadFromFile: async () => {},
  loadSampleData: async () => {},
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

  const processRows = useCallback((parsed: RetailRow[]) => {
    setRows(parsed);

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
    summaries.sort((a, b) => b.rowCount - a.rowCount);
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
      const response = await fetch('/retail_price.csv');
      const text = await response.text();
      const parsed = await parseCsv(text);
      processRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sample data');
    } finally {
      setIsLoading(false);
    }
  }, [processRows]);

  return { rows, products, categories, isLoaded, isLoading, error, loadFromFile, loadSampleData };
}
