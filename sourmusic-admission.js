/* Only the playback source admits orders; the dock and follower never call YouTube Data API. */
const SOURMUSIC_MIN_LIKES=1000;
async function sourmusicCheckVideo(id) {
  const key=window.SOURMUSIC_YOUTUBE_KEY;
  if(!key)return {ok:false,reason:'check',detail:'Не настроена проверка лайков YouTube'};
  try {
    const url=new URL('https://www.googleapis.com/youtube/v3/videos');
    url.search=new URLSearchParams({key,id,part:'snippet,statistics,status',fields:'items(id,snippet(title),statistics(likeCount),status(embeddable,privacyStatus))'});
    const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
    if(!response.ok)return {ok:false,reason:'check',detail:'YouTube API: '+response.status};
    const data=await response.json(),video=data.items?.[0];
    if(!video)return {ok:false,reason:'unavailable'};
    if(video.status?.embeddable===false)return {ok:false,reason:'embed'};
    const raw=video.statistics?.likeCount;
    if(typeof raw!=='string'||!/^\d+$/.test(raw))return {ok:false,reason:'likesUnknown'};
    const likes=Number(raw);
    if(!Number.isFinite(likes))return {ok:false,reason:'likesUnknown'};
    if(likes<SOURMUSIC_MIN_LIKES)return {ok:false,reason:'likes',likes};
    return {ok:true,likes,title:String(video.snippet?.title||'').slice(0,250)};
  }catch{return {ok:false,reason:'check',detail:'YouTube API не ответил'};}
}
const sourmusicRejectionText={invalid:'Отказано: нужна ссылка на отдельное видео YouTube.',likes:'Отказано: у видео меньше 1000 лайков.',likesUnknown:'Отказано: YouTube не предоставил количество лайков.',check:'Отказано: не удалось проверить лайки. Попробуйте позже.',unavailable:'Отказано: видео удалено, закрыто или недоступно.',embed:'Отказано: YouTube запрещает встроенное воспроизведение.',duplicate:'Отказано: этот трек уже в очереди.',full:'Отказано: очередь заполнена.',duration:'Отказано: трек превышает допустимую длительность.',playback:'Не удалось воспроизвести заказанный трек.',configuration:'Не удалось воспроизвести трек: ошибка настройки плеера.'};
