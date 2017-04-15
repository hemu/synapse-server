/**

 Depends on a simRecordID field being set by pipe_record_sim_stats

**/

import { Simulation, NoteRecord } from '~/db/collection';

function getAllNoteRecords(userID, subjectID) {
  // dont query info notes
  return NoteRecord.find({
    userID,
    subjectParent: subjectID,
    noteType: { $ne: 'info', },
  });
}

function updateSimRecord(appState) {
  const { userID, subjectID, session, } = appState;
  return getAllNoteRecords(userID, subjectID).then(recs => {
    const recsByNoteID = {};
    const counts = [];
    const intervals = [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (rec && rec.noteID) {
        counts.push(rec.count);
        intervals.push(rec.interval);
        recsByNoteID[rec.noteID.toString()] = rec.count;
      }
    }

    const simStep = session.simulator.step;
    const simRec = session.simRecords[simStep];
    simRec.noteRecords = {
      counts,
      intervals,
    };
    session.simulator.noteRecordsMap = recsByNoteID;

    return appState;

    // return Simulation.findByIdAndUpdate(simRecordID, {
    //   // $set: { noteRecords: recsByNoteID, },
    //   $set: {
    //     noteRecords: recs,
    //     noteRecordsMap: recsByNoteID,
    //   },
    // }).then(() => recsByNoteID);
  });
}

export default function pipe(appState) {
  const { session, } = appState;
  const simStep = session.simulator.step;

  if (session.simRecords && session.simRecords[simStep]) {
    return updateSimRecord(appState);
  }

  return appState;

  // return updateSimRecord(appState).then(noteRecordsMap => ({
  //   ...appState,
  //   session: {
  //     ...appState.session,
  //     simulator: {
  //       ...appState.session.simulator,
  //       noteRecordsMap,
  //     },
  //   },
  // }));
}