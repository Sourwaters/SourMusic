/* Local Streamer.bot connection; no data is sent to a remote server. */
// events: объект подписки Streamer.bot; null — не подписываться (док и оверлей), только проверить связь.
function sourmusicConnect({onStatus = () => {}, onReady = () => {}, onEvent = () => {}, events = {Twitch:['RewardRedemption','ChatMessage']}} = {}) {
  let socket, active = false, sequence = 0;
  const pending = new Map();
  let password = '';
  function request(request, args = {}) {
    if (!active) return Promise.reject(new Error('Нет подключения к Streamer.bot'));
    const id = 'sourmusic-' + (++sequence);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Нет ответа Streamer.bot')); }, 4000);
      pending.set(id, {resolve, reject, timeout});
      try { socket.send(JSON.stringify({...args, request, id})); }
      catch(error) {clearTimeout(timeout);pending.delete(id);reject(error);}
    });
  }
  async function hash(value) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
    return btoa(String.fromCharCode(...bytes));
  }
  function connect(index) {
    const port = [8080,8181][index];
    let ended = false, subscribed = false, helloSeen = false, subscribing = false;
    let handshake, legacy;
    onStatus('Подключение к Streamer.bot · ' + port);
    function retry() {
      if (ended) return;
      ended = true; active = false;
      clearTimeout(handshake);clearTimeout(legacy);
      if (socket) socket.close();
      for (const item of pending.values()) {clearTimeout(item.timeout);item.reject(new Error('Соединение закрыто'));}
      pending.clear();
      onStatus('Streamer.bot недоступен · повтор подключения');
      setTimeout(()=>connect(!subscribed && index === 0 ? 1 : 0), !subscribed && index === 0 ? 100 : 3000);
    }
    try {socket = new WebSocket('ws://127.0.0.1:' + port + '/');}
    catch {retry();return;}
    const current = socket;
    handshake = setTimeout(retry,6000);
    async function subscribe() {
      if(ended || subscribing)return;
      subscribing = true;active = true;
      try {
        if(events)await request('Subscribe',{events});
        else await request('GetGlobal',{variable:'sourmusic.nowPlaying',persisted:false});
        if(ended)return;
        subscribed = true;clearTimeout(handshake);
        onStatus('Streamer.bot подключён · ' + port);
        onReady();
      } catch {retry();}
    }
    current.onopen=()=>{legacy=setTimeout(()=>{if(!helloSeen)subscribe();},500);};
    current.onerror=retry;current.onclose=retry;
    current.onmessage=async ({data})=>{
      if(ended)return;
      let packet;try{packet=JSON.parse(data);}catch{return;}
      if(packet.request==='Hello') {
        helloSeen=true;clearTimeout(legacy);active=true;
        if(packet.authentication) {
          clearTimeout(handshake);
          if(!password)password=new URLSearchParams(location.hash.slice(1)).get('sbpw') || window.prompt('Пароль WebSocket Streamer.bot (хранится только до закрытия этой страницы):') || '';
          if(!password){onStatus('Для подключения нужен пароль Streamer.bot: добавьте #sbpw=ПАРОЛЬ к адресу страницы и обновите её.');ended=true;active=false;current.close();return;}
          try {
            const a=packet.authentication;
            await request('Authenticate',{authentication:await hash(await hash(password+a.salt)+a.challenge)});
          }catch{password='';retry();return;}
          if(ended)return;
          handshake=setTimeout(retry,6000);
        }
        subscribe();return;
      }
      const item=pending.get(packet.id);
      if(item){clearTimeout(item.timeout);pending.delete(packet.id);packet.status==='ok'?item.resolve(packet):item.reject(new Error(packet.error || 'Запрос отклонён'));return;}
      if(subscribed && packet.event)onEvent(packet);
    };
  }
  connect(0);
  return {request, isConnected:()=>active};
}
function sourmusicState(value, now=Date.now()) {
  try {
    const state=typeof value==='string'?JSON.parse(value):value;
    if(!state || !Number.isFinite(state.at) || now-state.at>45000 || state.at-now>3000)return null;
    const t=state.track;
    return t && /^[\w-]{11}$/.test(t.id) && typeof t.title==='string' && typeof t.user==='string'
      ? {id:t.id,title:t.title.slice(0,200),user:t.user.slice(0,80)} : null;
  }catch{return null;}
}

function sourmusicGlobal(result, name) {
  return result.variables?.[name]?.value ?? result.variable?.value ?? result.value;
}
