import { chromium, type Browser, type Page } from 'playwright';
import type { SearchResult } from '../types';

const MIN_INTERVAL_MS = parseInt(process.env.SCRAPER_MIN_INTERVAL_MS ?? '600000');
const lastScraperCallAt: Map<string, number> = new Map();

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

function canScrape(keyword: string): boolean {
  const last = lastScraperCallAt.get(keyword) ?? 0;
  return Date.now() - last >= MIN_INTERVAL_MS;
}

export async function scrapeSearchResults(
  keyword: string
): Promise<SearchResult | null> {
  if (!canScrape(keyword)) {
    const remainMs = MIN_INTERVAL_MS - (Date.now() - (lastScraperCallAt.get(keyword) ?? 0));
    console.log(`[Scraper] "${keyword}" 쿨다운 중 (${Math.ceil(remainMs / 1000)}초 남음)`);
    return null;
  }

  lastScraperCallAt.set(keyword, Date.now());
  console.log(`[Scraper] "${keyword}" 스크래핑 시작...`);

  let page: Page | null = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.setExtraHTTPHeaders({
      'User-Agent': 'PriceAlertBot/1.0 (personal project; price monitoring)',
    });

    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&sorter=scoreDesc`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000 + Math.random() * 1500);

    const blocked = await page.$('[class*="captcha"], [class*="block"]');
    if (blocked) {
      console.warn('[Scraper] 쿠팡 봇 탐지 - 건너뜀');
      return null;
    }

    const products = await page.evaluate(() => {
      const items = document.querySelectorAll('li[class*="search-product"]');
      const results: any[] = [];

      items.forEach(item => {
        const nameEl = item.querySelector('[class*="name"]') as HTMLElement | null;
        const priceEl = item.querySelector('[class*="price-value"]') as HTMLElement | null;
        const linkEl = item.querySelector('a[href*="/vp/products/"]') as HTMLAnchorElement | null;
        const sellerEl = item.querySelector('[class*="seller"]') as HTMLElement | null;

        if (!nameEl || !priceEl || !linkEl) return;

        const priceText = priceEl.innerText.replace(/[^0-9]/g, '');
        const price = parseInt(priceText, 10);
        if (isNaN(price) || price === 0) return;

        results.push({
          productId: linkEl.href.match(/\/(\d+)\?/)?.[1] ?? '',
          productName: nameEl.innerText.trim(),
          price,
          seller: sellerEl?.innerText.trim() ?? '쿠팡',
          productUrl: linkEl.href,
          source: 'scraper',
        });
      });

      return results;
    });

    if (products.length === 0) {
      console.warn(`[Scraper] "${keyword}" 결과 없음`);
      return null;
    }

    const sorted = products.sort((a: any, b: any) => a.price - b.price);
    return {
      keyword,
      products: sorted,
      lowestPrice: sorted[0].price,
      lowestProduct: sorted[0],
      fetchedAt: new Date(),
    };
  } catch (err) {
    console.error(`[Scraper] "${keyword}" 오류:`, err);
    return null;
  } finally {
    await page?.close();
  }
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}