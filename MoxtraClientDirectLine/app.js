'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const cookie = require('cookie');
const fs = require('fs');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const MoxtraBot = require('./modules/moxtra-bot-sdk/MoxtraBot');
// const OAuth2 = require('./modules/moxtra-bot-sdk/oauth');
const database = require('./modules/database');
const api = require('./modules/api-handler');
const dl = require("./modules/direct-line");    

// in memory storage
var _conversations = {};

const bot = new MoxtraBot();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// default 
app.get('/', (req, res, next) => {
    res.end("Welcome to Moxtra Bot Channel for Microsoft Bot Framework.");
});


//initialize connection to DB
database.connect(() => {

    // ******** API interface ***********
    //Bots
    app.get("/api/bot", (req, res) => { api.getAllBots(req, res, database) });
    app.get("/api/bot/:id/:org", (req, res) => { api.getBot(req, res, database) });
    app.post("/api/bot", (req, res) => { api.postBot(req, res, database) });
    app.put("/api/bot/:id/:org", (req, res) => { api.putBot(req, res, database); });
    app.delete("/api/bot/:id/:org", (req, res)=>{ api.deleteBot(req, res, database) });
    //Users
    // app.get("/api/users/:id/:org", (req, res) => { api.get(req, res, database) });

    // ******** Webhook interface ***********
    app.post('/webhooks', (req, res, next) => {
        console.log("\n\nPOST Received:"+JSON.stringify(req.body));
        var client_id = req.body.client_id;
        var org_id = req.body.org_id;
        
        if(client_id && org_id){
            database.getBot(req.body.client_id, req.body.org_id, (err, botApp)=>{
                if(!err){
                    bot.verifyRequestSignature(req, res, botApp.secret);
                    bot.handlePostRequest(req, res, botApp);
                }else{ 
                    console.error(err); 
                    res.status(200);
                    res.send("Error");
                } 
            });
        }else{
            res.sendStatus(200);
        }
    });

    // ******** OAuth2.0 interface ***********
    // var oauth2 = new OAuth2(bot);
    app.get("/webhooks", function (req, res, next) {
        bot.handleGetRequest(req, res, database, (err, data)=>{
            try{
                if(!err && _conversations[data.binder_id]){
                    res.redirect(process.env.BOT_SERVER + '/oauth2?token='+
                                    req.query['account_link_token']+
                                    "&conversationid="+_conversations[data.binder_id].conversationId);
                }
            }
            catch(err){
                console.log(err);
            }
            
        });
    });

    // ******** Error handler ***********
    app.use(function (err, req, res, next) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(err.stack);
        }

        var code = err.code || 500;
        var message = err.message;
        res.writeHead(code, message, { 'content-type': 'application/json' });
        res.end(err);
    });

    // ******** Start Server ***********
    app.set('host', process.env.HOST || 'localhost');
    app.set('port', process.env.PORT || 3001);
    app.listen(app.get('port'), function () {
        console.log('Server started: http://%s:%s', app.get('host'), app.get('port'));
    });

    // Listen from Moxtra 
    dl.connect.then(function (client) {
        console.log("Direct Line for Moxtra is running!");

        bot.on('bot_installed', (chat) => {
            console.log("bot_installed");
            const username = chat.username;
    
            getMoxtraToken(chat.botApp, (token)=>{
                chat.setAccessToken(token.access_token);    
                chat.sendText(`[b][size=14]Welcome to Quickbooks Bot![/size][/b]\n
                    [b]@${username}[/b], to get started, I'll need to connect to your account.`);

                chat.comment = { text: "login" };
                sendMessagesMS(chat);
            });

            // chat.comment = { text: "welcome" };
            // sendMessagesMS(chat);
        });
    
        bot.on('bot_uninstalled', (chat) => {
            // const binder_id = chat.binder_id;
            // console.log(`Bot uninstalled on ${binder_id}`);

            getMoxtraToken(chat.botApp, (token)=>{
                chat.setAccessToken(token.access_token);    
                chat.sendText(`Thank you for using Quickbooks Bot. See you later!`);
            });
        });
    
        bot.on('bot_postback', (chat) => {
            sendMessagesMS(chat);
        });
    
        //***** receive message from Moxtra and send to MS ***** 
        bot.on('message', (chat) => {
            sendMessagesMS(chat);
        });

        function sendMessagesMS(chat){
            var conversationObj = _conversations[chat.binder_id];
                console.log("\n----> Received from MOXTRA Bot Server:" + JSON.stringify(chat.data));
    
                //create a new ConversationId, get the StreamURL and start listening for WebSocket
                if (!conversationObj) {
                    dl.startConversationMS(client, chat.binder_id, function (err, newConversation) {
                        console.log("Creating new conversation for binder: "+chat.binder_id);

                        if(!err){                        
                            //TODO: store the conversation_id and binder_id
                            _conversations[chat.binder_id] = newConversation;
    
                            //Start receiving messages from WS stream - using Node client
                            startReceivingWebSocketClient(newConversation.streamUrl, newConversation.conversationId, chat);
                            
                            //send the message to MS
                            dl.sendMessagesMS(client, newConversation.conversationId, chat);
                        } 
                    });
                } 
                //Websocket closed, use the current ConversationId, get the New StreamURL and start listening for WebSocket
                else if(conversationObj.suspended){
                    console.log("Reconnecting existing conversation! Getting StreamUrl to old conversation: "+conversationObj.conversationId);
                    
                    dl.reconnectConversation(conversationObj.conversationId, conversationObj.watermark, (err, streamUrl)=>{
                    
                        console.log("NEW StreamUrl:" + streamUrl);
                        _conversations[chat.binder_id].streamUrl = streamUrl;
                        _conversations[chat.binder_id].suspended = false;

                        //Start receiving messages from WS stream - using Node client
                        startReceivingWebSocketClient(streamUrl, conversationObj.conversationId, chat);
                        
                        //send the message to MS    
                        dl.sendMessagesMS(client, conversationObj.conversationId, chat);
                    });
                }
                //websocket still opened and valid
                else{
                    console.log("Already have an open conversation: _conversations[chat.binder_id]"+JSON.stringify(_conversations[chat.binder_id]));

                    //send the message to MS
                    dl.sendMessagesMS(client, conversationObj.conversationId, chat);
                }
        }
    });



    // Listen from MS Bot Server 
    function startReceivingWebSocketClient(streamUrl, conversationId, chat) {
        console.log('\nStarting WebSocket Client for ConversationId: ' + conversationId+ "\nStreamUrl:" + streamUrl);
        
        var ws = new (require('websocket').client)();

        ws.on('connectFailed', function (error) {
            console.error('WebSocket Connect Error: ' + error.toString());
        });

        ws.on('connect', function (connection) {
            console.log('WebSocket Client Connected');

            connection.on('error', function (error) {
                console.error("Connection Error: " + error.toString());
            });

            connection.on('close', function () {
                _conversations[chat.binder_id].suspended = true;
                console.info('WebSocket Client Disconnected for conversationId:'+conversationId);
                // reconnectWS(chat);
            });
            //***** Receive message from MS and send to Moxtra ***** 
            connection.on('message', function (message) {
                console.log("WebSocket ---> Msg Received for conversationId: " + conversationId);
                console.log("StreamUrl:" + streamUrl);
                // console.log("message:" + JSON.stringify(message));
                !chat && console.error("Error! I couldn't find the chat obj that originate the message!");

                // Occasionally, the Direct Line service sends an empty message as a liveness ping, Ignore these messages
                if (message.type === 'utf8' && message.utf8Data.length > 0) {
                    var data = JSON.parse(message.utf8Data);
                    // send msg to Moxtra
                    sendMessagesMoxtra(data.activities, chat);

                    //save the conversation watermark and timestamp
                    if (_conversations[chat.binder_id] && data.watermark) {
                        _conversations[chat.binder_id].watermark = data.watermark;
                        console.log("WATERMARK STORED: " + data.watermark);

                        //add timestamp
                        _conversations[chat.binder_id].timestamp = new Date().toISOString();
                        console.log("LAST MSG TIMESTAMP STORED: " + _conversations[chat.binder_id].timestamp );
                    }
                }else if(message.type === 'utf8' && message.utf8Data.length == 0){
                    //keep alive msg: {"type":"utf8","utf8Data":""}
                    
                    var last_msg_time = new Date(_conversations[chat.binder_id].timestamp);
                    var now = new Date();
                    var minutes = (now.getTime() - last_msg_time.getTime()) / 1000 / 60
                    
                    // console.log("last_msg_time"+ last_msg_time);
                    // console.log("now"+ now);
                    // console.log("minutes"+ minutes);
                    // console.log("process.env.WEBSOCKET_TIMEOUT_MIN:"+process.env.WEBSOCKET_TIMEOUT_MIN);

                    //checking the time of open websocket
                    if(minutes > process.env.WEBSOCKET_TIMEOUT_MIN){
                        _conversations[chat.binder_id].suspended = true;
                        
                        //close old opened WebSockets connection, but keeping the track of conversation
                        connection.close();
                    }
                }

                //closing an inexistent conversation connection
                if (!_conversations[chat.binder_id] || _conversations[chat.binder_id].conversationId != conversationId
                    || _conversations[chat.binder_id].streamUrl != streamUrl) {
                    connection.close();
                    console.log("CLOSING WEBSOCKET for ConversationID: " + conversationId);
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
                getMoxtraToken(chat.botApp, (token)=>{
                    chat.setAccessToken(token.access_token);    
                    

                    for (var i = 0; i <= activities.length - 1; i++) {
                        console.log('\n' + "---- < Received from MS Bot Server: " + JSON.stringify(activities[i]));

                        //check if this is the end of the conversation
                        if (activities[i].type == "endOfConversation") {
                            endOfConversationMS(chat.binder_id);
                        }

                        formatMoxtraMsg(activities[i], (text, buttons, options)=>{
                            // chat.sendText(text, null, null);
                            // if(buttons || options){
                                chat.sendText(text, buttons, options);
                            // }
                                
                        });
                    }
                });                        
            }
        }
        else {
            console.log("Erro printing messages. No Activities or no Chat obj.");
        }
    }

    function formatMoxtraMsg(activity, callback){

        console.log("\n\nactivity:"+JSON.stringify(activity));

        //check for buttons
        var buttons;        
        if (activity.attachments && activity.attachments[0].contentType == "application/moxtra.button") {
            buttons = activity.attachments[0].content.buttons;
            if (activity.attachments[0].content.text) {
                activity.text = activity.attachments[0].content.text;
            }
        }

        //check for pdf
        var options = {};
        if (activity.attachments && activity.attachments[0].contentType == "application/pdf") {
            var filename = activity.attachments[0].name;
            var stream = request(activity.attachments[0].contentUrl).on('error', (err) => {
                console.error(err);
                activity.text = "Sorry. I couldn't upload the file.";
            }).pipe(fs.createWriteStream(__dirname + '/images/' + filename).on('finish', () => {
                // pipe done here, do something with file
                options.file_path = `${__dirname}/images/${filename}`;
                //send the message to Moxtra Binder
                callback(activity.text, buttons, options);
            }));
        } else {
            //send the message to Moxtra Binder
            callback(activity.text, buttons);
        }
    }

    // Delete Conversation X Binder from Memory
    function endOfConversationMS(binder_id) {
        if (binder_id) {
            console.log(`Conversation ${_conversations[binder_id].conversationId} Deleted from memory!`);
            delete _conversations[binder_id];
        }
    }

    //reconnect Web Socket and try to get conversation and new stream url
    function reconnectWS(chat){
        var conversationObj = _conversations[chat.binder_id];
        if (conversationObj) {

            console.log("\nReconnecting a Web Socket for ConversationId: "+conversationObj.conversationId);
            dl.reconnectConversation(conversationObj.conversationId, conversationObj.watermark, (err, newStreamUrl) => {
                if (err) {
                    console.log(err);
                } else {
                    //replace the stream url by the new one
                    conversationObj.streamUrl = newStreamUrl;
                    //start listening for the new web socket
                    startReceivingWebSocketClient(conversationObj.streamUrl, conversationObj.conversationId, chat);
                }
            });
        }
    }

    //will always return a valid token
    function getMoxtraToken(botapp, callback){
        //token has expired or doens't exist
        if(!bot.isTokenValid(botapp.token)){
            try{
                //generate a new token
                bot.genAccessToken(botapp, (err, token)=>{
                    assert.equal(null, err);

                    console.log("Updating DataBase");
                    //update the new token in the DB
                    database.updateBotToken(botapp._id, botapp.org_id, token, (result)=>{
                        if(!result){
                            console.log("Not possible to store the token!");
                            callback(null);
                        }else{
                            //return the new token
                            callback(token);
                        }
                    });
                });
            }
            catch(err){
                console.log("Error storing the token:"+err);
                callback(null);
            }
        }else{
            callback(botapp.token);
        }
    }

});
