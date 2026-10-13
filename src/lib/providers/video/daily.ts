import 'server-only'

/**
 * Daily.co video/voice provider (REST API). Rooms are private; access needs a
 * per-participant meeting token minted server-side only after the database
 * confirms the caller is a party to the appointment and inside the join window.
 * Recording is disabled. Env: DAILY_API_KEY.
 */
const API = 'https://api.daily.co/v1'

export function isVideoConfigured() {
  return Boolean(process.env.DAILY_API_KEY)
}

async function call<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

export interface RoomInfo {
  name: string
  url: string
}

export async function ensureRoom(opts: { name: string; notBefore: Date; expires: Date; audioOnly: boolean }): Promise<RoomInfo> {
  const existing = await call<{ name: string; url: string }>(`/rooms/${encodeURIComponent(opts.name)}`)
  if (existing.ok && existing.data.url) return { name: existing.data.name, url: existing.data.url }
  const created = await call<{ name: string; url: string; error?: string }>('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name: opts.name,
      privacy: 'private',
      properties: {
        nbf: Math.floor(opts.notBefore.getTime() / 1000),
        exp: Math.floor(opts.expires.getTime() / 1000),
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
        enable_knocking: false,
        enable_chat: false,
        enable_screenshare: !opts.audioOnly,
        start_video_off: opts.audioOnly,
        max_participants: 4,
        lang: 'ar',
      },
    }),
  })
  if (!created.ok) throw new Error(`Daily room creation failed (${created.status})`)
  return { name: created.data.name, url: created.data.url }
}

export async function meetingToken(opts: { room: string; userId: string; userName: string; isOwner: boolean; expires: Date; audioOnly: boolean }): Promise<string> {
  const res = await call<{ token: string }>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: opts.room,
        user_id: opts.userId,
        user_name: opts.userName,
        is_owner: opts.isOwner,
        exp: Math.floor(opts.expires.getTime() / 1000),
        start_video_off: opts.audioOnly,
        enable_recording: undefined,
      },
    }),
  })
  if (!res.ok || !res.data.token) throw new Error(`Daily token failed (${res.status})`)
  return res.data.token
}
