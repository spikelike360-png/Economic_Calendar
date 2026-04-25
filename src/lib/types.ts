export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD';
export type Impact = 'high' | 'medium' | 'low' | 'holiday' | 'none';
export type Trend = 'up' | 'down' | 'flat';
export type DateFilter =
  | 'past7'
  | 'today'
  | 'thisweek'
  | 'next7'
  | 'next30'
  | 'upcoming'
  | 'all';

export interface CalendarEvent {
  id: string;
  date: string;          // "2026-04-22" (ET)
  time: string;          // "8:30am" (ET) | "All Day" | "Tentative"
  timestamp: number;     // UTC ms for sorting
  currency: Currency;
  impact: Impact;
  title: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  isReleased: boolean;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  fetchedAt: string;
  isStale: boolean;
  source: 'json' | 'html' | 'mixed' | 'cache' | 'error';
  error?: string;
}

export interface MacroMetric {
  id: Currency;
  countryName: string;
  flag: string;
  interestRate: MacroValue;
  inflation: MacroValue;
  unemployment: MacroValue;
  gdpGrowth: MacroValue;
}

export interface MacroValue {
  value: string;
  period: string;
  trend: Trend;
  source: string;
  lastUpdated: string;
}

export interface CalendarFilters {
  currencies: Currency[];
  impacts: Impact[];
  dateFilter: DateFilter;
}

export interface MetricsResponse {
  metrics: MacroMetric[];
  fetchedAt: string;
  isStale: boolean;
  source: 'fred' | 'fallback' | 'error';
  error?: string;
}

export interface COTPosition {
  long: number;
  short: number;
  net: number;
  changeNet: number;
}

export interface COTHistoryPoint {
  date: string;
  net: number;
}

export interface COTContract {
  key: string;
  label: string;
  exchange: string;
  category: 'currency' | 'commodity';
  reportDate: string;
  openInterest: number;
  nonCommercial: COTPosition;
  commercial: COTPosition;
  nonReportable: COTPosition;
  history: COTHistoryPoint[];
}

export interface COTResponse {
  contracts: COTContract[];
  fetchedAt: string;
  isStale: boolean;
  source: 'cftc' | 'cache' | 'error';
  error?: string;
}
