import type { PriceProvider, ProductOffer, SearchRequest, SearchResult } from '../types';

interface ExternalItem {
  id: string;
  name: string;
  price: number;
  seller: string;
  url: string;
  imageUrl?: string;
}

function matches(name: string, request: SearchRequest): boolean {
  const normalized = name.toLowerCase();
  return request.requiredTerms.every(term => normalized.includes(term.toLowerCase()))
    && !request.excludedTerms.some(term => normalized.includes(term.toLowerCase()));
}

export const externalJsonProvider: PriceProvider = {
  id: 'external',
  label: '공식 외부 API',
  isConfigured: () => Boolean(process.env.PRICE_API_URL && process.env.PRICE_API_KEY),
  async search(request): Promise<SearchResult | null> {
    const baseUrl = process.env.PRICE_API_URL;
    const apiKey = process.env.PRICE_API_KEY;
    if (!baseUrl || !apiKey) return null;

    const url = new URL(baseUrl);
    url.searchParams.set('q', request.keyword);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`외부 가격 API 오류: HTTP ${response.status}`);

    const data = await response.json() as { items?: ExternalItem[] };
    const offers: ProductOffer[] = (data.items ?? [])
      .filter(item => Number.isFinite(item.price) && item.price > 0 && matches(item.name, request))
      .map(item => ({
        productId: item.id,
        productName: item.name,
        price: item.price,
        seller: item.seller,
        productUrl: item.url,
        imageUrl: item.imageUrl,
        provider: 'external' as const,
      }))
      .sort((a, b) => a.price - b.price);

    if (offers.length === 0) return null;
    return {
      keyword: request.keyword,
      offers,
      lowestPrice: offers[0].price,
      lowestOffer: offers[0],
      provider: 'external',
      fetchedAt: new Date(),
    };
  },
};
