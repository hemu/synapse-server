import { SessionState, getCurrentNote } from '~/core/session_state';
import Input, { getChoiceInput, getPathInput } from '~/core/input';
import generateQuestion from '~/speech';
import Answer from '~/core/answer';
import { logErr } from '~/logger';
import { Media } from '~/db/collection';
import { NoteType } from '~/core/note';
import { sendText, sendImage, sendQuickReply } from './fbmessenger_request';

function sendImageWithUrl(senderID, imgUrl) {
  if (!imgUrl) {
    return Promise.resolve(0);
  }
  return sendImage(senderID, imgUrl);
}

export function sendPossibleImage(senderID, note) {
  if ('imgUrl' in note) {
    if (note.imgUrl != null) {
      return sendImageWithUrl(senderID, note.imgUrl);
    }
  }
  return Promise.resolve(0);
}

function sendResponseInContext(state) {
  const fbUserID = state.senderID;
  const session = state.session;
  const note = session.noteQueue[session.queueIndex];
  switch (session.state) {
    case SessionState.INIT:
      return sendText(fbUserID, "Let's get started!").then(() => state);

    case SessionState.INFO: {
      const displayText = note.displayRaw;
      let quickReplyData = [];

      if (state.paths) {
        quickReplyData = [
          ...state.paths.map(path => ({
            title: path.display,
            action: getPathInput(path.index),
          }))
        ];
      }

      quickReplyData.push({
        title: 'ok keep going',
        action: Input.Type.ACCEPT,
      });
      return sendPossibleImage(fbUserID, note).then(() =>
        sendQuickReply(fbUserID, displayText, quickReplyData));
    }

    case SessionState.RECALL: {
      const quickReplyData = [];
      quickReplyData.push({
        title: 'Tell me the answer',
        action: Input.Type.ACCEPT,
      });
      const questionText = generateQuestion(note);
      return sendPossibleImage(fbUserID, note).then(() =>
        sendQuickReply(fbUserID, questionText, quickReplyData));
    }

    case SessionState.RECALL_RESPONSE: {
      const quickReplyData = [];
      quickReplyData.push({
        title: 'Yes',
        action: Input.Type.ACCEPT,
      });
      quickReplyData.push({
        title: 'No',
        action: Input.Type.REJECT,
      });
      return sendText(fbUserID, note.hidden).then(() =>
        sendQuickReply(fbUserID, 'Is that what you were thinking?', quickReplyData));
    }

    case SessionState.INPUT: {
      const questionText = generateQuestion(note);
      return sendPossibleImage(fbUserID, note).then(() => sendText(fbUserID, questionText));
    }

    case SessionState.MULT_CHOICE: {
      const questionText = generateQuestion(note);
      return sendPossibleImage(fbUserID, note)
        .then(() => sendText(fbUserID, questionText))
        .then(() => {
          let choicesText = '';
          choicesText += `(1) ${note.choice1}\n`;
          choicesText += `(2) ${note.choice2}\n`;
          choicesText += `(3) ${note.choice3}\n`;
          choicesText += `(4) ${note.choice4}\n`;
          choicesText += `(5) ${note.choice5}`;
          const quickReplyData = [1, 2, 3, 4, 5].map(num => ({
            title: `${num}`,
            action: getChoiceInput(num),
          }));
          return sendQuickReply(fbUserID, choicesText, quickReplyData);
        });
    }

    case SessionState.SHOW_PATHS: {
      if (!state.paths) {
        return Promise.resolve(0);
      }
      let displayText = '';
      if (note.type === NoteType.INFO) {
        displayText = note.displayRaw;
      }
      const quickReplyData = [
        ...state.paths.map(path => ({
          title: path.display,
          action: getPathInput(path.index),
        })),
        {
          title: 'ok, keep going',
          action: Input.Type.ACCEPT,
        }
      ];
      return sendQuickReply(fbUserID, displayText, quickReplyData);
    }

    case SessionState.DONE_QUEUE:
      return Media.aggregate([{ $sample: { size: 1, }, }]).then(result => {
        let img = '';
        if (result && result.length) {
          img = result[0].url;
          return sendImageWithUrl(fbUserID, img).then(() =>
            sendText(fbUserID, 'No more to learn for today, all done! Check back in tomorrow :)'));
        }
        return sendText(
          fbUserID,
          'No more to learn for today, all done! Check back in tomorrow :)'
        );
      });

    default:
      logErr(`Unrecognized state ${session.state}, could not properly respond`);
      return Promise.resolve(0);
  }
}

export default function sendResponse(state) {
  return sendResponseInContext(state).then(() => state).catch(err => {
    if (state.session) {
      logErr(`Error sending response from ${state.session.state} state`);
    } else {
      logErr('Error sending response');
    }
    logErr(err);
  });
}

function posFeedback() {
  return 'Great job!';
}

function negFeedback(state) {
  if (state.session.state === SessionState.RECALL_RESPONSE) {
    return "that's ok";
  }
  return 'Not quite.';
}

function sendFeedbackText(state, withHiddenContent = false, withSuccessMedia = false) {
  const toID = state.senderID;
  const isPositive = state.evalCtx.answerQuality === Answer.max;
  const correctMsg = state.evalCtx.correctAnswer;

  let msg = isPositive ? posFeedback() : negFeedback(state);
  if (!isPositive) {
    if (correctMsg) {
      msg = `${msg} It's actually ${correctMsg}`;
    }
    const curNote = getCurrentNote(state.session);
    if (withHiddenContent && curNote.hidden) {
      msg = `${msg}. ${curNote.hidden}`;
    }
    return sendText(toID, msg);
  }
  // try to send a success GIF
  if (withSuccessMedia) {
    return Media.aggregate([{ $sample: { size: 1, }, }]).then(result => {
      let img = '';
      if (result && result.length) {
        img = result[0].url;
        return sendImageWithUrl(toID, img).then(() => sendText(toID, msg));
      }
      return sendText(toID, msg);
    });
  }
  return sendText(toID, msg);
}

// return state
export function sendFeedbackResp(state, withSuccessMedia = false) {
  const session = state.session;
  switch (session.state) {
    case SessionState.RECALL_RESPONSE:
      return sendFeedbackText(state, false, withSuccessMedia).then(() => state);
    case SessionState.INPUT:
    case SessionState.MULT_CHOICE:
      return sendFeedbackText(state, true, withSuccessMedia).then(() => state);
    default:
      break;
  }

  return state;
}
