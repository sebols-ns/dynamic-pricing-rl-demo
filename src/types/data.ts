export interface RetailRow {
  product_id: string;
  product_category_name: string;
  month_year: string;
  qty: number;
  total_price: number;
  freight_price: number;
  unit_price: number;
  product_name_length: number;
  product_description_length: number;
  product_photos_qty: number;
  product_weight_g: number;
  product_score: number;
  customers: number;
  weekday: number;
  weekend: number;
  holiday: number;
  month: number;
  year: number;
  s: number;
  volume: number;
  comp_1: number;
  comp_2: number;
  comp_3: number;
  ps1: number;
  ps2: number;
  ps3: number;
  fp1: number;
  fp2: number;
  fp3: number;
  lag_price: number;
  inventory_level: number;
  demand_forecast: number;
  discount: number;
}

export interface ProductSummary {
  id: string;
  category: string;
  avgPrice: number;
  avgQty: number;
  rowCount: number;
}
