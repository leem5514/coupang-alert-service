import type { ScheduleTask, WatchItem, IntervalResult, SearchResult } from '../types';
import { searchProductsByKeyword, getApiRateLimitStatus } from '../api/coupangPartners';
import { scrapeSearchResults } from '../scraper/coupangScraper';
import { sendPriceAlert } from '../notifier/emailNotifier';
import {
  getAllActiveWatchItems,
  addPriceHistory,
  updateLastChecked,
  updateLastNotified,
} from '../db/database';

const tasks = new Map<number, ScheduleTask>();
let schedulerTimer: NodeJS.Timeout | null = null;
const USE_FALLBACK = process.env.USE_SCRAPER_FALLBACK !== 'false';

function calcInterval(
  currentPrice: number | null,
  targetPrice: number
): IntervalResult {
  const API_MIN_MS = 6 * 60 * 1000;

  if (currentPrice === null) {
    return { intervalMs: API_MIN_MS, reason: '첫 조회' };
  }

  const diffPct = ((currentPrice - targetPrice) / targetPrice) * 100;

  if (diffPct > 20) return { intervalMs: 20 * 60 * 1000, reason: `목표가와 ${diffPct.toFixed(0)}% 차이 → 20분` };
  if (diffPct > 10) return { intervalMs: 10 * 60 * 1000, reason: `목표가와 ${diffPct.toFixed(0)}% 차이 → 10분` };
  if (diffPct > 5)  return { intervalMs: API_MIN_MS,        reason: `목표가와 ${diffPct.toFixed(0)}% 차이 → 6분` };

  return { intervalMs: API_MIN_MS, reason: `목표가와 ${diffPct.toFixed(0)}% 이내 → 6분 + 스크래퍼 병행` };
}

async function fetchPrice(keyword: string, isCloseToTarget: boolean): Promise<SearchResult | null> {
  const apiStatus = getApiRateLimitStatus();
  if (apiStatus.remaining > 0) {
    const result = await searchProductsByKeyword(keyword);
    if (result) {
      console.log(`[API] "${keyword}" → 최저가 ${result.lowestPrice.toLocaleString()}원 (남은 API: ${apiStatus.remaining - 1}회)`);
      return result;
    }
  }

  if (USE_FALLBACK && (isCloseToTarget || apiStatus.remaining === 0)) {
    console.log(`[Fallback] "${keyword}" 스크래퍼 사용`);
    return scrapeSearchResults(keyword);
  }

  return null;
}

async function runTask(task: ScheduleTask): Promise<void> {
  const { watchItemId, keyword, targetPrice, currentPrice } = task;

  const diffPct = currentPrice
    ? ((currentPrice - targetPrice) / targetPrice) * 100
    : Infinity;
  const isClose = diffPct < 5;

  const result = await fetchPrice(keyword, isClose);

  if (!result) {
    task.consecutiveApiErrors++;
    task.intervalMs = Math.min(task.intervalMs * 2, 30 * 60 * 1000);
    scheduleNext(task);
    return;
  }

  task.consecutiveApiErrors = 0;
  task.currentPrice = result.lowestPrice;

  addPriceHistory(watchItemId, result.lowestPrice, result.lowestProduct.seller, result.lowestProduct.productUrl);
  updateLastChecked(watchItemId);

  if (result.lowestPrice <= targetPrice) {
    const items = getAllActiveWatchItems();
    const item = items.find(i => i.id === watchItemId);
    if (item) {
      await sendPriceAlert(item, result);
      updateLastNotified(watchItemId);
      console.log(`🎉 [Alert] "${keyword}" 목표가 달성! ${result.lowestPrice.toLocaleString()}원`);
    }
  }

  const { intervalMs, reason } = calcInterval(result.lowestPrice, targetPrice);
  task.intervalMs = intervalMs;
  console.log(`[Scheduler] "${keyword}" 다음 체크: ${reason}`);

  scheduleNext(task);
}

function scheduleNext(task: ScheduleTask): void {
  task.nextCheckAt = new Date(Date.now() + task.intervalMs);
  setTimeout(() => runTask(task), task.intervalMs);
}

export function startScheduler(): void {
  console.log('🚀 스케줄러 시작...');
  loadWatchItems();
  schedulerTimer = setInterval(loadWatchItems, 60_000);
}

function loadWatchItems(): void {
  const items = getAllActiveWatchItems();
  for (const item of items) {
    if (tasks.has(item.id)) continue;

    const task: ScheduleTask = {
      watchItemId: item.id,
      keyword: item.keyword,
      targetPrice: item.targetPrice,
      currentPrice: null,
      intervalMs: 6 * 60 * 1000,
      nextCheckAt: new Date(),
      consecutiveApiErrors: 0,
    };
    tasks.set(item.id, task);

    const jitterMs = tasks.size * 5000;
    console.log(`[Scheduler] "${item.keyword}" 등록 (${jitterMs / 1000}초 후 첫 체크)`);
    setTimeout(() => runTask(task), jitterMs);
  }
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  tasks.clear();
  console.log('스케줄러 종료');
}

export function getTaskStatuses() {
  return [...tasks.values()].map(t => ({
    keyword: t.keyword,
    targetPrice: t.targetPrice,
    currentPrice: t.currentPrice,
    nextCheckAt: t.nextCheckAt,
    intervalMin: Math.round(t.intervalMs / 60000),
  }));
}