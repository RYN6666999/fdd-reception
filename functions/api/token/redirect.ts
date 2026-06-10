import type { Env } from '../../types/env'

export async function handleRedirect(request: Request, env: Env, shortCode: string): Promise<Response> {
  const token = await env.DB.prepare(
    `SELECT id, status FROM tokens WHERE short_code = ?`
  ).bind(shortCode).first()

  if (!token) return new Response('連結不存在', { status: 404 })
  if (token.status === 'expired' || token.status === 'destroyed') {
    return new Response('此連結已失效', { status: 410 })
  }

  return Response.redirect(`${env.BASE_URL}/client/?token=${token.id}`, 302)
}
