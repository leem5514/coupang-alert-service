import 'dotenv/config';
import readline from 'readline';
import { addWatchItem, getAllActiveWatchItems, deactivateWatchItem } from './db/database';
import { startScheduler, stopScheduler, getTaskStatuses } from './scheduler/dynamicScheduler';
import { getApiRateLimitStatus } from './api/coupangPartners';
import { closeBrowser } from './scraper/coupangScraper';

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🔔 쿠팡 가격 알림 서비스');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

startScheduler();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise(resolve => rl.question(q, resolve));

async function showMenu(): Promise<void> {
  console.log('\n┌─────────────────────────────────┐');
  console.log('│  1. 키워드 찜 추가              │');
  console.log('│  2. 찜 목록 보기                │');
  console.log('│  3. 찜 삭제                     │');
  console.log('│  4. 스케줄러 상태               │');
  console.log('│  5. API 상태                    │');
  console.log('│  q. 종료                        │');
  console.log('└─────────────────────────────────┘');

  const cmd = (await ask('명령어 입력: ')).trim();

  switch (cmd) {
    case '1': await addItem(); break;
    case '2': listItems(); break;
    case '3': await removeItem(); break;
    case '4': showSchedulerStatus(); break;
    case '5': showApiStatus(); break;
    case 'q': await shutdown(); return;
    default: console.log('올바른 명령어를 입력하세요.');
  }

  showMenu();
}

async function addItem(): Promise<void> {
  const keyword = (await ask('키워드 (예: 에어팟3): ')).trim();
  if (!keyword) { console.log('키워드를 입력하세요.'); return; }

  const priceStr = (await ask('목표가 (원, 숫자만): ')).trim();
  const targetPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
  if (isNaN(targetPrice) || targetPrice <= 0) { console.log('올바른 가격을 입력하세요.'); return; }

  const email = (await ask('알림 이메일: ')).trim();
  if (!email.includes('@')) { console.log('올바른 이메일을 입력하세요.'); return; }

  const item = addWatchItem(keyword, targetPrice, email);
  console.log(`\n✅ 등록 완료!`);
  console.log(`   키워드: ${item.keyword}`);
  console.log(`   목표가: ${item.targetPrice.toLocaleString()}원`);
  console.log(`   알림 → ${item.email}`);
}

function listItems(): void {
  const items = getAllActiveWatchItems();
  if (items.length === 0) {
    console.log('\n찜한 키워드가 없습니다.');
    return;
  }
  console.log(`\n찜 목록 (${items.length}개):`);
  items.forEach(item => {
    console.log(`  [${item.id}] "${item.keyword}" → 목표가 ${item.targetPrice.toLocaleString()}원 | ${item.email}`);
  });
}

async function removeItem(): Promise<void> {
  listItems();
  const idStr = (await ask('삭제할 ID: ')).trim();
  const id = parseInt(idStr, 10);
  if (isNaN(id)) { console.log('올바른 ID를 입력하세요.'); return; }
  deactivateWatchItem(id);
  console.log(`✅ ID ${id} 삭제 완료`);
}

function showSchedulerStatus(): void {
  const statuses = getTaskStatuses();
  if (statuses.length === 0) {
    console.log('\n실행 중인 태스크 없음');
    return;
  }
  console.log('\n스케줄러 상태:');
  statuses.forEach(s => {
    const nextMin = Math.ceil((s.nextCheckAt.getTime() - Date.now()) / 60000);
    console.log(
      `  "${s.keyword}" | 현재가: ${s.currentPrice?.toLocaleString() ?? '미조회'}원 | ` +
      `목표가: ${s.targetPrice.toLocaleString()}원 | ` +
      `다음 체크: ${nextMin}분 후 (${s.intervalMin}분 주기)`
    );
  });
}

function showApiStatus(): void {
  const status = getApiRateLimitStatus();
  console.log('\n파트너스 API 상태:');
  console.log(`  사용: ${status.used}/${status.max}회 (시간당)`);
  console.log(`  남은 호출: ${status.remaining}회`);
}

async function shutdown(): Promise<void> {
  console.log('\n종료 중...');
  stopScheduler();
  await closeBrowser();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

showMenu();