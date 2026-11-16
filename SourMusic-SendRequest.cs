using System;
using System.Text.RegularExpressions;
public class CPHInline {
 public bool Execute() {
  string url,user,id;
  if(!CPH.TryGetArg<string>("rawInput",out url)||!CPH.TryGetArg<string>("userName",out user)||!CPH.TryGetArg<string>("redemptionId",out id))return false;
  url=(url??"").Trim();
  if(!Regex.IsMatch(user??"",@"^\w{1,25}$")||!Regex.IsMatch(id??"",@"^[a-zA-Z0-9-]{8,80}$"))return false;
  Uri parsed;
  if(!Uri.TryCreate(url,UriKind.Absolute,out parsed)||parsed.Scheme!="https")return false;
  string host=parsed.Host.ToLowerInvariant();
  if(host!="youtu.be"&&host!="youtube.com"&&host!="www.youtube.com"&&host!="m.youtube.com"&&host!="music.youtube.com")return false;
  if(url.Length>300||Regex.IsMatch(url,@"\s"))return false;
  CPH.SendMessage("!addsourmusic "+url+" "+user+" "+id,false);
  return true;
 }
}

