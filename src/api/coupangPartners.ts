import crypto from 'crypto';
import type { ProductResult, SearchResult } from '../types';

const BASE_URL = 'https://api-gateway.coupang.com';
const SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

const RATE_LIMIT = {
  maxCalls: 9,
  windowMs: 60 * 60 * 1000,
  callTimestamps: [] as number[],
};

function canCallApi(): boolean {
  const now = Date.now();
  RATE_LIMIT.callTimestamps = RATE_LIMIT.callTimestamps.filter(
    t => now - t < RATE_LIMIT.windowMs
  );
  return RATE_LIMIT.callTimestamps.length < RATE_LIMIT.maxCalls;
}

function recordApiCall(): void {
  RATE_LIMIT.callTimestamps.push(Date.now());
}

function getRemainingCalls(): number {
  const now = Date.now();
  RATE_LIMIT.callTimestamps = RATE_LIMIT.callTimestamps.filter(
    t => now - t < RATE_LIMIT.windowMs
  );
  return RATE_LIMIT.maxCalls - RATE_LIMIT.callTimestamps.length;
}

function generateHmacSignature(
  secretKey: string,
  method: string,
  path: string,
  query: string,
  datetime: string
): string {
  const message = `${method}\n${path}\n${query}\n${datetime}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
}

export async function searchProductsByKeyword(
  keyword: string,
  limit = 10
): Promise<SearchResult | null> {
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!accessKey || !secretKey) {
      console.log('[PartnersAPI] API 키 미설정 → 스크래퍼 모드로 동작');
      return null;
  }

  if (!canCallApi()) {
    console.warn(`[PartnersAPI] 시간당 호출 한도 초과. 남은 호출: ${getRemainingCalls()}`);
    return null;
  }

  const datetime = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const queryParams = `keyword=${encodeURIComponent(keyword)}&limit=${limit}&subId=price-alert`;
  const signature = generateHmacSignature(secretKey, 'GET', SEARCH_PATH, queryParams, datetime);
  const url = `${BASE_URL}${SEARCH_PATH}?${queryParams}`;

  try {
    recordApiCall();
    const response = await fetch(url, {
      headers: {
        Authorization: `CEA algorithm=HmacSHA256, access-id=${accessKey}, signed-date=${datetime}, signature=${signature}`,
        'Content-Type': 'application/json;charset=UTF-8',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[PartnersAPI] HTTP ${response.status}: ${text}`);
      return null;
    }

    const data = await response.json() as any;
    return parseApiResponse(keyword, data);
  } catch (err) {
    console.error('[PartnersAPI] 요청 실패:', err);
    return null;
  }
}

function parseApiResponse(keyword: string, data: any): SearchResult | null {
  const items: any[] = data?.data?.productData ?? [];
  if (items.length === 0) return null;

  const products: ProductResult[] = items.map(item => ({
    productId: String(item.productId),
    productName: item.productName,
    price: item.productPrice,
    seller: item.vendor ?? '쿠팡',
    productUrl: item.productUrl,
    imageUrl: item.productImage,
    source: 'partners_api' as const,
  }));

  const sorted = [...products].sort((a, b) => a.price - b.price);
  const lowest = sorted[0];

  return {
    keyword,
    products: sorted,
    lowestPrice: lowest.price,
    lowestProduct: lowest,
    fetchedAt: new Date(),
  };
}

export function getApiRateLimitStatus() {
  return {
    remaining: getRemainingCalls(),
    used: RATE_LIMIT.callTimestamps.length,
    max: RATE_LIMIT.maxCalls,
  };
}