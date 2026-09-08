import { createTenantAuditContext, tenantAuditStatement } from './tenant-context.js';

export const LEAGUE_NEWS_RELEASE = '7.4.4.12';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const rows = async (db, sql, ...values) => (
  await db.prepare(sql).bind(...values).all()
).results || [];

function publicPost(row) {
  return {
    id:String(row.id),
    category:String(row.category || 'Commissioner'),
    title:String(row.title || ''),
    summary:String(row.summary || ''),
    body:String(row.body || ''),
    status:String(row.status || 'draft'),
    author:{id:String(row.author_user_id),displayName:String(row.author_name || 'Commissioner')},
    publishedAt:row.published_at || null,
    createdAt:row.created_at,
    updatedAt:row.updated_at
  };
}

export async function leagueNewsState({db, league, session, includeDrafts = false, limit = 100}) {
  const commissioner = session?.membership?.role === 'commissioner';
  const canSeeDrafts = includeDrafts && commissioner;
  const result = await rows(db, `SELECT post.*,user.display_name AS author_name
    FROM league_news_posts post
    INNER JOIN users user ON user.id=post.author_user_id
    WHERE post.league_id=? AND (post.status='published' OR ?=1)
    ORDER BY CASE WHEN post.status='published' THEN 0 ELSE 1 END,
      post.published_at DESC,post.created_at DESC LIMIT ?`, league.id, canSeeDrafts ? 1 : 0,
    Math.min(100, Math.max(1, Number(limit) || 25)));
  return {
    ok:true,
    release:LEAGUE_NEWS_RELEASE,
    league:{id:league.id,slug:league.slug,name:league.name},
    posts:result.map(publicPost)
  };
}

export async function executeLeagueNewsAction({db, league, session, request}, body = {}) {
  if (session?.membership?.role !== 'commissioner') {
    throw Object.assign(new Error('Commissioner access is required.'), {status:403});
  }
  const action=clean(body.action,40);
  const actorId=String(session.user.id);
  let postId=clean(body.postId,120);
  const statements=[];
  if(action==='create'){
    const title=clean(body.title,160),postBody=clean(body.body,12000);
    if(!title||!postBody)throw Object.assign(new Error('A title and story are required.'),{status:400});
    postId=`league_news_${crypto.randomUUID()}`;
    const status=body.publish===true?'published':'draft';
    statements.push(db.prepare(`INSERT INTO league_news_posts
      (id,league_id,category,title,summary,body,status,author_user_id,published_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(postId,league.id,clean(body.category,60)||'Commissioner',title,clean(body.summary,500),postBody,status,actorId,status));
  }else if(action==='update'){
    if(!postId)throw Object.assign(new Error('postId is required.'),{status:400});
    const current=await db.prepare(`SELECT status FROM league_news_posts WHERE id=? AND league_id=?`).bind(postId,league.id).first();
    if(!current)throw Object.assign(new Error('News post not found.'),{status:404});
    const title=clean(body.title,160),postBody=clean(body.body,12000);
    if(!title||!postBody)throw Object.assign(new Error('A title and story are required.'),{status:400});
    statements.push(db.prepare(`UPDATE league_news_posts SET category=?,title=?,summary=?,body=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=?`).bind(clean(body.category,60)||'Commissioner',title,clean(body.summary,500),postBody,postId,league.id));
  }else if(['publish','archive'].includes(action)){
    if(!postId)throw Object.assign(new Error('postId is required.'),{status:400});
    const next=action==='publish'?'published':'archived';
    statements.push(db.prepare(`UPDATE league_news_posts SET status=?,
      published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`).bind(next,next,postId,league.id));
  }else{
    throw Object.assign(new Error('Unknown News action.'),{status:400});
  }
  const audit=createTenantAuditContext({request},league,session,`league_news_${action}`);
  statements.push(tenantAuditStatement(db,audit,{resourceType:'league_news_post',resourceId:postId,
    detail:{action,published:action==='publish'||body.publish===true}}));
  const results=await db.batch(statements);
  if(Number(results?.[0]?.meta?.changes||0)!==1){
    throw Object.assign(new Error('The news post changed or was not found.'),{status:409});
  }
  return {...await leagueNewsState({db,league,session,includeDrafts:true}),action,postId};
}
