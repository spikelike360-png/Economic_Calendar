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
  selectedDate?: string; // YYYY-MM-DD — when set, overrides dateFilter to show that week
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
  changeLong: number;
  changeShort: number;
  changeNet: number;
  spread?: number;
  changeSpread?: number;
}

export interface COTHistoryPoint {
  date: string;
  net: number;         // NonCommercial net
  commercial?: number;
  nonRept?: number;
  close?: number;      // FX/asset close price
}

export interface COTContract {
  key: string;
  label: string;
  exchange: string;
  category: 'fx' | 'index' | 'rates' | 'energy' | 'metals' | 'ag' | 'crypto';
  reportDate: string;
  openInterest: number;
  changeOI: number;
  contractSize: string;
  nonCommercial: COTPosition;
  commercial: COTPosition;
  total: { long: number; short: number; changeLong: number; changeShort: number };
  nonReportable: COTPosition;
  pctOI: number[];      // 9 values: ncL, ncS, ncSpread, commL, commS, totL, totS, nrL, nrS
  traderCount: number[]; // 7 values: ncL, ncS, ncSpread, commL, commS, totL, totS
  totalTraders: number;
  history: COTHistoryPoint[];
}

export interface SeasonalityMonth {
  month: number;
  avgReturn: number;
  positiveYears: number;
  totalYears: number;
}

export interface CurrencySeasonality {
  currency: Currency;
  monthly: SeasonalityMonth[];
  yearsOfData: number;
}

export interface SeasonalityResponse {
  data: CurrencySeasonality[];
  fetchedAt: string;
  source: string;
  error?: string;
}

export interface EarningsEvent {
  symbol: string;
  name: string;
  date: string;           // "YYYY-MM-DD"
  time: 'pre-market' | 'after-hours' | 'unknown';
  fiscalQuarter: string;  // "Mar 2026"
  epsEstimate: string | null;
  epsActual: string | null;
  lastYearEPS: string | null;
  marketCap: string | null;
  marketCapValue: number; // parsed, for sorting
  exchange: 'NYSE' | 'NASDAQ' | 'OTHER';
  revenueActual: string | null;
  revenueEstimate: string | null;
}

export interface EarningsResponse {
  events: EarningsEvent[];
  fetchedAt: string;
  error?: string;
}

export interface COTResponse {
  contracts: COTContract[];
  fetchedAt: string;
  isStale: boolean;
  source: 'tradingster' | 'cache' | 'error';
  error?: string;
}

export interface VIXTermStructure {
  date: string;
  vix9d: number | null;
  vix: number | null;
  vix3m: number | null;
  vix6m: number | null;
  vvix: number | null;
}

export interface VIXHistoryPoint {
  date: string;
  close: number;
}

export interface UnusualOption {
  symbol: string;
  strike: number;
  type: 'call' | 'put';
  expiry: string;
  volume: number;
  openInterest: number;
  ratio: number;
  iv: number;
}

export interface OptionsChainSummary {
  symbol: string;
  price: number;
  expiryDate: string;
  callsVolume: number;
  putsVolume: number;
  callsOI: number;
  putsOI: number;
  pcVolume: number;
  pcOI: number;
  unusual: UnusualOption[];
}

export interface GEXStrike {
  strike: number;
  callGEX: number;   // dollar GEX from calls (positive)
  putGEX: number;    // dollar GEX from puts (negative)
  netGEX: number;
}

export interface GEXData {
  symbol: string;
  spot: number;
  netGEX: number;           // total dollar GEX across all strikes
  maxGEXStrike: number;     // strike with highest positive netGEX
  gammaFlip: number | null; // strike where netGEX crosses zero near spot
  strikes: GEXStrike[];     // filtered to ±10% of spot, sorted by strike
}

export interface GexbotMajors {
  timestamp: number;
  ticker: string;
  spot: number;
  mpos_vol: number;
  mpos_oi: number;
  mneg_vol: number;
  mneg_oi: number;
  zero_gamma: number;
  net_gex_vol: number;
  net_gex_oi: number;
}

export interface GexbotModelData {
  full: GexbotMajors | null;  // volume-weighted
  zero: GexbotMajors | null;  // OI-weighted
}

export interface GexbotIndex {
  ticker: string;
  label: string;
  classic: GexbotModelData;
  state:   GexbotModelData;
}

export interface GexbotStock {
  ticker: string;
  name: string;
  ndxWeight: number;
  classic: GexbotModelData;
}

export interface GexbotAggregateScore {
  weightedScore: number;   // -1 (all NEG GEX) → +1 (all POS GEX)
  negCount: number;
  posCount: number;
  dataCount: number;
}

export interface GexbotResponse {
  indices: GexbotIndex[];
  stocks: GexbotStock[];
  aggregate: GexbotAggregateScore;
  fetchedAt: string;
  error?: string;
}

export interface OptionsFlowResponse {
  vix: VIXTermStructure | null;
  vixHistory: VIXHistoryPoint[];
  chains: OptionsChainSummary[];
  gex: GEXData[];
  fetchedAt: string;
  error?: string;
}
