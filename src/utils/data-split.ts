import type { RetailRow } from '../types/data';
import { compareMonthYear } from './math';

export interface TrainTestSplit {
  splitDate: string;       // first test month (e.g. "2023-3")
  trainDateRange: string;  // "2017-1 — 2023-2"
  testDateRange: string;   // "2023-3 — 2024-12"
  trainMonths: number;
  testMonths: number;
}

export function splitTemporalData(rows: RetailRow[], trainRatio = 0.75): TrainTestSplit {
  const uniqueDates = [...new Set(rows.map(r => r.month_year))].sort(compareMonthYear);
  const splitIndex = Math.floor(uniqueDates.length * trainRatio);

  const splitDate = uniqueDates[splitIndex];
  const trainDates = uniqueDates.slice(0, splitIndex);
  const testDates = uniqueDates.slice(splitIndex);

  return {
    splitDate,
    trainDateRange: `${trainDates[0]} — ${trainDates[trainDates.length - 1]}`,
    testDateRange: `${testDates[0]} — ${testDates[testDates.length - 1]}`,
    trainMonths: trainDates.length,
    testMonths: testDates.length,
  };
}

export function getTrainRows(rows: RetailRow[], splitDate: string): RetailRow[] {
  return rows.filter(r => compareMonthYear(r.month_year, splitDate) < 0);
}

export function getTestRows(rows: RetailRow[], splitDate: string): RetailRow[] {
  return rows.filter(r => compareMonthYear(r.month_year, splitDate) >= 0);
}
