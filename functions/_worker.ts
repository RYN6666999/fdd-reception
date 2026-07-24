import { handleIssue } from './api/token/issue'
import { handleOpen } from './api/token/open'
import { handleConfirm } from './api/token/confirm'
import { handleDestroy } from './api/token/destroy'
import { handleSubmit } from './api/token/submit'
import { handleCvv } from './api/token/cvv'
import { handleGetCard } from './api/token/card'
import { handleOperatorHistory } from './api/operator/history'
import { handleRedirect } from './api/token/redirect'
import { handlePhotoUpload } from './api/token/photo'
import {
  handleRelayAdminStatus,
  handleRelayChat,
  handleRelayEvents,
  handleRelayHealth,
  handleRelayOptions,
} from './api/relay'
import { handleExpireTokens } from './cron/expire-tokens'
import { handleCleanupSensitive } from './cron/cleanup-sensitive'
import { handleRelayTunnelProbe } from './cron/relay-tunnel-probe'
import type { Env } from './types/env'

export { SessionRoom } from './durable-objects/session-room'

const STARTED_AT_MS = Date.now()

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method
    const host = url.hostname

    if (method === 'GET' && path === '/' && (host.startsWith('aris.') || host.startsWith('aris-live.'))) {
      return new Response(
        `<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Aris Relay</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#0d0d0d;color:#e0e0e0;height:100vh;display:flex;flex-direction:column}
#h{padding:12px 16px;background:#1a1a2e;border-bottom:1px solid #333;display:flex;align-items:center;gap:10px}
#h h1{font-size:18px;color:#c084fc}
#s{font-size:11px;color:#888;margin-left:auto}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}.dot.g{background:#4ade80}
#m{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:85%;padding:10px 14px;border-radius:12px;line-height:1.5;font-size:15px;white-space:pre-wrap;word-wrap:break-word}
.msg.u{align-self:flex-end;background:#2d1b69;color:#e0e0ff;border-bottom-right-radius:4px}
.msg.a{align-self:flex-start;background:#1e1e2e;color:#cdd6f4;border-bottom-left-radius:4px;border:1px solid #2a2a3a}
.msg.a .n{font-size:11px;color:#c084fc;margin-bottom:4px;font-weight:500}
.t{font-size:10px;color:#666;margin-top:4px;text-align:right}
#b{padding:12px 16px;background:#1a1a1a;border-top:1px solid #333;display:flex;gap:8px}
#b input{flex:1;padding:12px 16px;border:1px solid #333;border-radius:24px;background:#1e1e1e;color:#e0e0e0;font-size:15px;outline:none}
#b input:focus{border-color:#c084fc}
#b button{width:44px;height:44px;border-radius:50%;border:none;background:#c084fc;color:#fff;font-size:20px;cursor:pointer}
#b button:disabled{opacity:0.4}
.tp{align-self:flex-start;color:#666;font-size:13px;padding:8px 14px;font-style:italic;display:none}
</style></head><body>
<div id=h><h1>Aris Relay</h1><div id=s><span class="dot g"></span>Online</div></div>
<div id=m><div class="msg a"><div class=n>Aris</div>Worker Relay 已啟動。</div></div>
<div class=tp id=tp>Aris 正在輸入…</div>
<div id=b><input id=in placeholder="跟 Aris 說點什麼…" autofocus><button id=btn onclick=sendMsg()>➤</button></div>
<script>
const I=(id)=>document.getElementById(id),i=I('in'),M=I('m'),T=I('tp'),B=I('btn');
function addMsg(role,text){const d=document.createElement('div');d.className='msg '+role;
const t=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
if(role==='a')d.innerHTML='<div class=n>Aris</div>'+text.replace(/\\n/g,'<br>')+'<div class=t>'+t+'</div>';
else d.innerHTML=text.replace(/\\n/g,'<br>')+'<div class=t>'+t+'</div>';
M.appendChild(d);M.scrollTop=M.scrollHeight}
async function sendMsg(){const text=i.value.trim();if(!text)return;i.value='';addMsg('u',text);T.style.display='block';B.disabled=true;
try{const r=await fetch('/c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,conv:'web',uid:'ryan'})});
const d=await r.json();T.style.display='none';B.disabled=false;addMsg('a',d.reply||'(靜默)');}
catch{T.style.display='none';B.disabled=false;addMsg('a','(連線中斷)')}}
i.addEventListener('keydown',e=>{if(e.key==='Enter')sendMsg()});
</script></body></html>`,
        {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // POST /api/token/issue
    if (method === 'POST' && path === '/api/token/issue') return handleIssue(request, env)

    // Token ID routes
    const tokenMatch = path.match(/^\/api\/token\/([^/]+)\/(\w+)$/)
    if (tokenMatch) {
      const [, tokenId, action] = tokenMatch
      if (method === 'POST' && action === 'open') return handleOpen(request, env, tokenId!)
      if (method === 'POST' && action === 'confirm') return handleConfirm(request, env, tokenId!)
      if (method === 'DELETE' && action === 'destroy') return handleDestroy(request, env, tokenId!)
      if (method === 'POST' && action === 'submit') return handleSubmit(request, env, tokenId!)
      if (method === 'POST' && action === 'cvv') return handleCvv(request, env, tokenId!)
      if (method === 'GET' && action === 'card') return handleGetCard(request, env, tokenId!)
      if (method === 'POST' && action === 'photo') return handlePhotoUpload(request, env, tokenId!)
    }

    // GET /c/:shortCode → redirect to client
    const shortMatch = path.match(/^\/c\/([A-Za-z0-9]+)$/)
    if (shortMatch && method === 'GET') return handleRedirect(request, env, shortMatch[1]!)

    // GET /api/operator/history
    if (method === 'GET' && path === '/api/operator/history') return handleOperatorHistory(request, env)

    // Relay endpoints
    if (method === 'OPTIONS' && (path === '/c' || path === '/health' || path === '/admin/status' || path.startsWith('/events/'))) {
      return handleRelayOptions()
    }
    if (method === 'POST' && path === '/c') return handleRelayChat(request, env)
    if (method === 'GET' && path === '/health') return handleRelayHealth(STARTED_AT_MS)
    if (method === 'GET' && path === '/admin/status') return handleRelayAdminStatus(env, STARTED_AT_MS)
    const eventsMatch = path.match(/^\/events\/([^/]+)$/)
    if (eventsMatch && method === 'GET') return handleRelayEvents(env, decodeURIComponent(eventsMatch[1]!))


    // WebSocket: GET /api/session/:id/ws → proxy to Durable Object
    const sessionMatch = path.match(/^\/api\/session\/([^/]+)\/ws$/)
    if (sessionMatch && method === 'GET') {
      const [, sessionId] = sessionMatch
      const roomId = env.SESSION_ROOM.idFromName(sessionId!)
      const room = env.SESSION_ROOM.get(roomId)
      return room.fetch(request)
    }

    // Pass-through 給靜態資產（client/, operator/, admin/, /c/ 等）
    return env.ASSETS.fetch(request)
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '* * * * *') ctx.waitUntil(handleExpireTokens(env))
    if (event.cron === '*/5 * * * *') ctx.waitUntil(handleRelayTunnelProbe(env))
    if (event.cron === '0 2 * * *') ctx.waitUntil(handleCleanupSensitive(env))
  }
}
