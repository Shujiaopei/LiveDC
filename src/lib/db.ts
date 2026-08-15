import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import type { SnapshotPoint, Streamer } from "./types"

// dev 热重载时复用同一连接，避免反复创建句柄
const g = globalThis as unknown as { __liverDcDb?: Database.Database }
const dataDir = path.join(process.cwd(), "data")
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
const dbPath = process.env.DB_PATH ?? path.join(dataDir, "liver-dc.db")

interface StreamerRow {
  id: number
  room_id: number
  short_id: number | null
  name: string
  avatar: string | null
  live_status: number
  title: string
  online: number
  last_fetched_at: number | null
  created_at: number
}

function rowToStreamer(r: StreamerRow): Streamer {
  return {
    id: r.id,
    roomId: r.room_id,
    shortId: r.short_id,
    name: r.name,
    avatar: r.avatar,
    liveStatus: r.live_status,
    title: r.title,
    online: r.online,
    lastFetchedAt: r.last_fetched_at,
    createdAt: r.created_at,
  }
}

function createDb(): Database.Database {
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.exec(`
    CREATE TABLE IF NOT EXISTS streamers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL UNIQUE,
      short_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      live_status INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 0,
      last_fetched_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      streamer_id INTEGER NOT NULL REFERENCES streamers(id) ON DELETE CASCADE,
      online INTEGER NOT NULL,
      live_status INTEGER NOT NULL DEFAULT 1,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_streamer_ts ON snapshots (streamer_id, ts);
  `)
  // 旧库迁移：补充采集时刻的开播状态列（旧数据按默认 1 直播中处理）。
  // 旧数据里 online=0 的点几乎都是下播时段被强制置 0 产生的，
  // 按启发式回标为下播，避免其计入区间统计。
  // 构建期多个 worker 并发打开同一 DB 文件，检查与 ALTER 之间存在竞态：
  // duplicate column 说明其他进程已加过列（也执行了回标），忽略即可
  const cols = db.prepare(`PRAGMA table_info(snapshots)`).all() as { name: string }[]
  const schemaVersion = db.pragma("user_version", { simple: true }) as number
  if (schemaVersion < 1) {
    if (!cols.some((c) => c.name === "live_status")) {
      try {
        db.exec(`ALTER TABLE snapshots ADD COLUMN live_status INTEGER NOT NULL DEFAULT 1`)
      } catch (err) {
        const isDup = err instanceof Error && err.message.includes("duplicate column")
        if (!isDup) throw err
      }
    }
    // 历史脏数据归一化：当前采集语义是“未开播一律记 0”。
    // 早期版本曾把下播时接口返回的“看过人数”也写入 online，
    // 这些点会在图表上留下突兀的离线小凸起，统一清为 0。
    db.exec(`
      UPDATE snapshots SET live_status = 0 WHERE live_status = 1 AND online = 0;
      UPDATE snapshots SET online = 0 WHERE live_status != 1 AND online != 0;
    `)
    db.pragma("user_version = 1")
  }
  return db
}

export const db = g.__liverDcDb ?? (g.__liverDcDb = createDb())

const LIST_SQL = `SELECT * FROM streamers ORDER BY id`

export function listStreamers(): Streamer[] {
  return (db.prepare(LIST_SQL).all() as StreamerRow[]).map(rowToStreamer)
}

export function getStreamer(id: number): Streamer | null {
  const row = db.prepare(`SELECT * FROM streamers WHERE id = ?`).get(id) as StreamerRow | undefined
  return row ? rowToStreamer(row) : null
}

export function getStreamerByRoomId(roomId: number): Streamer | null {
  const row = db.prepare(`SELECT * FROM streamers WHERE room_id = ?`).get(roomId) as StreamerRow | undefined
  return row ? rowToStreamer(row) : null
}

export function insertStreamer(s: {
  roomId: number
  shortId: number | null
  name: string
  avatar: string | null
  liveStatus: number
  title: string
  online: number
}): Streamer {
  const info = db
    .prepare(
      `INSERT INTO streamers (room_id, short_id, name, avatar, live_status, title, online, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(s.roomId, s.shortId, s.name, s.avatar, s.liveStatus, s.title, s.online, Date.now())
  return getStreamer(Number(info.lastInsertRowid))!
}

export function updateStreamerState(
  id: number,
  s: { name: string; avatar: string | null; liveStatus: number; title: string; online: number },
): void {
  db.prepare(
    `UPDATE streamers SET name = ?, avatar = ?, live_status = ?, title = ?, online = ?, last_fetched_at = ? WHERE id = ?`,
  ).run(s.name, s.avatar, s.liveStatus, s.title, s.online, Date.now(), id)
}

export function deleteStreamer(id: number): void {
  db.prepare(`DELETE FROM streamers WHERE id = ?`).run(id)
}

/** 两条采样点间隔过近时跳过写入，避免同一分钟内重复采样 */
const MIN_SNAPSHOT_GAP = 15_000

export function insertSnapshot(
  streamerId: number,
  online: number,
  liveStatus: number,
  ts: number,
): boolean {
  // 采样时间按分钟对齐：所有主播共用同一组时间刻度。
  // 各主播是串行抓取的，原始时间戳彼此错开几秒，而 ECharts 的 axis 吸附
  // 只收纳与吸附点距离相同的系列，错开的系列会丢 tooltip 和交点标记。
  const aligned = Math.floor(ts / 60_000) * 60_000
  const row = db
    .prepare(`SELECT ts FROM snapshots WHERE streamer_id = ? ORDER BY ts DESC LIMIT 1`)
    .get(streamerId) as { ts: number } | undefined
  if (row && aligned - row.ts < MIN_SNAPSHOT_GAP) return false
  db.prepare(
    `INSERT INTO snapshots (streamer_id, online, live_status, ts) VALUES (?, ?, ?, ?)`,
  ).run(streamerId, online, liveStatus, aligned)
  return true
}

export function getSnapshots(streamerId: number, from: number, to: number): SnapshotPoint[] {
  return db
    .prepare(
      `SELECT ts, online, live_status AS liveStatus FROM snapshots WHERE streamer_id = ? AND ts >= ? AND ts <= ? ORDER BY ts`,
    )
    .all(streamerId, from, to) as SnapshotPoint[]
}

export function getRecentPoints(streamerId: number, windowMs: number): SnapshotPoint[] {
  return getSnapshots(streamerId, Date.now() - windowMs, Date.now())
}

export function pruneSnapshots(cutoff: number): number {
  return db.prepare(`DELETE FROM snapshots WHERE ts < ?`).run(cutoff).changes
}
