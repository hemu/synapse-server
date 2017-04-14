import { SessionState, getCurrentNote } from '~/core/session_state';
import Answer from '~/core/answer';
import { successEval, insertEval } from '~/controller/pipe_eval';

function generateSuccess(probability) {
  return Math.random() < probability;
}

function countInfluence(count) {
  if (count < 3) {
    return 0;
  }
  return (count - 2) * 0.15;
}

// use previous note records to modify base success prob
function calcSuccess(appState, currentNote) {
  const { successBaseProb, } = appState.simulatorInput;
  let prob = successBaseProb;

  const noteRecordsMap = appState.session.simulator.noteRecordsMap;
  if (noteRecordsMap) {
    const noteRec = noteRecordsMap[currentNote._id.toString()];
    if (noteRec) {
      const countInf = countInfluence(noteRec.count);
      prob = Math.min(1.0, prob + countInf);
      return generateSuccess(prob);
    }
  }

  return generateSuccess(prob);
}

export default function pipe(appState) {
  // if (!{}.hasOwnProperty.call(appState, 'simulatorInput')) {
  //   return appState;
  // }
  //
  let success = false;

  const currentNote = getCurrentNote(appState.session);
  if (!currentNote) {
    if (appState.session.state === SessionState.DONE_QUEUE) {
      success = true;
    } else {
      console.log('No current note, aborting eval');
      return appState;
    }
  } else if (currentNote.type === 'info') {
    success = true;
  } else {
    success = calcSuccess(appState, currentNote);
  }

  return insertEval(appState, success ? successEval(Answer.max) : successEval(Answer.min));
}
