import type { ScheduleTask } from '../types';
import { searchWithProvider } from '../providers';
import { sendPriceAlert } from '../notifier/emailNotifier';
import { addPriceHistory, getAllActiveWatchItems, updateLastChecked, updateLastNotified } from '../db/database';

const tasks = new Map<number, ScheduleTask>();
const timers = new Map<number, NodeJS.Timeout>();
let syncTimer: NodeJS.Timeout | null = null;
const COOLDOWN_MS = Number(process.env.NOTIFICATION_COOLDOWN_MS ?? 86_400_000);

function nextInterval(price: number, target: number): number {
  const gap = ((price - target) / target) * 100;
  if (gap > 20) return 21_600_000;
  if (gap > 10) return 10_800_000;
  if (gap > 3) return 3_600_000;
  return 1_800_000;
}

function canNotify(value: string | null): boolean {
  if (!value) return true;
  const time = new Date(value.replace(' ', 'T')).getTime();
  return !Number.isFinite(time) || Date.now() - time >= COOLDOWN_MS;
}

function schedule(task: ScheduleTask, delay = task.intervalMs): void {
  const oldTimer = timers.get(task.watchItemId);
  if (oldTimer) clearTimeout(oldTimer);
  task.nextCheckAt = new Date(Date.now() + delay);
  timers.set(task.watchItemId, setTimeout(() => void run(task), delay));
}

async function run(task: ScheduleTask): Promise<void> {
  if (!tasks.has(task.watchItemId)) return;
  try {
    const result = await searchWithProvider(task.provider, task);
    if (!result) throw new Error('조건과 일치하는 상품이 없습니다.');
    task.currentPrice = result.lowestPrice;
    task.consecutiveErrors = 0;
    addPriceHistory(task.watchItemId, result.lowestPrice, result.lowestOffer.seller, result.lowestOffer.productUrl);
    updateLastChecked(task.watchItemId);
    const item = getAllActiveWatchItems().find(value => value.id === task.watchItemId);
    if (item && result.provider !== 'demo' && result.lowestPrice <= task.targetPrice && canNotify(item.lastNotifiedAt)) {
      await sendPriceAlert(item, result);
      updateLastNotified(task.watchItemId);
    }
    task.intervalMs = nextInterval(result.lowestPrice, task.targetPrice);
  } catch (error) {
    task.consecutiveErrors += 1;
    task.intervalMs = Math.min(Math.max(task.intervalMs * 2, 3_600_000), 43_200_000);
    console.error(`[Scheduler] ${task.keyword}`, error);
  }
  if (tasks.has(task.watchItemId)) schedule(task);
}

export function syncScheduler(): void {
  const items = getAllActiveWatchItems();
  const activeIds = new Set(items.map(item => item.id));
  for (const id of tasks.keys()) if (!activeIds.has(id)) removeScheduledTask(id);
  for (const item of items) {
    if (tasks.has(item.id)) continue;
    const task: ScheduleTask = {
      watchItemId: item.id, keyword: item.keyword, requiredTerms: item.requiredTerms,
      excludedTerms: item.excludedTerms, provider: item.provider, targetPrice: item.targetPrice,
      currentPrice: null, intervalMs: 3_600_000, nextCheckAt: new Date(), consecutiveErrors: 0,
    };
    tasks.set(item.id, task);
    schedule(task, Math.max(1_000, tasks.size * 2_000));
  }
}

export function removeScheduledTask(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  tasks.delete(id);
}

export function startScheduler(): void {
  if (syncTimer) return;
  syncScheduler();
  syncTimer = setInterval(syncScheduler, 60_000);
}

export function stopScheduler(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  tasks.clear();
}

export function getTaskStatuses() {
  return [...tasks.values()].map(task => ({
    watchItemId: task.watchItemId, keyword: task.keyword, targetPrice: task.targetPrice,
    currentPrice: task.currentPrice, provider: task.provider, nextCheckAt: task.nextCheckAt,
    intervalMin: Math.round(task.intervalMs / 60_000), errors: task.consecutiveErrors,
  }));
}
