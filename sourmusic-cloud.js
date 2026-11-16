(function(root){
  const STORE='sourmusic.shared-room.v1';
  let sdkPromise;
  async function sdk(){
    if(!root.SOURMUSIC_FIREBASE?.databaseURL)throw Error('Firebase ещё не настроен');
    if(!sdkPromise)sdkPromise=(async()=>{
      const [app,auth,db]=await Promise.all(['app','auth','database'].map(n=>import('https://www.gstatic.com/firebasejs/13.2.0/firebase-'+n+'.js')));
      const instance=app.initializeApp(root.SOURMUSIC_FIREBASE,'sourmusic');
      const login=auth.getAuth(instance);await login.authStateReady();
      if(!login.currentUser)await auth.signInAnonymously(login);
      return {...db,database:db.getDatabase(instance),uid:login.currentUser.uid};
    })().catch(e=>{sdkPromise=null;throw e;});
    return sdkPromise;
  }
  function roomId(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
  function validRoom(id){return /^[a-f0-9]{64}$/.test(id||'');}
  function targetPosition(s,now){return Math.max(0,Number(s.position)||0)+(s.playback==='playing'?Math.max(0,(now-s.sampledAt)/1000):0);}
  async function publisher(onChange){
    const f=await sdk();let room=localStorage.getItem(STORE);
    if(!validRoom(room)){room=roomId();localStorage.setItem(STORE,room);}
    let base='rooms/'+room, ref=f.ref(f.database,base);
    let existing=(await f.get(ref)).val();
    if(existing && existing.owner!==f.uid){room=roomId();localStorage.setItem(STORE,room);base='rooms/'+room;ref=f.ref(f.database,base);existing=null;}
    if(!existing)await f.set(ref,{owner:f.uid,online:false});
    let stopped=false,connected=false,offset=0,pending=null,busy=false,lastQueue=null;
    const offClock=f.onValue(f.ref(f.database,'.info/serverTimeOffset'),s=>{offset=s.val()||0;});
    const offConnection=f.onValue(f.ref(f.database,'.info/connected'),async s=>{
      connected=s.val()===true;
      try{if(connected&&!stopped){await f.onDisconnect(f.ref(f.database,base+'/online')).set(false);await f.set(f.ref(f.database,base+'/online'),true);}}
      catch(e){onChange({enabled:true,connected:false,error:e.message,room});return;}
      onChange({enabled:true,connected,room});if(connected)flush();
    });
    async function flush(){
      if(busy||stopped||!connected||!pending)return;busy=true;
      try{while(pending&&!stopped&&connected){const next=pending;pending=null;
        const q=JSON.stringify(next.queue||[]);const state={...next,sampledAt:next.sampledAt+offset};delete state.queue;
        const patch={state:JSON.stringify(state),updatedAt:f.serverTimestamp()};if(q!==lastQueue)patch.queue=q;
        await f.update(ref,patch);lastQueue=q;onChange({enabled:true,connected:true,room});
      }}catch(e){onChange({enabled:true,connected:false,error:e.message,room});}finally{busy=false;}
    }
    return {room,publish(s){pending=s;flush();},async close(){stopped=true;pending=null;offConnection();offClock();await f.set(f.ref(f.database,base+'/online'),false);await f.onDisconnect(f.ref(f.database,base+'/online')).cancel();onChange({enabled:false,connected:false,room});}};
  }
  async function subscribe(room,onState,onConnection){
    if(!validRoom(room))throw Error('Некорректная ссылка комнаты');
    const f=await sdk();let offset=0;
    const offs=[f.onValue(f.ref(f.database,'.info/serverTimeOffset'),s=>{offset=s.val()||0;}),f.onValue(f.ref(f.database,'.info/connected'),s=>onConnection(s.val()===true))];
    offs.push(f.onValue(f.ref(f.database,'rooms/'+room),s=>{
      const r=s.val();try{onState(r?{...r,state:r.state?JSON.parse(r.state):null,queue:r.queue?JSON.parse(r.queue):[],now:()=>Date.now()+offset}:null);}catch{onState(null);}
    },e=>onConnection(false,e.message)));
    return ()=>offs.forEach(fn=>fn());
  }
  root.SourMusicCloud={publisher,subscribe,targetPosition,validRoom};
})(typeof window!=='undefined'?window:globalThis);
