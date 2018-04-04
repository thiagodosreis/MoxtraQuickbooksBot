'use strict';

const Chat = require('./chat');
const EventEmitter = require('eventemitter3');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const URLSafeBase64 = require('urlsafe-base64');
const bodyParser = require('body-parser');

class MoxtraBot extends EventEmitter {
  constructor() {
    super();
  }
}

// say as the generic way to send message
MoxtraBot.prototype.say = function (access_token, message, options) {

  const chat = new Chat(this);
  chat.access_token = access_token;

  if (typeof message === 'string') {
    return chat.sendText(message, null, options);
  } else if (message && message.richtext) {
    return chat.sendRichText(message.richtext, message.text, message.buttons, options);
  } else if (message && message.text) {
    return chat.sendText(message.text, message.buttons, options);
  } else if (message && message.fields) {
    return chat.sendJSON(message.fields, message.buttons, options);
  }

  console.error('Incorrect say message format!');
}

MoxtraBot.prototype.decodeJwt = function(req, callback){
  try {
    const decoded = jwt.decode(req.query['account_link_token']);
    callback(null, decoded);
  } catch (err) {
    callback('Unable to decode jwt!'+error, null);
  }
}

// handle http GET + jwtVerify
MoxtraBot.prototype.handleGetRequest = function (req, res, database, callback) {
  if (req.query['message_type'] === 'account_link') {
    var account_link_token = req.query['account_link_token'];

    //first decode
    const decoded = jwt.decode(account_link_token);
    if(!decoded){
      res.status(412)
      res.send('No token received!');
      return;
    }

    //then get secret from DB
    database.getBot(decoded.client_id, decoded.org_id, (err, botApp)=>{
      if(!err){
          //check the jwt signature using DB Secret
          jwt.verify(account_link_token, botApp.secret, (err, obj)=>{
            if(err){
              res.status(500);
              res.send('Wrong jwt signature!');
            }else{
              //return the moxtra binder obj
              callback(null, obj);
            }
          });
          
      }else{
        res.status(500);
        res.send('Bot not registered! '+err);
      } 
    });
  } else {
    res.status(400);
    res.send('Missing information.');
  }
};

// handle Http POST
MoxtraBot.prototype.handlePostRequest = function (req, res, botApp) {
  var data = req.body;
  if (data == null) {
    res.sendStatus(404);
    return;
  }
  res.sendStatus(200);

  let type = data.message_type;
  switch (data.message_type) {
    case "comment_posted":
    case "comment_posted_on_page":
      type = 'message';
      break;

    case "bot_postback":
      type = data.event.postback.text ? `postback:${data.event.postback.text}` : 'postback';
      break;
  }

  this.emit(type, new Chat(this, data, botApp));
};

// verify Moxtra request signature
MoxtraBot.prototype.verifyRequestSignature = function (req, res, secret) {
  const buf = JSON.stringify(req.body);
  
  var signature = req.headers['x-moxtra-signature'];
  if (!signature) {
    console.log("No signature to validate!");
    this.emit('error', "Validation on the request signature failed!");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];
    var expectedHash = crypto.createHmac('sha1', new Buffer(secret)).update(new Buffer(buf, 'utf8')).digest('hex');

    if (signatureHash != expectedHash) {
      // throw new Error("Validation on the request signature failed!");
      this.emit('error', "Validation on the request signature failed!");
    }else{
      console.log("Got the right signature!!");
    }
  }
};

// generate new AccessToken
MoxtraBot.prototype.genAccessToken = function (bot, callback) {
  console.log("GENERATING NEW MOXTRA TOKEN!");

  const timestamp = (new Date).getTime();
  const buf = bot._id + bot.org_id + timestamp;
  const sig = crypto.createHmac('sha256', new Buffer(bot.secret)).update(buf).digest();
  const signature = URLSafeBase64.encode(sig);
  const url = bot.endpoint + '/apps/token?client_id=' + bot._id + '&org_id=' + bot.org_id + '&timestamp=' + timestamp + '&signature=' + signature;

  console.log("Moxtra Token Url: " + url);

  fetch(url)
    .then(response => {
      response.json().then(json => {
        bot.token = {};        
        bot.token.access_token = json.access_token;
        bot.token.expired_time = timestamp + parseInt(json.expires_in) * 1000;

        console.log("New token:"+JSON.stringify(bot.token));

        callback(null, bot.token);
      });
    })
    .catch(error => {
      console.log(error);
      callback(error, null);
    });

};

// verify if still valid
MoxtraBot.prototype.isTokenValid = (token) => {
  console.log("VALIDATING MOXTRA TOKEN!");
  if (token) {
    const timestamp = (new Date).getTime();
    console.log('timestamp: ' + timestamp + ' expired_time: ' + token.expired_time);
    return timestamp < token.expired_time;
  }else{
    return false;
  }
}


module.exports = MoxtraBot;
