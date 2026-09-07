/* FHQ_BUILD: 7.4.4.10 */
(() => {
  'use strict';
  const HQ=window.FranchiseHQ;
  const app=window.FGC_APP;
  if(!HQ?.api||!app)return;
  const state={status:'idle',error:null,posts:[]};
  const slug=()=>HQ.leagueTenant?.resolveRouteSlug?.()||location.pathname.match(/\/leagues\/([^/?#]+)/i)?.[1]||null;
  const ago=value=>{
    const time=Date.parse(value||'');if(!Number.isFinite(time))return'Published';
    const minutes=Math.max(0,Math.floor((Date.now()-time)/60000));
    if(minutes<1)return'Just now';if(minutes<60)return`${minutes}m ago`;
    const hours=Math.floor(minutes/60);if(hours<24)return`${hours}h ago`;
    return new Date(time).toLocaleDateString();
  };
  const mapPost=(post,index)=>({
    id:post.id,category:post.category||'Commissioner',mark:String(post.category||'News').slice(0,3).toUpperCase(),
    title:post.title,excerpt:post.summary||String(post.body||'').slice(0,220),body:post.body||'',
    author:post.author?.displayName||'Commissioner',time:ago(post.publishedAt||post.createdAt),
    read:`${Math.max(1,Math.ceil(String(post.body||'').split(/\s+/).length/220))} min read`,
    featured:index===0,serverBacked:true
  });
  async function load({rerender=true}={}){
    const league=slug();if(!league)return false;
    state.status='loading';
    app.newsArticles.splice(0,app.newsArticles.length);
    try{
      const payload=await HQ.api.get(`/api/leagues/${encodeURIComponent(league)}/news`);
      state.posts=(payload.posts||[]).map(mapPost);
      app.newsArticles.splice(0,app.newsArticles.length,...state.posts);
      state.status='ready';state.error=null;
      if(rerender&&String(location.hash||'').replace(/^#/,'').split('/')[0]==='news')app.renderRoute('news');
      window.dispatchEvent(new CustomEvent('franchisehq:news-updated',{detail:{count:state.posts.length}}));
      return true;
    }catch(error){state.status='error';state.error=error?.message||String(error);return false}
  }
  function composer(){
    app.openDetail(`<div class="modal-hero"><div><span class="eyebrow">League News Studio</span><h2>Publish league news</h2><p>This story becomes available on FranchiseHQ and through the global Discord news command.</p></div></div><form class="modal-body news-studio-form" data-news-studio-form><label class="field"><span>Category</span><input name="category" value="Commissioner" maxlength="60" required></label><label class="field"><span>Headline</span><input name="title" maxlength="160" required></label><label class="field"><span>Summary</span><textarea name="summary" maxlength="500" rows="3"></textarea></label><label class="field"><span>Story</span><textarea name="body" maxlength="12000" rows="9" required></textarea></label><div class="heading-actions"><button type="button" class="button button--ghost" data-close-detail>Cancel</button><button type="submit" class="button button--primary">Publish</button></div></form>`);
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-create-news]'))composer();
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-news-studio-form]');if(!form)return;
    event.preventDefault();
    const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Publishing…';
    try{
      const data=new FormData(form),league=slug();
      await HQ.api.post(`/api/leagues/${encodeURIComponent(league)}/news`,{
        action:'create',publish:true,category:data.get('category'),title:data.get('title'),summary:data.get('summary'),body:data.get('body')
      });
      app.closeDetail();await load({rerender:true});app.showToast('League news published.');
    }catch(error){app.showToast(error?.message||'League news could not be published.');button.disabled=false;button.textContent='Publish'}
  });
  HQ.defineService?.('news',{load,getState:()=>({...state,posts:[...state.posts]})},{replace:true});
  window.addEventListener('franchisehq:auth-changed',event=>{if(event.detail?.authenticated)load({rerender:true})});
  load({rerender:false});
})();
