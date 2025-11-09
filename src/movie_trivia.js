"use strict";

let twitchChatConnect;
import ("./twitch_chat.js").then(e => {
  //this way only works with modules enabled (see script assignments in index.html)
  twitchChatConnect = e.twitchChatConnect;
  console.log(`twitchChatConnect is set via import!`);
});


const randInt = n => Math.floor(Math.random() * n);
const getById = id => document.getElementById(id);
const createEl = (tagName, props) => {
  const el = document.createElement(tagName);
  Object.entries(props || {}).forEach(([k, v]) => el[k] = v);
  return el;
}


const buttons = {
  answerBtn: getById("answer"),
  playBtn: getById("pause"),
  prevBtn: getById("prev"),
  nextBtn: getById("next"),
  setAnswerText: function(t) {
    this.answerBtn.innerText = t;
  },
  setPlayText: function(t) {
    this.playBtn.innerText = t;
  },
  setAnswerOnClick: function(onclick) {
    this.answerBtn.onclick = onclick;
  },
  setPlayOnClick: function(onclick) {
    this.playBtn.onclick = onclick;
  },
  isShowingNext: function() {
    return this.answerBtn.innerText === "Next";
  },
  isShowingAnswer: function() {
    return this.answerBtn.innerText === "Answer";
  },
  setPrevOnClick: function(onclick) {
    this.prevBtn.onclick = onclick;
  },
  setPrevEnabled: function(b) {
    this.prevBtn.disabled = !b;
  },
  setNextOnClick: function(onclick) {
    this.nextBtn.onclick = onclick;
  },
  setDisabled: function(b) {
    this.nextBtn.disabled = b;
    this.prevBtn.disabled = b;
    this.playBtn.disabled = b;
  },
  showRestart: function(k) {
    this.setDisabled(true);
    this.setAnswerText("Restart?");

    this.answerBtn.onclick = () => {
      this.setDisabled(false);
      this.setAnswerText("Answer");
      k();
    }
  }
};


const timer = {
  label: getById("timer"),
  state: 'running',
  setText: function(t) {
    this.label.innerText = t;
  },
  getText: function() {
    return +this.label.innerText;
  },
  pause: function() {
    this.state = "paused";
  },
  run: function() {
    this.state = "running";
  },
  isRunning: function() {
    return this.state == "running";
  }
};


const stopwatch = {
  setEnd: function(numSeconds) {
    this.timeEnd = performance.now() + 1000 * numSeconds;
  },
  setEndNow: function() {
    this.setEnd(0);
  },
  secondsTilExpiry: function() {
    const msToGo = this.timeEnd - performance.now();
    return Math.floor(msToGo % (1000 * 60) / 1000)
  },
  isShowAnswerTimeExpired: function(showAnswerTimeSecs) {
    return performance.now() > this.timeEnd + showAnswerTimeSecs * 1000
  }
};


const twitchName = getById("twitchName");
const connectBtn = getById("connectChatBtn");
const sound  = getById("sound");
let question = createEl("img");

let maxMsgCount    = 5;
let countdownTime  = 30;
let showAnswerTime = 15;
let questionCount  = 10;

let twitchChatWS;
let tmdbList;

let answered = [];
let winners  = [];

let triviaIndex = 0;
let score = {};

let correctAnsIdx;
let triviaQuestions;


async function play_trivia()
{
  await createQuestions();
  initButtons();
  stopwatch.setEnd(countdownTime);

  question.src = await getTriviaURL(0);

  question.id = "question";
  getById("trivia").appendChild(question);
  timer.setText(countdownTime);

  multipleChoice();
  stateMachine();
}


function updateTimer() {
  if (!timer.isRunning()) {
    return;
  }

  buttons.setPlayText("Pause");
  if (!buttons.isShowingNext()) {
    timer.setText(stopwatch.secondsTilExpiry());
  }

  if (timer.getText() <= 0) {
    buttons.setAnswerText("Next");
    timer.setText(triviaQuestions[triviaIndex % triviaQuestions.length].answer);
  }
  if (stopwatch.isShowAnswerTimeExpired(showAnswerTime)) {
    // reset timer and load next trivia
    buttons.setAnswerText("Answer");
    nextTrivia();
  }
  buttons.setPrevEnabled(triviaIndex > 0 && triviaIndex < triviaCount.value);
}


function stateMachine() {
  updateTimer();
  requestAnimationFrame(stateMachine);
}


async function getTriviaURL(index)
{
  let baseURL = `https://quantumapprentice.github.io/Movie-Tracker/bg/${triviaQuestions[index].question}`;
  // let baseURL = `/Movie-Tracker/bg/${triviaQuestions[index].question}`;
  let imageName = triviaQuestions[index].question.slice(0,-4);

  const img = new Image();
  let difficulty = 0;
  let temp;
  let p = false;
  while (!p && difficulty < 3) {
    temp = `https://quantumapprentice.github.io/movieTrivia-MiniGame/assets/${imageName}-${difficulty++}.gif`;
    img.src = temp;
    p = await new Promise(res => {
      img.addEventListener('load', () => res(true));
      img.addEventListener('error',() => res(false));
    });
  }

  return p ? temp : baseURL;
}


function initButtons()
{
  //answer/next
  buttons.setAnswerOnClick(e => {
    if (buttons.isShowingAnswer()) {
      buttons.setAnswerText("Next");
      timer.setText(triviaQuestions[triviaIndex].answer);
    } else {
      buttons.setAnswerText("Answer");
      nextTrivia();
    }
  });

  //play/pause
  buttons.setPlayOnClick(e => {
    if (!timer.isRunning()) {
      buttons.setPlayText("Pause");
      timer.run();
      restartTimer();
    } else {
      buttons.setPlayText("Play");
      timer.pause();
    }
  });

  //next >>
  buttons.setPrevOnClick(async () => {
    triviaIndex -= 1;
    if (triviaIndex < 0) {
      triviaIndex = triviaQuestions.length - 1;
    }
    question.src = await getTriviaURL(triviaIndex);
    resetTimer();
    multipleChoice();
    buttons.setAnswerText("Answer");
  });
  //previous <<
  buttons.setNextOnClick(() => {
    nextTrivia();
    buttons.setAnswerText("Answer");
  });

  //sound button
  sound.onclick = e => {
    if (e.currentTarget.classList.value === "soundOn") {
      e.currentTarget.classList = "soundOff";
      getById("sadTrombone").muted = true;
    } else {
      e.currentTarget.classList = "soundOn";
      getById("sadTrombone").muted = false;
    }
  }

  //twitch chat connection stuff
  //specifically attached to the connect button
  twitchName.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.stopPropagation();

      if (!e.target.value) {
        parseChatCallback("TriviaBot", `No channel-name provided. Add a channel name in ☰ Options.`);
        return;
      }

      if (connectBtn.innerText === "Connect to Twitch Chat") {
        connectBtn.innerText = "Disconnect";
        startChat(e.target.value, parseChatCallback);
      } else {
        twitchChatWS.onclose = () => {
          connectBtn.innerText = "Connect to Twitch Chat";
  
          parseChatCallback("TriviaBot", `Disconnected from twitch chat.`);
        }
        twitchChatWS.close();
      }
    }
  });

  connectBtn.onclick = e => {
    e.stopPropagation();

    if (!twitchName.value) {
      parseChatCallback("TriviaBot", `No channel-name provided. Add a channel name in ☰ Options.`);
      return;
    }

    if (e.target.innerText === "Connect to Twitch Chat") {
      e.target.innerText = "Disconnect";
      startChat(twitchName.value, parseChatCallback);
    } else {
      twitchChatWS.onclose = () => {
        e.target.innerText = "Connect to Twitch Chat";

        parseChatCallback("TriviaBot", `Disconnected from twitch chat.`);
      }
      twitchChatWS.close();
    }
  }

  //sidebar hamburger button
  const hamburger = getById("hamburger");
  hamburger.onclick = e => {
    e.stopPropagation();
    e.currentTarget.classList.toggle("change");
    getById("sidebar").classList.toggle("change");
  }

  //number of trivia elements in this run
  const triviaCount = getById("triviaCount");
  if (triviaCount.value != questionCount) {
    questionCount = triviaCount.value;
    createQuestions();
  }

  triviaCount.onchange = e => {
    questionCount = e.target.value;
    createQuestions();
  }

  //amount of time trivia question will stay on screen
  const triviaTime = getById("triviaTime");
  if (triviaTime.value != countdownTime) {
    countdownTime = triviaTime.value;
  }

  triviaTime.onchange = e => {
    countdownTime = e.target.value;
    const countdown = timer.getText();
    if (countdownTime < countdown) {
      restartTimer();
    }
  }

  // amount of time the answer stays on screen before starting the next trivia question
  const pauseTime = getById("pauseTime");
  if (pauseTime.value != showAnswerTime) {
    showAnswerTime = pauseTime.value;
  }

  pauseTime.onchange = e => {
    showAnswerTime = e.target.value;
  }
}


// get the next trivia entry and fill the question.src with new entry
async function nextTrivia() {
  triviaIndex += 1;
  if (triviaIndex >= triviaQuestions.length) {
    timer.pause();
    showScore();
    return;
  }

  // must reset timer before the async call to getTriviaURL so that we don't keep cycling to next trivia questions.
  resetTimer();
  question.src = await getTriviaURL(triviaIndex);

  // reset for next round
  multipleChoice();
}


async function restartTrivia()
{
  resetAnswered();
  resetWinners();

  await createQuestions();
  resetTimer();
  triviaIndex = 0;
  multipleChoice();

  getById("title").innerText = "Name That Movie";
  const scoreCard = getById("score");
  question = createEl("img", {
    src: await getTriviaURL(0),
    id: "question"
  });

  scoreCard.replaceWith(question);
  timer.setText(countdownTime);
}


function restartTimer() {
  const countdown = timer.getText();
  if (countdown) {
    stopwatch.setEnd(+countdown);
  }
  timer.run();
}


function resetTimer() {
  timer.setText(countdownTime);
  stopwatch.setEnd(countdownTime);
  timer.run();
}


async function startChat(chatName, chatParser)
{
  if (twitchChatWS) {
    if (twitchChatWS.readyState === twitchChatWS.OPEN) {
      twitchChatWS.close();
      parseChatCallback("TriviaBot", `Disconnecting from ${chatName} and...`);
    }
  }
  // used the globalThis variable to share twitch_chat
  // this bypasses module requirements for import
  twitchChatWS = await globalThis.twitchChatConnect(chatName, chatParser);
}


function parseChatCallback(name, outmsg, auth, chatMSG)
{
  if (!auth) auth = createEl('div');
  if (!chatMSG) chatMSG = createEl('div');

  const winner = parseTriviaChat(name, outmsg);

  //for some reason the twitch chat api sends a message
  //back when the chat fails to connect (doesn't find channel)
  //but does nothing when chat connection succeeds
  if (outmsg === "This channel does not exist or has been suspended.") {
    connectBtn.innerText = "Connect to Twitch Chat";
  }

  //option to hide chat except for those who guess correctly
  const chatBody = getById("twitchChat");
  let hideChat = false;
  if (hideChat) {
    if (winner.won) {
      const msg = createEl("div", {
        innerHTML: outmsg
      });
      msg.classList.add("msg");

      msg.classList.add("winner");
      auth.classList.add("winner");

      chatMSG.append(auth, msg);
      // chat message has to be prepended to appear on bottom
      chatBody.prepend(chatMSG);
    }
  } else {
    const msg = createEl("div", {
      innerHTML: outmsg
    });
    msg.classList.add("msg");

    if (winner.won) {
      msg.classList.add("winner");
      auth.classList.add("winner");
      getById(`${Number(outmsg)}`).classList.add("winnerChoice");
      getById("sadTrombone").play();

    }
    msg.innerText += winner.str;

    chatMSG.append(auth, msg);
    // chat message has to be prepended to appear on bottom
    chatBody.prepend(chatMSG);
  }
  chatMSG.classList.add("message_box");

  // if more than maxMsgCount, delete first message
  if (chatBody.children.length > maxMsgCount) {
    chatBody.lastElementChild.remove();
  }
}


play_trivia();


async function loadTMDB()
{
  const r = await fetch(`https://raw.githubusercontent.com/QuantumApprentice/Movie-Tracker/refs/heads/master/src/tmdbList.json`);
  if (!r.ok) {
    throw new Error(`Response failed? ${JSON.stringify(r)}`);
  }
  return r.json();
}


async function createQuestions()
{
  if (!tmdbList) {
    tmdbList = await loadTMDB();
  }

  let indexArr = new Array(questionCount);
  for (let i = 0; i < questionCount; i++) {
    let currIndex;
    do {
      currIndex = randInt(tmdbList.length);
    } while (indexArr.includes(currIndex) || !tmdbList[currIndex].bg);
    indexArr[i] = currIndex;
  }

  triviaQuestions = indexArr.map(i => {
    return {
      answer: tmdbList[i].title,
      question: tmdbList[i].bg
    }
  });
}


function createAnswers()
{
  let nextQuestion = triviaQuestions[triviaIndex % triviaQuestions.length];

  // prevent same answer index from appearing twice in a row
  const nextAnswerIndex = ((correctAnsIdx || 1) + randInt(3)) % 4;
  correctAnsIdx = nextAnswerIndex + 1;
  const newAnswers = [{ ...nextQuestion }];

  const foundAnswerTitles = new Set();

  while (newAnswers.length < 4) {
    const rng = randInt(tmdbList.length);
    if (!foundAnswerTitles.has(tmdbList[rng].title)) {
      newAnswers.push({
        answer: tmdbList[rng].title,
        question: tmdbList[rng].bg
      });
      foundAnswerTitles.add(tmdbList[rng].title);
    }
  }

  if (nextAnswerIndex != 0) {
    const t = newAnswers[nextAnswerIndex];
    newAnswers[nextAnswerIndex] = newAnswers[0];
    newAnswers[0] = t;
  }

  return newAnswers;
}


function parseTriviaChat(name, outmsg)
{
  const showScoreboard = triviaIndex >= triviaQuestions.length;
  const roundOver = winners[triviaIndex];
  if (showScoreboard || roundOver) {
    return { won: false, str: "" };
  }
  else if (answered.includes(name)) {
    return { won: false, str: " -- Oops, you already played this round." };
  }
  else {
    const guessedCorrectNumber = Number(outmsg) === correctAnsIdx;
    const guessedPartialTitle = outmsg.toLowerCase().indexOf(triviaQuestions[triviaIndex].answer) != -1;
    if (guessedCorrectNumber || guessedPartialTitle) {
      winners.push(name);
      stopwatch.setEndNow();
      score[name] = score[name] ? score[name] + 1 : 1;
      return { won: true, str: guessedCorrectNumber ? "" : " -- Oh wow, you actually typed it out?" };
    }
    else {
      outmsg = +outmsg;
      const isValidNumber = outmsg > 0 && outmsg < 5;
      if (isValidNumber) {
        answered.push(name);
        return { won: false, str: " -- Sorry, you didn't win this time." };
      }
      else {
        // all regular chat
        return { won: false, str: "" };
      }
    }
  }
}

// reset so same people can answer again
function resetAnswered()
{
  answered = [];
}


function resetWinners()
{
  winners = [];
}


function multipleChoice() {
  const choiceDiv = getById("choiceDiv");
  choiceDiv.innerHTML = "";   //clear previous answer choices

  resetAnswered();

  const ansArr = createAnswers();

  //create array of answer buttons - choiceBtnArr[] and fill with ansArr[] answers
  let choiceBtnArr = [];
  for (let i = 0; i < 4; i++) {
    const choiceBtnDiv = createEl("div", {
      className: "choiceBtn",
      id: `${i + 1}`
    });

    const choiceAns = createEl("div", {
      className: "choiceTxt",
      innerText: `${ansArr[i].answer}`
    });

    const choiceNum = createEl("div", {
      className: "choiceNum",
      innerText: `${i + 1}`
    });

    choiceBtnDiv.append(choiceNum);
    choiceBtnDiv.append(choiceAns);
    choiceBtnDiv.onclick = handleClick;
    choiceBtnArr.push(choiceBtnDiv);

    choiceDiv.append(choiceBtnDiv);
  }

  // onClick for the right answer only (maybe add wrong answer stuff?)
  function handleClick(e) {
    //if button has the correct answer...
    if (e.currentTarget.lastChild.textContent === triviaQuestions[triviaIndex].answer) {
      //display correct answer in timer
      if (!buttons.isShowingNext()) {
        buttons.setAnswerText("Next");
        stopwatch.setEndNow();
        timer.setText(triviaQuestions[triviaIndex].answer);
        score["Me"] = score["Me"] ? score["Me"] + 1 : 1;

        //TODO: wtf? why isn't this pointing
        //      to the parent element directly?
        //Answer: currentTarget actually points to the current element
        //      but it's null if just logging out "e"
        //      need to log out currentTarget to see
        e.currentTarget.classList.add("winnerChoice");
        const sadTrombone = getById("sadTrombone");
        sadTrombone.play();
      }
    } else {
      e.currentTarget.classList.add("wrongChoice");
      choiceBtnArr.forEach(e => {
        e.classList.add("disabledChoice");
        e.onclick = null;
      });
    }
  }
}


function showScore()
{
  timer.setText("");
  getById("title").innerText = "Score";

  buttons.showRestart(() => {
    initButtons();
    restartTrivia();
  });

  const scoreCard = createEl("table", {
    className: "scoreCard",
    id: "score"
  });

  question.replaceWith(scoreCard);

  const scoreArr = Object.entries(score);
  scoreArr.sort((a, b) => {
    return b[1] - a[1];
  });

  scoreArr.forEach(e => {
    const td1 = createEl("td", {
      className: "scoreName",
      innerText: e[0],
      style: `color : rgb(${randInt(255)} ${randInt(255)} ${randInt(255)});`
    });

    const td2 = createEl("td", {
      innerText: e[1],
      className: "scoreAmount"
    });

    const row = createEl("tr");
    row.appendChild(td1);
    row.appendChild(td2);
    scoreCard.appendChild(row);
  });
}

