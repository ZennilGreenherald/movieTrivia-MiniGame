//old way of exporting a function without modules
globalThis.twitchChatConnect = twitchChatConnect;

const TwitchWebSocketUrl = 'wss://irc-ws.chat.twitch.tv:443';

let wsTwitch;
let channelName;
let parseChatCallback;

export function twitchChatConnect(name, chatParseCallback)
{
  channelName = name;
  parseChatCallback = chatParseCallback;
  wsTwitch = new WebSocket(TwitchWebSocketUrl);
  wsTwitch.onopen = () => {
    console.log("chat opened");
    wsTwitch.send(`CAP REQ :twitch.tv/commands twitch.tv/tags`);
    wsTwitch.send(`NICK justinfan6969`);
    wsTwitch.send(`JOIN #${channelName}`);
    console.log('WebSocket connection opened');

    let chatMSG = document.createElement("div");
    let auth = document.createElement("div");
    parseChatCallback(
      "",
      `Connected to ${channelName}'s chat!`,
      auth,
      chatMSG
    );
  }
  wsTwitch.onmessage = onMessage;

  return wsTwitch;
}

function onMessage(fullmsg)
{
  const txt = fullmsg.data;
  console.log("txt: ", txt);
  let name = '';
  let outmsg = '';
  let indx = 0;

  if (txt[0] == '@') {
    indx = txt.indexOf(' ') + 1;
  }

  if (txt[indx] == ':') {
    const pos1 = txt.indexOf('@', indx) + 1;
    const pos2 = txt.indexOf(".", pos1);
    name = txt.substring(pos1, pos2).trim();
    if (new Set([":tmi", "justinfan6969", "@emote-only=0;", ":justinfan6969"]).has(name)) {
      console.log(`Invalid name: _${name}_`);
      return;
    }

    const pos3 = txt.indexOf(`#${channelName}`) + channelName.length + 3;
    outmsg = txt.substring(pos3).trim();
    console.log(`outmsg: ${outmsg}`);
  }
  else {
    // handle pings & other twitch specific things
    const pos2 = txt.indexOf(":");
    name = txt.slice(0, pos2).trim();
    outmsg = txt.slice(pos2).trim();

    if (name == 'PING') {
      console.log('PONG ' + outmsg);
      wsTwitch.send('PONG ' + outmsg);
    }
    return;
  }

  //not running bot commands here
  console.log(`Invalid message: _${outmsg}_`);
  if (outmsg[0] == '!') {
    return;
  }

  console.log(`name ${name}, outmsg: ${outmsg}`);
  display_msg(name, outmsg);
}

// display chat message on stream
// calls parseChatCallback() with elements created here
// auth & chatMSG are both stylized here
function display_msg(name, outmsg, tags_obj, emote_list)
{
  let emote;
  let chatMSG = document.createElement("div");

  if (outmsg.startsWith('\x01ACTION')) {
    outmsg = outmsg.substring(7, outmsg.length - 1).trim();
    chatMSG.classList.add('msg_is_emote');
  }

  let auth = document.createElement("div");
  auth.classList.add("name");

  if (tags_obj?.color) {
    chatMSG.style.setProperty('--name-color', tags_obj['color']);
  }

  auth.textContent = (tags_obj?.display_name || name) + ' ';

  if (tags_obj?.emotes) {
    let parts = [];
    let end_indx = outmsg.length;

    for (let i = emote_list.length; --i >= 0; ) {
      emote = document.createElement("img");
      emote.setAttribute('src', emote_list[i].url);
      if (i !== 0) {
        emote.style = 'margin-left: -14px';
      }

      let last_half = esc_html(outmsg.slice(emote_list[i].end + 1, end_indx));
      parts.unshift(last_half);
      parts.unshift(emote.outerHTML);
      end_indx = emote_list[i].start;
    }
    parts.unshift(esc_html(outmsg.slice(0, end_indx)));
    outmsg = parts.join('');
  }

  parseChatCallback(name, outmsg, auth, chatMSG);
}
