import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import type { PriceHistory, ProviderId, WatchItem } from '../types';

const DB_PATH = path.join(process.cwd(), 'data', 'alert.db');
let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = getDb().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some(item => item.name === column)) {
    getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS watch_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword          TEXT    NOT NULL,
      target_price     INTEGER NOT NULL,
      email            TEXT    NOT NULL,
      required_terms   TEXT    NOT NULL DEFAULT '[]',
      excluded_terms   TEXT    NOT NULL DEFAULT '[]',
      provider         TEXT    NOT NULL DEFAULT 'demo',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      last_checked_at  TEXT,
      last_notified_at TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_item_id INTEGER NOT NULL REFERENCES watch_items(id),
      price         INTEGER NOT NULL,
      seller        TEXT    NOT NULL,
      product_url   TEXT    NOT NULL,
      checked_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_item
      ON price_history(watch_item_id, checked_at DESC);
  `);

  addColumnIfMissing('watch_items', 'required_terms', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing('watch_items', 'excluded_terms', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing('watch_items', 'provider', "TEXT NOT NULL DEFAULT 'demo'");
}

export function addWatchItem(input: {
  keyword: string;
  requiredTerms?: string[];
  excludedTerms?: string[];
  targetPrice: number;
  email: string;
  provider: ProviderId;
}): WatchItem {
  const result = getDb().prepare(`
    INSERT INTO watch_items
      (keyword, required_terms, excluded_terms, target_price, email, provider)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.keyword,
    JSON.stringify(input.requiredTerms ?? []),
    JSON.stringify(input.excludedTerms ?? []),
    input.targetPrice,
    input.email,
    input.provider,
  );
  return getWatchItemById(result.lastInsertRowid as number)!;
}

export function getWatchItemById(id: number): WatchItem | null {
  const row = getDb().prepare('SELECT * FROM watch_items WHERE id = ?').get(id) as any;
  return row ? mapWatchItem(row) : null;
}

export function getAllActiveWatchItems(): WatchItem[] {
  return (getDb().prepare(
    'SELECT * FROM watch_items WHERE is_active = 1 ORDER BY id'
  ).all() as any[]).map(mapWatchItem);
}

export function updateLastChecked(id: number): void {
  getDb().prepare(`UPDATE watch_items SET last_checked_at = datetime('now','localtime') WHERE id = ?`).run(id);
}

export function updateLastNotified(id: number): void {
  getDb().prepare(`UPDATE watch_items SET last_notified_at = datetime('now','localtime') WHERE id = ?`).run(id);
}

export function deactivateWatchItem(id: number): void {
  getDb().prepare('UPDATE watch_items SET is_active = 0 WHERE id = ?').run(id);
}

export function addPriceHistory(watchItemId: number, price: number, seller: string, productUrl: string): void {
  getDb().prepare(`
    INSERT INTO price_history (watch_item_id, price, seller, product_url)
    VALUES (?, ?, ?, ?)
  `).run(watchItemId, price, seller, productUrl);
}

export function getRecentHistory(watchItemId: number, limit = 10): PriceHistory[] {
  return (getDb().prepare(`
    SELECT * FROM price_history
    WHERE watch_item_id = ?
    ORDER BY checked_at DESC
    LIMIT ?
  `).all(watchItemId, limit) as any[]).map(row => ({
    id: row.id,
    watchItemId: row.watch_item_id,
    price: row.price,
    seller: row.seller,
    productUrl: row.product_url,
    checkedAt: row.checked_at,
  }));
}

function parseTerms(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapWatchItem(row: any): WatchItem {
  return {
    id: row.id,
    keyword: row.keyword,
    requiredTerms: parseTerms(row.required_terms),
    excludedTerms: parseTerms(row.excluded_terms),
    targetPrice: row.target_price,
    email: row.email,
    provider: row.provider === 'external' ? 'external' : 'demo',
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    lastNotifiedAt: row.last_notified_at,
    isActive: row.is_active === 1,
  };
}
