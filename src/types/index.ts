export type ProviderId = 'demo' | 'external';

export interface WatchItem {
  id: number;
  keyword: string;
  requiredTerms: string[];
  excludedTerms: string[];
  targetPrice: number;
  email: string;
  provider: ProviderId;
  createdAt: string;
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
  isActive: boolean;
}

export interface ProductOffer {
  productId: string;
  productName: string;
  price: number;
  seller: string;
  productUrl: string;
  imageUrl?: string;
  provider: ProviderId;
}

export interface SearchResult {
  keyword: string;
  offers: ProductOffer[];
  lowestPrice: number;
  lowestOffer: ProductOffer;
  provider: ProviderId;
  fetchedAt: Date;
}

export interface SearchRequest {
  keyword: string;
  requiredTerms: string[];
  excludedTerms: string[];
}

export interface PriceProvider {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  search(request: SearchRequest): Promise<SearchResult | null>;
}

export interface PriceHistory {
  id: number;
  watchItemId: number;
  price: number;
  seller: string;
  productUrl: string;
  checkedAt: string;
}

export interface ScheduleTask {
  watchItemId: number;
  keyword: string;
  requiredTerms: string[];
  excludedTerms: string[];
  provider: ProviderId;
  targetPrice: number;
  currentPrice: number | null;
  intervalMs: number;
  nextCheckAt: Date;
  consecutiveErrors: number;
}

export interface IntervalResult {
  intervalMs: number;
  reason: string;
}
