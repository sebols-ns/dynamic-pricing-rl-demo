import Papa from 'papaparse';
import type { RetailRow } from '../types/data';

const NUMERIC_FIELDS: (keyof RetailRow)[] = [
  'qty', 'total_price', 'freight_price', 'unit_price',
  'product_name_length', 'product_description_length', 'product_photos_qty',
  'product_weight_g', 'product_score', 'customers',
  'weekday', 'weekend', 'holiday', 'month', 'year', 's', 'volume',
  'comp_1', 'comp_2', 'comp_3', 'ps1', 'ps2', 'ps3',
  'fp1', 'fp2', 'fp3', 'lag_price',
  'inventory_level', 'demand_forecast',
];

export function parseCsv(input: string | File): Promise<RetailRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(input, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows: RetailRow[] = results.data.map((raw) => {
          const row: Record<string, unknown> = { ...raw };
          for (const field of NUMERIC_FIELDS) {
            row[field] = parseFloat(raw[field as string] ?? '0') || 0;
          }
          return row as unknown as RetailRow;
        });
        resolve(rows);
      },
      error(err: Error) {
        reject(err);
      },
    });
  });
}
