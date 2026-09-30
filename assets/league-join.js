(() => {
  const button=document.querySelector('[data-request-access]'),message=document.querySelector('[data-message]');
  button.addEventListener('click',async()=>{
    button.disabled=true;message.textContent='';
    const csrf=decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1]||'');
    try{
      const response=await fetch('/api/leagues/'+encodeURIComponent(button.dataset.league)+'/join',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-franchisehq-csrf':csrf},body:'{}'});
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'The request could not be completed.');location.reload();
    }catch(error){message.textContent=error.message;button.disabled=false;}
  });
})();
