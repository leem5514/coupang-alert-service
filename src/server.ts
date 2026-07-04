import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { addWatchItem, deactivateWatchItem, getAllActiveWatchItems, getRecentHistory } from './db/database';
import { getTaskStatuses, removeScheduledTask, startScheduler, stopScheduler, syncScheduler } from './scheduler/dynamicScheduler';
import { getDefaultProviderId, getProviderStatus } from './providers';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('요청이 너무 큽니다.');
  }
  return JSON.parse(body || '{}') as Record<string, unknown>;
}

function parseTerms(value: unknown): string[] {
  return String(value ?? '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 10);
}

function dashboardData() {
  const statuses = new Map(getTaskStatuses().map(status => [status.watchItemId, status]));
  return {
    items: getAllActiveWatchItems().map(item => ({
      ...item, history: getRecentHistory(item.id, 12), schedule: statuses.get(item.id) ?? null,
    })),
    provider: getProviderStatus(),
    updatedAt: new Date().toISOString(),
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (req.method === 'GET' && pathname === '/api/dashboard') {
    json(res, 200, dashboardData()); return true;
  }
  if (req.method === 'POST' && pathname === '/api/watch-items') {
    const body = await readJson(req);
    const keyword = String(body.keyword ?? '').trim().replace(/^#/, '');
    const targetPrice = Number(body.targetPrice);
    const email = String(body.email ?? '').trim();
    if (keyword.length < 2 || keyword.length > 80) {
      json(res, 400, { message: '키워드는 2~80자로 입력해 주세요.' }); return true;
    }
    if (!Number.isInteger(targetPrice) || targetPrice <= 0 || targetPrice > 1_000_000_000) {
      json(res, 400, { message: '올바른 목표 가격을 입력해 주세요.' }); return true;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { message: '올바른 이메일 주소를 입력해 주세요.' }); return true;
    }
    const item = addWatchItem({
      keyword, targetPrice, email,
      requiredTerms: parseTerms(body.requiredTerms),
      excludedTerms: parseTerms(body.excludedTerms),
      provider: getDefaultProviderId(),
    });
    syncScheduler();
    json(res, 201, item);
    return true;
  }
  const match = pathname.match(/^\/api\/watch-items\/(\d+)$/);
  if (req.method === 'DELETE' && match) {
    const id = Number(match[1]);
    deactivateWatchItem(id); removeScheduledTask(id); json(res, 200, { ok: true }); return true;
  }
  return false;
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) { json(res, 403, { message: '허용되지 않은 경로입니다.' }); return; }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch { json(res, 404, { message: '페이지를 찾을 수 없습니다.' }); }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (!await handleApi(req, res, url.pathname)) json(res, 404, { message: 'API를 찾을 수 없습니다.' });
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    json(res, 500, { message: error instanceof Error ? error.message : '서버 오류가 발생했습니다.' });
  }
});

startScheduler();
server.listen(PORT, () => console.log(`최저가 레이더: http://localhost:${PORT}`));
function shutdown(): void { stopScheduler(); server.close(() => process.exit(0)); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
