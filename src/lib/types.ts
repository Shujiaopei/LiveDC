/** 主播（直播间） */
export interface Streamer {
  id: number
  /** 真实房间号（短号已解析） */
  roomId: number
  /** 短房间号（与真实房间号不同时才有） */
  shortId: number | null
  name: string
  avatar: string | null
  /** 0 未开播 1 直播中 2 轮播 */
  liveStatus: number
  /** 直播间标题 */
  title: string
  /** 最近一次采集到的在线人数 */
  online: number
  /** 最近一次成功采集时间（epoch ms） */
  lastFetchedAt: number | null
  createdAt: number
}

/** 一个时间点上的在线人数 */
export interface SnapshotPoint {
  ts: number
  online: number
  /** 采集时刻的开播状态：0 未开播 1 直播中 2 轮播（!= 1 视为下播） */
  liveStatus: number
}

export interface SeriesStats {
  /** 区间内最后一点在线人数 */
  current: number
  peak: number
  avg: number
}

/** 对比图中的一条曲线 */
export interface HistorySeries {
  streamerId: number
  name: string
  avatar: string | null
  liveStatus: number
  online: number
  points: SnapshotPoint[]
  stats: SeriesStats
}

/** 管理页解析直播间的预览信息 */
export interface RoomPreview {
  roomId: number
  shortId: number | null
  name: string
  avatar: string | null
  liveStatus: number
  title: string
  online: number
  alreadyMonitored: boolean
}

/** 首页主播卡片（带迷你趋势） */
export interface StreamerWithSpark extends Streamer {
  spark: SnapshotPoint[]
}
