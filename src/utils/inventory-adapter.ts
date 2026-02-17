import type { RetailRow } from '../types/data';

/**
 * Maps Store Inventory CSV columns → RetailRow format.
 *
 * Inventory columns:
 *   Date, Store ID, Product ID, Category, Region, Inventory Level,
 *   Units Sold, Units Ordered, Demand Forecast, Price, Discount,
 *   Weather Condition, Holiday/Promotion, Competitor Pricing, Seasonality
 */

const SEASON_MAP: Record<string, number> = {
  winter: 1,
  spring: 4,
  summer: 7,
  autumn: 10,
  fall: 10,
};

function parseDate(dateStr: string): { month: number; year: number; monthYear: string } {
  // Format: "2022-01-01"
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10) || 2022;
  const month = parseInt(parts[1], 10) || 1;
  return { month, year, monthYear: `${year}-${month}` };
}

export function adaptInventoryRows(raw: Record<string, string>[]): RetailRow[] {
  // Group by product to compute lag_price
  const byProduct = new Map<string, { raw: Record<string, string>; date: string }[]>();

  for (const row of raw) {
    const productId = row['Product ID'] ?? '';
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId)!.push({ raw: row, date: row['Date'] ?? '' });
  }

  const result: RetailRow[] = [];

  for (const [, entries] of byProduct) {
    // Sort by date within each product
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let prevPrice = 0;
    for (const { raw: row } of entries) {
      const price = parseFloat(row['Price'] ?? '0') || 0;
      const unitsSold = parseFloat(row['Units Sold'] ?? '0') || 0;
      const { month, year, monthYear } = parseDate(row['Date'] ?? '');
      const competitorPricing = parseFloat(row['Competitor Pricing'] ?? '0') || 0;
      const holiday = parseFloat(row['Holiday/Promotion'] ?? '0') || 0;
      const seasonStr = (row['Seasonality'] ?? '').toLowerCase();
      const seasonMonth = SEASON_MAP[seasonStr] ?? month;
      const inventoryLevel = parseFloat(row['Inventory Level'] ?? '0') || 0;
      const demandForecast = parseFloat(row['Demand Forecast'] ?? '0') || 0;
      const discount = parseFloat(row['Discount'] ?? '0') || 0;

      result.push({
        product_id: row['Product ID'] ?? '',
        product_category_name: row['Category'] ?? '',
        month_year: monthYear,
        qty: unitsSold,
        unit_price: price,
        freight_price: price * 0.35,
        total_price: price * unitsSold,
        comp_1: competitorPricing,
        comp_2: 0,
        comp_3: 0,
        lag_price: prevPrice > 0 ? prevPrice : price,
        month: seasonMonth,
        year,
        product_name_length: 0,
        product_description_length: 0,
        product_photos_qty: 0,
        product_weight_g: 0,
        product_score: 0,
        customers: 0,
        weekday: holiday ? 0 : 1,
        weekend: 0,
        holiday,
        s: 0,
        volume: 0,
        ps1: 0,
        ps2: 0,
        ps3: 0,
        fp1: 0,
        fp2: 0,
        fp3: 0,
        inventory_level: inventoryLevel,
        demand_forecast: demandForecast,
        discount,
      });

      prevPrice = price;
    }
  }

  return result;
}
