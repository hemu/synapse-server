import Account from '../../account/account';
import Input from '../../core/input';
import { sendText } from './fbmessenger_request';
import MessageType from './fbmessage_type';

// Adapter for parsing incoming requests and responding
// if user is using Facebook Messenger platform.

// Process senderID in messageData and convert to
// proper app userID. For example, in facebook messenger,
// the userID is initially a facebook ID. This needs to be
// associated with the proper userID stored for this app.
// `msgData` is Immututable.Map()
function senderToUser(msgData) {
  const fbUserID = msgData.senderID;
  if (!fbUserID) {
    throw new Error('Could not find senderID, could not convert to user');
  } else {
    return Account.getUserByFacebookMsgID(fbUserID)
      .then((user) => {
        if (!user) {
          return {
            ...msgData,
            userID: null,
          };
        }
        return {
          ...msgData,
          userID: user._id,
        };
      });
  }
}

// create user based with new Facebook Messenger
// specific ID. `msgData` is Immututable.Map()
function createUser(msgData) {
  const fbUserID = msgData.senderID;
  if (!fbUserID) {
    return Promise.error(null);
  }
  return Account.createUserWithFacebookMsgID(fbUserID)
  .then((user) => ({
    ...msgData,
    userID: user._id,
  }));
}

function getMsgType(msg) {
  if ('message' in msg) {
    return MessageType.TEXT;
  }
  if ('postback' in msg) {
    return MessageType.POSTBACK;
  }
  return MessageType.UNKNOWN;
}

// return a function that properly extracts content
// based on given `msgType`
function contentExtractor(msgType) {
  // return prop nested inside parent
  function getNestedProp(parent, prop) {
    return (obj) => obj[parent][prop];
  }
  const extMap = {};
  extMap[MessageType.TEXT] = getNestedProp('message', 'text');
  extMap[MessageType.POSTBACK] = getNestedProp('postback', 'payload');
  extMap[MessageType.UNKNOWN] = () => null;
  return extMap[msgType];
}

function stripChoiceNum(choice) {
  const c = choice.split('-');
  const cnum = parseInt(c[c.length - 1], 10);
  return cnum;
}

// return a function that properly adds content to a
// given Immut.Map object based on given `msgType`
function contentInjector(msgType) {
  if (msgType === MessageType.TEXT) {
    return (msg, content) => (
      {
        ...msg,
        input: {
          type: Input.Type.CUSTOM,
          data: content,
        },
      }
    );
  } else if (msgType === MessageType.POSTBACK) {
    return (msg, content) => {
      let mtype = null;
      let dataVal = null;

      if (content === 'accept') {
        mtype = Input.Type.ACCEPT;
      } else if (content === 'reject') {
        mtype = Input.Type.REJECT;
      } else {
        mtype = Input.Type.CUSTOM;
        if (~content.indexOf('choice-')) {
          // if 'choice-' is in content, it was a payload representing
          // a predefined choice made by user, so strip out choice num
          dataVal = stripChoiceNum(content);
        } else {
          // just set data to entirety of input text
          dataVal = content;
        }
      }
      return {
        ...msg,
        input: {
          type: mtype,
          data: dataVal,
        },
      };
    };
  }

  return (msg) => (
    {
      ...msg,
      input: {
        type: Input.Type.UNKNOWN,
        data: null,
      },
    }
  );
}

// Parse incoming POST request and return an Immut.Map
// object with standard message data
function parse(request) {
  const entry = request.entry[0];
  const msg = entry.messaging[0];

  // TODO: Need to dynamically get this from request
  const HARDCODED_SUBJ_NAME = 'crash-course-biology';

  const initMsgData = {
    timestamp: msg.timestamp,
    senderID: msg.sender.id,
    subjectName: HARDCODED_SUBJ_NAME,
    input: null,
  };

  const msgType = getMsgType(msg);
  const content = contentExtractor(msgType)(msg);
  const finalMsgData = contentInjector(msgType)(initMsgData, content);
  return finalMsgData;
}

function sendMessage(userID, evalContext, callback) {
  // convert userID to fbID
  const fbID = userID;
  sendText(fbID, 'dummy text', callback);
}

const AdapterFBMessenger = {
  senderToUser,
  createUser,
  parse,
  sendMessage,
};

export default AdapterFBMessenger;
