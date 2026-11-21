using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static readonly object Gate = new object();
    private static readonly System.Collections.Generic.Queue<string> Notices = new System.Collections.Generic.Queue<string>();
    public bool Execute()
    {
        lock (Gate)
        {
            try
            {
                string value;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (CPH.TryGetArg<string>("sourmusicNotice", out value))
                {
                    if (String.IsNullOrEmpty(value) || value.Length > 2048) return false;
                    JObject notice = JObject.Parse(value);
                    string id = (string)notice["id"], user = (string)notice["user"], reason = (string)notice["reason"];
                    if (String.IsNullOrEmpty(id) || id.Length > 200 || (!String.IsNullOrEmpty(user) && !System.Text.RegularExpressions.Regex.IsMatch(user, @"^[a-zA-Z0-9_]{1,25}$"))) return false;
                    string message;
                    switch (reason)
                    {
                        case "likes": message = "отказано: у видео меньше 1000 лайков. Выбери другой трек."; break;
                        case "likesUnknown": message = "отказано: YouTube не предоставил число лайков. Выбери другое видео."; break;
                        case "check": message = "отказано: не удалось проверить лайки YouTube. Попробуй позже."; break;
                        case "duplicate": message = "отказано: этот трек уже в очереди."; break;
                        case "duration": message = "отказано: трек превышает допустимую длительность."; break;
                        case "invalid": message = "заказ музыки не принят: нужна ссылка на одно видео YouTube (https://youtu.be/… или https://www.youtube.com/watch?v=…)."; break;
                        case "unavailable": message = "YouTube не разрешил воспроизвести заказанный трек: видео удалено, закрыто или недоступно. Выбери другое видео и обратись к модератору по поводу баллов."; break;
                        case "embed": message = "YouTube запретил воспроизведение заказанного трека во встроенном плеере. Выбери другое видео и обратись к модератору по поводу баллов."; break;
                        case "playback": message = "не удалось запустить заказанный трек из-за ошибки воспроизведения YouTube. Стримеру нужно проверить плеер."; break;
                        case "configuration": message = "заказанный трек не запустился из-за ошибки настройки YouTube-плеера. Стримеру нужно проверить источник OBS."; break;
                        case "full": message = "заказ музыки не принят: общая очередь заполнена. Обратись к модератору по поводу баллов."; break;
                        default: return false;
                    }
                    if (Notices.Contains(id)) return true;
                    CPH.SendMessage((String.IsNullOrEmpty(user) ? "SourMusic: " : "@" + user + ", ") + message, false);
                    Notices.Enqueue(id);
                    while (Notices.Count > 500) Notices.Dequeue();
                    return true;
                }
                if (CPH.TryGetArg<string>("sourmusicCommand", out value))
                {
                    if (String.IsNullOrEmpty(value) || value.Length > 4096) return false;
                    JObject command = JObject.Parse(value);
                    string type = (string)command["type"];
                    if (type != "next" && type != "stop" && type != "play" && type != "add" && type != "share") return false;
                    if (String.IsNullOrEmpty((string)command["id"]) || String.IsNullOrEmpty((string)command["session"])) return false;
                    if (type == "add")
                    {
                        string url = (string)command["url"];
                        string viewer = (string)command["user"];
                        if (String.IsNullOrEmpty(url) || url.Length > 300 || (viewer != null && viewer.Length > 80)) return false;
                    }
                    command["at"] = now;
                    string saved = CPH.GetGlobalVar<string>("sourmusic.commands", false);
                    JArray commands;
                    try { commands = String.IsNullOrEmpty(saved) ? new JArray() : JArray.Parse(saved); }
                    catch (Exception parseError)
                    {
                        CPH.LogError("SourMusic: очередь команд повреждена и сброшена: " + parseError.Message);
                        commands = new JArray();
                    }
                    foreach (JToken item in commands) if ((string)item["id"] == (string)command["id"]) return true;
                    commands.Add(command);
                    while (commands.Count > 64) commands.RemoveAt(0);
                    CPH.SetGlobalVar("sourmusic.commands", commands.ToString(Formatting.None), false);
                    return true;
                }
                if (!CPH.TryGetArg<string>("sourmusicState", out value) || String.IsNullOrEmpty(value) || value.Length > 65536) return false;
                JObject state = JObject.Parse(value);
                state["at"] = now;
                CPH.SetGlobalVar("sourmusic.nowPlaying", state.ToString(Formatting.None), false);
                // Лёгкая копия для оверлея: только текущий трек.
                JObject small = new JObject();
                small["at"] = now;
                JToken track = state["track"];
                small["track"] = track == null ? JValue.CreateNull() : track.DeepClone();
                CPH.SetGlobalVar("sourmusic.track", small.ToString(Formatting.None), false);
                return true;
            }
            catch (Exception error)
            {
                CPH.LogError("SourMusic State: " + error.Message);
                return false;
            }
        }
    }
}
