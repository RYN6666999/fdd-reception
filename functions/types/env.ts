export interface Env {
  DB: D1Database
  ARIS_API_URL?: string
  ENCRYPTION_KEY: string
  SESSION_ROOM: DurableObjectNamespace
  PHOTOS: R2Bucket
  AI: Ai
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}
