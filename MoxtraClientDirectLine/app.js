'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const MoxtraBot = require('moxtra-bot-sdk');
const request = require('request');
const Swagger = require('swagger-client');
const open = require('open');
const rp = require('request-promise');
const OAuth2 = require('./oauth.js');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
var fs = require('fs');

// Microsfot Config settings
var directLineSecret = 'CLP8Y3gh6_I.cwA.Rqo.l01B4Tl4LDi9whTvVnzVUtB6Aw2h5_pAAN0Yu1y-sJQ';
var directLineUserId = 'DirectLineMoxtraClient';
var directLineSpecUrl = 'https://docs.botframework.com/en-us/restapi/directline3/swagger.json';

// Moxtra Config settings
const bot = new MoxtraBot({
  client_id: 'YzIxODgyMzN',
  client_secret: 'ZmE4NzA0OTg',
  api_endpoint: 'https://api.grouphour.com/v1'
// api_endpoint: 'https://apisandbox.moxtra.com/v1' //SANDBOX
// api_endpoint = 'https://api.moxtra.com/v1' //PRODUCTION
// api_endpoint = "https://api.grouphour.com/v1" //DEVELOPMENT-GROUPHOUR
});

// in memory storage
var _conversations = {};
var _binders = {};
var _tokens = {};

bot.on('bot_installed', (chat) => {
  const username = chat.username;  
  // obtain access_token    
  bot.getAccessToken(chat.client_id, chat.org_id, function(error, token) {
	if (error) {
	  // error happens
	} else {
	  chat.setAccessToken(token.access_token);
	  chat.sendText(`@${username} Welcome to MoxtraBot!!`);
	}
  });
});

bot.on('bot_uninstalled', (chat) => {
  const binder_id = chat.binder_id;
  console.log(`Bot uninstalled on ${binder_id}`);
});


// Express Server
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json( { verify: bot.verifyRequestSignature.bind(bot) }));

// default 
app.get('/', (req, res, next) => {
    res.end("Welcome to Moxtra Bot Channel for Microsoft Bot Framework.");
});

// handle post messages from Moxtra Bot
app.post('/webhooks', (req, res, next) => {
    bot.handlePostRequest(req, res, next);
});	

// handle get messages from Moxtra Bot
app.get("/webhooks", function (req, res, next) {  
    console.log("/n/n####01: User clicked in the Singin button");  
    bot.handleGetRequest(req, res, next);
});

// Quickbooks OAuth 2.0 and OpenID
var oauth2 = new OAuth2(bot);
app.get("/oauth2/auth", function (req, res, next) {  
    oauth2.auth(req, res);
});

// create oauth callback endpoint  
app.get("/oauth2/callback", function (req, res) {  
    console.log("####06: Get Quickbooks\' response and Cookies from browser");
    var cookies = cookie.parse(req.headers.cookie || '');

    if(!cookies.user_id || !cookies.binder_id || !cookies.org_id){
        console.error("Unable to get user_id, binder_id and org_id from Cookies!");
        res.sendStatus(400);
    }else{
        
        
        var moxtraobj = {};
        moxtraobj.user_id = cookies.user_id;
        moxtraobj.user_name = cookies.user_name;
        moxtraobj.binder_id = cookies.binder_id;
        moxtraobj.org_id = cookies.org_id;

        console.log("Identify the owner of the token: "+JSON.stringify(moxtraobj));

        oauth2.callback(req, res, moxtraobj);
    }
});  


app.use(function(err, req, res, next) { 
  if (process.env.NODE_ENV !== 'test') { 
    console.error(err.stack);
  }

  var code = err.code || 500;
  var message = err.message;
  res.writeHead(code, message, {'content-type' : 'application/json'});
  res.end(err);
});

app.set('host', process.env.HOST || 'localhost');
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), function() {
  console.log('Server started: http://%s:%s', app.get('host'), app.get('port'));
});

module.exports = app;


// -------------- MS Direct Line Channel ---------------------

var directLineClient = rp(directLineSpecUrl)
    .then(function (spec) {
        // Client
        return new Swagger({
            spec: JSON.parse(spec.trim()),
            usePromise: true
        });
    })
    .then(function (client) {
        // Obtain a token using the Direct Line secret
        return rp({
            url: 'https://directline.botframework.com/v3/directline/tokens/generate',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + directLineSecret
            },
            json: true            
        }).then(function (response) {
            client.clientAuthorizations.add('AuthorizationBotConnector', new Swagger.ApiKeyAuthorization('Authorization', 'Bearer ' + directLineSecret, 'header'));
            return client;            
        });
    })
    .catch(function (err) {
        console.error('Error initializing DirectLine client', err);
        throw err;
    });

// Once the client is ready, listen for msgs from Moxtra 
directLineClient.then(function (client) {
    console.log("Direct Line for Moxtra is running!");

    // Getting the msg from Moxtra Chat and posting to MS Bot
    bot.on('message', (chat) => {
        //1: Gets a conversation for the binder
        var conversationObj = _conversations[chat.binder_id];
        console.log("\n----> Received from MOXTRA Bot Server:"+JSON.stringify(chat.data));

        if (!conversationObj){
            //start a new MS Conversation obj
            startConversationMS(client, chat, function(err, conversation){
                if(!err){
                    //Send the message (activity) to MS
                    sendMessagesMS(client, _conversations[chat.binder_id].conversationId, chat.comment.text, chat.user_id, chat.username, null);
                }
            });
        }else{
            //Send the message (activity) to MS
            sendMessagesMS(client, conversationObj.conversationId, chat.comment.text, chat.user_id, chat.username, null);
        }
    });

    
    bot.on('account_link', (req, res, data) => {
        console.log("/n/n####04: account_link event capturated! Send data to Browser Cookies");
        console.log("data: "+JSON.stringify(data));
          
        // save the user id and binder_id 
        // in the browser cookie to associate with the token in the callback
        res.cookie('user_id', data.user_id);
        res.cookie('binder_id', data.binder_id);
        res.cookie('org_id', data.org_id);
        res.cookie('user_name', data.username);

        console.log("/n/n####05: redirect to /oauth2/auth that will redirect to Quickbooks URI");
        //redirect to OAuth2 GET Endpoint
        res.redirect('/oauth2/auth');
    });

    bot.on('postback', (req, res, data) => {
        console.log("postback event capturated!");
    });

    // after doing OAuth2 against the 3rd party service to obtain a user level access_token
    bot.on('access_token', (accessToken, realmID, moxtraobj, req) => {
        
        //adding more atributes to accessToken obj (accessToken.token)
        accessToken.user_id = moxtraobj.user_id;
        accessToken.user_name = moxtraobj.user_name;
        accessToken.binder_id = moxtraobj.binder_id;
        accessToken.org_id = moxtraobj.org_id;
        accessToken.realmID = realmID;
        
        //store token and data to user in Memory variable
        _tokens[moxtraobj.user_id] = accessToken;
        
        console.log("####08: Get Access token and performing necessary actions");
        console.log('Here is the obj I have: '+JSON.stringify(_tokens[moxtraobj.user_id]));

        //Send the message (activity) to MS
        var conversationObj = _conversations[accessToken.binder_id];
        if (conversationObj){
            sendMessagesMS(client, conversationObj.conversationId, "access_token_received", accessToken.user_id, accessToken.user_name, accessToken);
        }
    });
});

//Starting a new MS Conversation
function startConversationMS(client, chat, callback){
    //start a new MS Conversation obj
    client.Conversations.Conversations_StartConversation()
        .then(function (response) {
            var responseObj = response.obj;
            
            //delete unecessary attributes
            delete responseObj.token;
            delete responseObj.expires_in;
            delete responseObj.referenceGrammarId;

            //add new field for watermark
            responseObj.watermark = 0;

            //store the new MS Conversation obj for future msgs
            _conversations[chat.binder_id] = responseObj;
            
            console.log("\nNew MS Conversation started for binder "+chat.binder_id+": "+ JSON.stringify(responseObj));
            
            // Start receiving messages from WS stream - using Node client
            startReceivingWebSocketClient(responseObj.streamUrl, responseObj.conversationId, chat);
            
            callback(null,responseObj);
        }).catch(function (err) {
            console.log("Error: Starting a new MS conversation for binder "+chat.binder_id+": "+ err);
            callback(err,null);
        });;
}

// Posting the message to MS Bot (activity)
function sendMessagesMS(client, conversationId, input, user_id, user_name, stored_token) {
    //get the In Memory Token and attache to the message
    // var stored_token = _tokens[user_id];
    
    var _token;
    var _realmid;
    if (stored_token){
        _token = stored_token.token;
        _realmid = stored_token.realmID;
    }
    
    // Send message
    client.Conversations.Conversations_PostActivity({
        conversationId: conversationId,
        activity: {
            textFormat: 'plain',
            text: input,
            type: 'message',
            from: {
                channel: "Moxtra_Direct_Line",
                id: user_id,
                name: user_name
            },
            token: _token,
            realmid: _realmid
        }
    }).catch(function (err) {
        console.error('sendMessagesMS Error sending message:', err);
    });
}

function startReceivingWebSocketClient(streamUrl, conversationId, chat) {
    console.log('\nStarting WebSocket Client for ConversationId: ' + conversationId);    
    console.log ("StreamUrl:"+streamUrl);
    var ws = new (require('websocket').client)();

    ws.on('connectFailed', function (error) {
        console.error('WebSocket Connect Error: ' + error.toString());
    });

    ws.on('connect', function (connection) {
        console.log('WebSocket Client Connected');

        connection.on('error', function (error) {
            console.error("Connection Error: " + error.toString());

            //reconnect conversation and get new stream url
            var conversationObj = _conversations[chat.binder_id];
            if(_conversations[chat.binder_id]){
                reconnectConversation(conversationObj.conversationId, conversationObj.watermark, (err, newStreamUrl)=>{
                    if(err){
                        console.log(err);
                    }else{
                        //replace the stream url by the new one
                        conversationObj.streamUrl = newStreamUrl;
                        //start listening for the new web socket
                        startReceivingWebSocketClient(conversationObj.streamUrl,conversationObj.conversationId, chat);
                    }
                });
            }
        });
        connection.on('close', function () {
            console.error('WebSocket Client Disconnected');
            
            //reconnect conversation and get new stream url
            var conversationObj = _conversations[chat.binder_id];
            if(_conversations[chat.binder_id]){
                reconnectConversation(conversationObj.conversationId, conversationObj.watermark, (err, newStreamUrl)=>{
                    if(err){
                        console.log(err);
                    }else{
                        //replace the stream url by the new one
                        conversationObj.streamUrl = newStreamUrl;
                        //start listening for the new web socket
                        startReceivingWebSocketClient(conversationObj.streamUrl,conversationObj.conversationId, chat);
                    }
                });
            }
        });
        connection.on('message', function (message) {

            console.log("WebSocket Msg Received for conversationId: "+conversationId);
            console.log ("StreamUrl:"+streamUrl);
            if(!chat){
                console.error("Sorry, couldn't find the chat obj that originate the message!");
            }

            // Occasionally, the Direct Line service sends an empty message as a liveness ping
            // Ignore these messages
            if (message.type === 'utf8' && message.utf8Data.length > 0) {
                var data = JSON.parse(message.utf8Data);                        
                // send msg to Moxtra
                sendMessagesMoxtra(data.activities, chat);

                //save the conversation watermark
                if(_conversations[chat.binder_id] && data.watermark){
                    _conversations[chat.binder_id].watermark = data.watermark;    
                    console.log("WATERMARK STORED: "+data.watermark);
                }
            }

            //closing an inexistent conversation connection
            if(!_conversations[chat.binder_id] || _conversations[chat.binder_id].conversationId != conversationId
                || _conversations[chat.binder_id].streamUrl != streamUrl){    
                connection.close();
                console.log("CLOSING WEBSOCKET for ConversationID: "+conversationId);
            }
        });
    });
    ws.connect(streamUrl);
}

// Sends the response message back to Moxtra Bot Server
function sendMessagesMoxtra(activities, chat) {
    if (activities && activities.length && chat) {
        // Ignore own messages
        activities = activities.filter(function (m) { return m.from.channel !== "Moxtra_Direct_Line" });
        if (activities.length) {

            // obtain Moxtra access_token    
            bot.getAccessToken(chat.client_id, chat.org_id, function(error, token) {
                if (error) {
                    console.log("sendMessagesMoxtra ERROR getting Moxtra AccessToken: "+error);
                } else {
                    chat.setAccessToken(token.access_token);
                    
                    // Print chat messages
                    for(var i = 0; i <= activities.length-1; i++){
                        console.log('\n'+"<---- Received from MS Bot Server: "+JSON.stringify(activities[i])+'\n');
                        
                        //check if this is the end of the conversation
                        if(activities[i].type == "endOfConversation"){
                            endOfConversationMS(chat.binder_id);
                        }      
                        
                        console.log("activities[i].attachments:"+JSON.stringify(activities[i].attachments));
                        
                        //check for buttons
                        var buttons;
                        if(activities[i].attachments && activities[i].attachments[0].contentType == "application/moxtra.button"){
                            console.log("activities[i].attachments[0].content.buttons:"+activities[i].attachments[0].content.buttons);
                            buttons = activities[i].attachments[0].content.buttons;
                            
                            if(activities[i].attachments[0].content.text){
                                activities[i].text = activities[i].attachments[0].content.text;
                            }
                            console.log("Buttons:"+buttons);
                        }

                        //check for pdf
                        var options = {};
                        if(activities[i].attachments && activities[i].attachments[0].contentType == "application/pdf"){
                            var filename = activities[i].attachments[0].name;
                            var stream = request(activities[i].attachments[0].contentUrl).on('error', (err)=>{
                                    console.error(err);
                                    activities[i].text = "Sorry. I couldn't upload the file.";
                                }).pipe(fs.createWriteStream(__dirname+'/images/'+filename).on('finish', ()=> {
                                    // pipe done here, do something with file
                                    options.file_path = `${__dirname}/images/${filename}`;
                                    console.log("options.file_path:"+options.file_path);

                                    //send the message to Moxtra Binder
                                    chat.sendText("", buttons, options);
                                    }));
                        }else{
                            //send the message to Moxtra Binder
                            chat.sendText(activities[i].text, buttons);
                        }
                    }
                }
            });
        }
    }
    else{
        console.log("Erro printing messages. No Activities or no Chat obj.");
    }
}

// Ends the conversation
function endOfConversationMS(binder_id){
    if (binder_id){
        console.log("Conversation "+_conversations[binder_id].conversationId+" will be deleted!");
        delete _conversations[binder_id];
        console.log("Conversation Deleted!");
        console.log("New _conversations obj:"+JSON.stringify(_conversations));
    }   
}

//check if the Websocket ssl is gone or still valid to listen to
function checkWebSocketConn(streamUrl, callback){
    if(!streamUrl){
        callback("checkWebSocketConn Error. No stream url found.");
        return;
    }

    var httpstreamurl = streamUrl.replace("wss:","http:");

    request({
            method: 'get',
            url: httpstreamurl
        }, function (error, response, body){
            if (error) {
                console.error('checkWebSocketConn API call failed:', error);
                callback(error, null);
            }
            
            var res = JSON.parse(body);

            console.log('Web Socket Connection Status: ', res.error.code);
            console.log('Web Socket Connection StatusCode: ', response.statusCode);
            // if(res.error.code == "TokenExpired"){
            //     callback(null, false);
            // }else{
                callback(null, true);
            // }
        });
}

//reconnect the conversation and get a new Stream URL for the websocket
function reconnectConversation(conversationID, watermark, callback){
    console.log("STARTING TO RECONNECT WEBSOCKETS");
    request({
            method: 'get',
            url: "https://directline.botframework.com/v3/directline/conversations/"+conversationID+"?watermark="+watermark,
            headers: {'Authorization': 'Bearer '+directLineSecret}
        }, function (error, response, body){
            if (error) {
                console.error('reconnectConversation: API call failed:', error);
                callback(error, null);
            }else{
                var res = JSON.parse(body);
                console.log("Conversation RECONNECTED. Got new stream url: "+res.streamUrl);
                callback(null, res.streamUrl);
            }
        });
}
