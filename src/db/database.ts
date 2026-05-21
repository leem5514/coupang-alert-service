import Database from 'better-sqlite3';
import path from 'path';
import type { WatchItem, PriceHistory } from '../types';

const DB_PATH = path.join(process.cwd(), 'data', 'alert.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const { mkdirSync } = require('fs');
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword         TEXT    NOT NULL,
      target_price    INTEGER NOT NULL,
      email           TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      last_checked_at TEXT,
      last_notified_at TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1
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
}

export function addWatchItem(
  keyword: string,
  targetPrice: number,
  email: string
): WatchItem {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO watch_items (keyword, target_price, email)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(keyword, targetPrice, email);
  return getWatchItemById(result.lastInsertRowid as number)!;
}

export function getWatchItemById(id: number): WatchItem | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM watch_items WHERE id = ?').get(id) as any;
  return row ? mapWatchItem(row) : null;
}

export function getAllActiveWatchItems(): WatchItem[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM watch_items WHERE is_active = 1 ORDER BY id'
  ).all() as any[];
  return rows.map(mapWatchItem);
}

export function updateLastChecked(id: number): void {
  getDb().prepare(`
    UPDATE watch_items SET last_checked_at = datetime('now','localtime') WHERE id = ?
  `).run(id);
}

export function updateLastNotified(id: number): void {
  getDb().prepare(`
    UPDATE watch_items SET last_notified_at = datetime('now','localtime') WHERE id = ?
  `).run(id);
}

export function deactivateWatchItem(id: number): void {
  getDb().prepare('UPDATE watch_items SET is_active = 0 WHERE id = ?').run(id);
}

export function addPriceHistory(
  watchItemId: number,
  price: number,
  seller: string,
  productUrl: string
): void {
  getDb().prepare(`
    INSERT INTO price_history (watch_item_id, price, seller, product_url)
    VALUES (?, ?, ?, ?)
  `).run(watchItemId, price, seller, productUrl);
}

export function getRecentHistory(
  watchItemId: number,
  limit = 10
): PriceHistory[] {
  const rows = getDb().prepare(`
    SELECT * FROM price_history
    WHERE watch_item_id = ?
    ORDER BY checked_at DESC
    LIMIT ?
  `).all(watchItemId, limit) as any[];
  return rows.map(r => ({
    id: r.id,
    watchItemId: r.watch_item_id,
    price: r.price,
    seller: r.seller,
    productUrl: r.product_url,
    checkedAt: r.checked_at,
  }));
}

export function getLowestEverPrice(watchItemId: number): number | null {
  const row = getDb().prepare(`
    SELECT MIN(price) AS min_price FROM price_history WHERE watch_item_id = ?
  `).get(watchItemId) as any;
  return row?.min_price ?? null;
}

function mapWatchItem(r: any): WatchItem {
  return {
    id: r.id,
    keyword: r.keyword,
    targetPrice: r.target_price,
    email: r.email,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
    lastNotifiedAt: r.last_notified_at,
    isActive: r.is_active === 1,
  };
}