import DBAssist from '~/db/category_assistant';
import { log, logErr, logState } from '~/logger';
import pipeAddSession from '~/controller/pipe_add_session';
import pipeRecord from '~/controller/pipe_record';
import pipeSimEval from '~/admin/simulator/pipe_sim_eval';
import pipeAdvanceSimState from '~/admin/simulator/pipe_advance_sim_state';
import pipeSaveSession from '~/controller/pipe_save_session';
import pipeStudentModel from '~/controller/pipe_student_model';
import pipeAdjustQueue from '~/controller/pipe_adjust_queue';
import pipeAddPaths from '~/controller/pipe_add_paths';

// `msg` = {
//   timestamp  : ""
//   senderID   : "",
//   text       : "",
//   action     : ""
// }

export default class SimulatorController {
  // for simulator, senderID should just be same as userID
  pipeUser(appState) {
    return Promise.resolve({
      ...appState,
      userID: appState.senderID,
    });
  }

  sendResponse(state) {
    return state;
  }

  // msg should have additional simulator params
  registerMsg(msg) {
    return DBAssist.getCategoryByName('subject', msg.subjectName)
      .then(subject => {
        if (!subject) {
          throw new Error(`Could not find subject ${msg.subjectName}`);
        } else {
          const appState = {
            ...msg,
            subjectID: subject._id,
          };
          // convert adapter specific sender id into app user
          return (
            this.pipeUser(appState)
              // at this point should have app user information
              .then(state => pipeAddSession(state))
              // at this point should have session information
              // need to evaluate msg in context of current state
              .then(state => pipeSimEval(state))
              // .then(state => this.sendFeedbackResponse(state))
              // persist results of msg evaluation
              .then(state => pipeRecord(state))
              // adjust queue based on evaluation
              .then(state => pipeAdjustQueue(state))
              // advance session state
              .then(state => pipeAdvanceSimState(state))
              .then(state => pipeAddPaths(state))
              // record new session state
              .then(state => pipeSaveSession(state))
              // .then(state => logState(state))
              .then(state => {
                // don't include this in return chain because this final update
                // can happen asynchronously
                pipeStudentModel(state);
                return this.sendResponse(state);
              })
          );
        }
      })
      .catch(err => {
        logErr('error registering message in controller');
        logErr(err);
      });
  }
}
