// 찜한 키워드 정보
export interface WatchItem {
  id: number;
  keyword: string;    
  targetPrice: number;  
  email: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastNotifiedAt: string | null;
  isActive: boolean;
}

// 가격 조회 결과 (개별 상품)
export interface ProductResult {
  productId: string;
  productName: string;
  price: number;
  seller: string;
  productUrl: string;
  imageUrl?: string;
  source: 'partners_api' | 'scraper';
}

// 키워드 검색 결과
export interface SearchResult {
  keyword: string;
  products: ProductResult[];
  lowestPrice: number;
  lowestProduct: ProductResult;
  fetchedAt: Date;
}

// 가격 이력
export interface PriceHistory {
  id: number;
  watchItemId: number;
  price: number;
  seller: string;
  productUrl: string;
  checkedAt: string;
}

// 스케줄러가 관리하는 태스크
export interface ScheduleTask {
  watchItemId: number;
  keyword: string;
  targetPrice: number;
  currentPrice: number | null;
  intervalMs: number;
  nextCheckAt: Date;
  consecutiveApiErrors: number;
}

// 동적 주기 계산 결과
export interface IntervalResult {
  intervalMs: number;
  reason: string;
}