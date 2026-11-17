using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static readonly object Gate = new object();
    public bool Execute()
    {
        lock (Gate)
        {
            try
            {
                string value;
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
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
