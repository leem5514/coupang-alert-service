import type { ScheduleTask, IntervalResult, SearchResult } from '../types';
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
const taskTimers = new Map<number, NodeJS.Timeout>();
let schedulerTimer: NodeJS.Timeout | null = null;
const USE_FALLBACK = process.env.USE_SCRAPER_FALLBACK !== 'false';

function calcInterval(currentPrice: number | null, targetPrice: number): IntervalResult {
  const API_MIN_MS = 6 * 60 * 1000;

  if (currentPrice === null) {
    return { intervalMs: API_MIN_MS, reason: '첫 조회' };
  }

  const diffPct = ((currentPrice - targetPrice) / targetPrice) * 100;
  if (diffPct > 20) return { intervalMs: 20 * 60 * 1000, reason: `목표가와 ${diffPct.toFixed(0)}% 차이` };
  if (diffPct > 10) return { intervalMs: 10 * 60 * 1000, reason: `목표가와 ${diffPct.toFixed(0)}% 차이` };
  if (diffPct > 5) return { intervalMs: API_MIN_MS, reason: `목표가와 ${diffPct.toFixed(0)}% 차이` };
  return { intervalMs: API_MIN_MS, reason: `목표가 ${diffPct.toFixed(0)}% 이내` };
}

async function fetchPrice(keyword: string, isCloseToTarget: boolean): Promise<SearchResult | null> {
  const apiStatus = getApiRateLimitStatus();
  if (apiStatus.remaining > 0) {
    const result = await searchProductsByKeyword(keyword);
    if (result) {
      console.log(`[API] "${keyword}" 최저가 ${result.lowestPrice.toLocaleString()}원`);
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
  if (!tasks.has(task.watchItemId)) return;

  const { watchItemId, keyword, targetPrice, currentPrice } = task;
  const diffPct = currentPrice
    ? ((currentPrice - targetPrice) / targetPrice) * 100
    : Infinity;
  const result = await fetchPrice(keyword, diffPct < 5);

  if (!tasks.has(watchItemId)) return;

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
    const item = getAllActiveWatchItems().find(candidate => candidate.id === watchItemId);
    if (item) {
      await sendPriceAlert(item, result);
      updateLastNotified(watchItemId);
      console.log(`[Alert] "${keyword}" 목표가 달성: ${result.lowestPrice.toLocaleString()}원`);
    }
  }

  const { intervalMs, reason } = calcInterval(result.lowestPrice, targetPrice);
  task.intervalMs = intervalMs;
  console.log(`[Scheduler] "${keyword}" 다음 확인: ${reason}`);
  scheduleNext(task);
}

function scheduleNext(task: ScheduleTask, delayMs = task.intervalMs): void {
  const previous = taskTimers.get(task.watchItemId);
  if (previous) clearTimeout(previous);

  task.nextCheckAt = new Date(Date.now() + delayMs);
  const timer = setTimeout(() => {
    taskTimers.delete(task.watchItemId);
    void runTask(task);
  }, delayMs);
  taskTimers.set(task.watchItemId, timer);
}

export function syncScheduler(): void {
  const activeItems = getAllActiveWatchItems();
  const activeIds = new Set(activeItems.map(item => item.id));

  for (const id of tasks.keys()) {
    if (!activeIds.has(id)) removeScheduledTask(id);
  }

  for (const item of activeItems) {
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
    const jitterMs = Math.max(1_000, tasks.size * 2_000);
    console.log(`[Scheduler] "${item.keyword}" 등록 (${jitterMs / 1000}초 후 첫 확인)`);
    scheduleNext(task, jitterMs);
  }
}

export function removeScheduledTask(watchItemId: number): void {
  const timer = taskTimers.get(watchItemId);
  if (timer) clearTimeout(timer);
  taskTimers.delete(watchItemId);
  tasks.delete(watchItemId);
}

export function startScheduler(): void {
  if (schedulerTimer) return;
  console.log('가격 확인 스케줄러 시작');
  syncScheduler();
  schedulerTimer = setInterval(syncScheduler, 60_000);
}

export function stopScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  for (const timer of taskTimers.values()) clearTimeout(timer);
  taskTimers.clear();
  tasks.clear();
  console.log('가격 확인 스케줄러 종료');
}

export function getTaskStatuses() {
  return [...tasks.values()].map(task => ({
    watchItemId: task.watchItemId,
    keyword: task.keyword,
    targetPrice: task.targetPrice,
    currentPrice: task.currentPrice,
    nextCheckAt: task.nextCheckAt,
    intervalMin: Math.round(task.intervalMs / 60000),
  }));
}
