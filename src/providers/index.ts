import type { PriceProvider, ProviderId, SearchRequest, SearchResult } from '../types';
import { demoProvider } from './demoProvider';
import { externalJsonProvider } from './externalJsonProvider';

const providers = new Map<ProviderId, PriceProvider>([
  ['demo', demoProvider],
  ['external', externalJsonProvider],
]);
const cache = new Map<string, { expiresAt: number; result: SearchResult | null }>();
const CACHE_MS = Number(process.env.PRICE_CACHE_MS ?? 10 * 60 * 1000);

export function getDefaultProviderId(): ProviderId {
  return process.env.PRICE_PROVIDER === 'external' ? 'external' : 'demo';
}

export function getProvider(id: ProviderId): PriceProvider {
  return providers.get(id) ?? demoProvider;
}

export async function searchWithProvider(id: ProviderId, request: SearchRequest): Promise<SearchResult | null> {
  const provider = getProvider(id);
  if (!provider.isConfigured()) throw new Error(`${provider.label} 설정이 필요합니다.`);
  const key = JSON.stringify([id, request.keyword.trim().toLowerCase(), request.requiredTerms, request.excludedTerms]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const result = await provider.search(request);
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, result });
  return result;
}

export function getProviderStatus() {
  const activeId = getDefaultProviderId();
  const provider = getProvider(activeId);
  return {
    id: activeId,
    label: provider.label,
    configured: provider.isConfigured(),
    demo: activeId === 'demo',
    cacheMinutes: Math.round(CACHE_MS / 60_000),
  };
}
