/** 哔哩哔哩直播公开接口封装（无需登录） */

export interface RoomLiveInfo {
  online: number
  liveStatus: number
  title: string
  name: string
  avatar: string | null
  /** 主播 uid（查询在线榜需要） */
  uid: number
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://live.bilibili.com/",
  Origin: "https://live.bilibili.com",
}

interface BiliResponse<T> {
  code: number
  message?: string
  msg?: string
  data?: T
}

async function biliGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`B站接口请求失败（HTTP ${res.status}）`)
  const json = (await res.json()) as BiliResponse<T>
  if (json.code !== 0) {
    throw new Error(`B站接口错误 ${json.code}：${json.message ?? json.msg ?? ""}`)
  }
  return json.data as T
}

/** 解析用户输入：直播间链接或纯数字房间号，返回房间号；无效返回 null */
export function parseRoomInput(input: string): number | null {
  const s = input.trim()
  if (/^\d{1,10}$/.test(s)) return Number(s)
  const m = s.match(/^(?:https?:\/\/)?live\.bilibili\.com\/(?:h5\/)?(\d{1,10})\/?$/)
  return m ? Number(m[1]) : null
}

/** 把（可能是短号的）房间号解析为真实房间号 */
export async function resolveRoomId(id: number): Promise<{
  roomId: number
  shortId: number | null
  liveStatus: number
}> {
  const data = await biliGet<{ room_id: number; short_id: number; live_status: number }>(
    `https://api.live.bilibili.com/room/v1/Room/room_init?id=${id}`,
  )
  if (!data.room_id) throw new Error("直播间不存在，请检查房间号")
  return {
    roomId: data.room_id,
    shortId: data.short_id && data.short_id !== data.room_id ? data.short_id : null,
    liveStatus: data.live_status,
  }
}

/**
 * 实时在线人数：在线榜总人数（data.count）。
 * 注意 room_info.online 对部分直播间返回的是“看过人数”，永远不使用。
 */
export async function getOnlineCount(roomId: number, uid: number): Promise<number> {
  const params = new URLSearchParams({
    ruid: String(uid),
    room_id: String(roomId),
    page: "1",
    page_size: "1",
    type: "online_rank",
    switch: "contribution_rank",
  })
  const data = await biliGet<{ count?: number | null }>(
    `https://api.live.bilibili.com/xlive/general-interface/v1/rank/queryContributionRank?${params.toString()}`,
  )
  // 接口偶发返回空对象/缺少 count 时视为失败，由采集层跳过本轮采样；
  // 不能把缺失字段当成 0 写入采样点，否则直播中的曲线会突然塌到 0。
  if (typeof data?.count === "number" && Number.isFinite(data.count)) {
    return Math.max(0, Math.round(data.count))
  }
  throw new Error("在线榜接口响应缺少 count 字段")
}

/** 获取直播间主播信息与实时在线人数，主播资料主接口失败时回退旧版接口 */
export async function getRoomInfo(roomId: number): Promise<RoomLiveInfo> {
  let info: RoomLiveInfo
  try {
    const data = await biliGet<{
      room_info: { title: string; live_status: number; uid: number }
      anchor_info: { base_info: { uname: string; face: string } }
    }>(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`)
    info = {
      online: 0,
      liveStatus: data.room_info.live_status,
      title: data.room_info.title ?? "",
      name: data.anchor_info.base_info.uname,
      avatar: data.anchor_info.base_info.face,
      uid: data.room_info.uid,
    }
  } catch {
    const basic = await biliGet<{ title: string; live_status: number; uid: number }>(
      `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`,
    )
    let name = ""
    let avatar: string | null = null
    try {
      const master = await biliGet<{ info: { uname: string; face: string } }>(
        `https://api.live.bilibili.com/live_user/v1/Master/info?uid=${basic.uid}`,
      )
      name = master.info.uname
      avatar = master.info.face
    } catch {
      // 头像与昵称获取失败不影响在线人数采集
    }
    info = {
      online: 0,
      liveStatus: basic.live_status,
      title: basic.title ?? "",
      name,
      avatar,
      uid: basic.uid,
    }
  }
  // 实时在线人数的唯一来源是在线榜 data.count；未开播记 0。
  // 在线榜失败时直接向上抛出，由采集层跳过本轮采样，绝不使用 room_info.online。
  if (info.liveStatus === 1) {
    info.online = await getOnlineCount(roomId, info.uid)
  }
  return info
}
