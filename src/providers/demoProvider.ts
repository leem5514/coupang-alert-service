import type { PriceProvider, ProductOffer, SearchRequest, SearchResult } from '../types';

function hash(text: string): number {
  return [...text].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function matches(name: string, request: SearchRequest): boolean {
  const normalized = name.toLowerCase();
  const hasRequired = request.requiredTerms.every(term => normalized.includes(term.toLowerCase()));
  const hasExcluded = request.excludedTerms.some(term => normalized.includes(term.toLowerCase()));
  return hasRequired && !hasExcluded;
}

export const demoProvider: PriceProvider = {
  id: 'demo',
  label: '데모 데이터',
  isConfigured: () => true,
  async search(request): Promise<SearchResult | null> {
    const seed = hash(request.keyword);
    const hourWave = Math.sin(Date.now() / 3_600_000) * 0.025;
    const basePrice = 80_000 + (seed % 920_000);
    const sellers = ['스토어 A', '스토어 B', '스토어 C', '스토어 D', '스토어 E'];
    const offers: ProductOffer[] = sellers.map((seller, index) => {
      const required = request.requiredTerms.join(' ');
      const variation = 1 + (index * 0.035) + hourWave;
      return {
        productId: `demo-${seed}-${index}`,
        productName: `${request.keyword} ${required}`.trim(),
        price: Math.max(1_000, Math.round((basePrice * variation) / 100) * 100),
        seller,
        productUrl: '#demo-result',
        provider: 'demo' as const,
      };
    }).filter(offer => matches(offer.productName, request));

    if (offers.length === 0) return null;
    offers.sort((a, b) => a.price - b.price);
    return {
      keyword: request.keyword,
      offers,
      lowestPrice: offers[0].price,
      lowestOffer: offers[0],
      provider: 'demo',
      fetchedAt: new Date(),
    };
  },
};
