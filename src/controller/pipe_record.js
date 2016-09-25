import SpacedRep from '~/core/spaced_repetition';
import { SessionState } from '~/core/session_state';
import { NoteRecord } from '~/db/collection';
import { log } from '~/logger';

// Record results of input evaluation using NoteRecord collection
// This will involve calculating future due date, updating note history

function calcNoteHealth(responseHistory) {
  if (responseHistory.length === 0) {
    return 0;
  }

  if (responseHistory.length > 3) {
    let allBad = true;
    for (let i = 0; i < 3; i++) {
      if (responseHistory[responseHistory.length - 1 - i] !== 0) {
        allBad = false;
        break;
      }
    }
    // if past x responses were all bad, drop note health to 0
    if (allBad) {
      return 0;
    }
  }

  const lastResponses = responseHistory.slice(-4);
  // var sum = 5;
  let sum = 0;
  for (let i = 0; i < lastResponses.length; i++) {
    sum += lastResponses[i];
  }

  // var avg = sum / (lastResponses.length + 1);
  const avg = sum / (lastResponses.length);
  return avg;
}

// calculate new factor
// calculate new interval
function pipeSpaceRepVals(recordCtx,
                          record,
                          evalCtx) {
  const rec = record || {
    factor: SpacedRep.defaultFactor,
    interval: SpacedRep.defaultInterval,
    count: SpacedRep.defaultCount,
  };

  const responseQuality = evalCtx.answerQuality;
  const newFactor = SpacedRep.calcFactor(rec.factor, responseQuality);
  const newCount = rec.count + 1;

  const newInterval = SpacedRep.calcInterval(rec.interval,
                                           newFactor,
                                           newCount,
                                           responseQuality);
  const factorHistory = rec.factorHistory || [];
  const intervalHistory = rec.intervalHistory || [];

  return {
    ...recordCtx,
    factor: newFactor,
    interval: newInterval,
    count: newCount,
    factorHistory: [...factorHistory, newFactor],
    intervalHistory: [...intervalHistory, newInterval],
  };
}

function pipeDates(recordCtx, record) {
  const due = SpacedRep.calcDueDate(recordCtx.interval);
  const lastDoneDate = new Date();
  const dueHistory = record ? record.dueHistory || [] : [];
  const lastDoneHistory = record ? record.lastDoneHistory || [] : [];
  return {
    ...recordCtx,
    due,
    lastDone: lastDoneDate,
    dueHistory: [...dueHistory, due],
    lastDoneHistory: [...lastDoneHistory, lastDoneDate],
  };
}

function pipeResponseHistory(recordCtx, record, evalCtx) {
  if (!record) {
    const responseHistory = [evalCtx.answerQuality];
    return {
      ...recordCtx,
      responseHistory,
    };
  }
  const responseHistory = record.responseHistory;
  responseHistory.push(evalCtx.answerQuality);
  return {
    ...recordCtx,
    responseHistory,
  };
}

// recordCtx needs to have responseHistory
function pipeHealth(recordCtx) {
  return {
    ...recordCtx,
    health: calcNoteHealth(recordCtx.responseHistory),
  };
}

function createNewRecord(userID, note, recordCtx) {
  const recData = {
    userID,
    noteID: note._id,
    noteType: note.type,
    subjectParent: note.parent[0],
  };
  const newRecord = {
    ...recordCtx,
    ...recData,
  };
  return NoteRecord.create(newRecord);
}

export default function pipe(appState) {
  // inspect evalCtx
  // grab current note info from `session.noteQueue[session.queueIndex]`
  // update NoteRecord using note info and evalCtx data

  if (!{}.hasOwnProperty.call(appState, 'evalCtx')) {
    return appState;
  }

  const session = appState.session;

  if (session.state === SessionState.DONE_QUEUE) {
    return appState;
  }

  const note = session.noteQueue[session.queueIndex];
  const evalCtx = appState.evalCtx;
  if (!session.noteQueue || session.noteQueue.length === 0) {
    log('No notes in noteQueue, could not record activity.');
    return appState;
  }

  return NoteRecord.findOne({ userID: appState.userID,
                             noteID: note._id })
  .then(record => {
    let recordCtx = {};
    recordCtx = pipeSpaceRepVals(recordCtx,
                                 record,
                                 evalCtx);


    // record = createNewRecord(appState.userID,
    //                          note,
    //                          recUpdate);

    recordCtx = pipeDates(recordCtx, record);
    recordCtx = pipeResponseHistory(recordCtx, record, evalCtx);
    recordCtx = pipeHealth(recordCtx, record, evalCtx);

    if (record) {
      return record.update(recordCtx).then(() => (
        {
          ...appState,
          recordCtx,
        }
      ));
    }
    // need to create new record
    return createNewRecord(appState.userID,
                           note,
                           recordCtx).then(() => (
                             {
                               ...appState,
                               recordCtx,
                             }
                           ));
  });
}
