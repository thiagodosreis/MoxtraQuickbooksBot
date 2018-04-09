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
    app.get("/api", (req, res) => { api.getAll(req, res, database) });
    app.get("/api/:id/:org", (req, res) => { api.get(req, res, database) });
    app.post("/api", (req, res) => { api.post(req, res, database) });
    app.put("/api/:id/:org", (req, res) => { api.put(req, res, database); });
    app.delete("/api/:id/:org", (req, res)=>{ api.delete(req, res, database) });

    // ******** Webhook interface ***********
    app.post('/webhooks', (req, res, next) => {
        console.log("\n\nPOST Received:"+JSON.stringify(req.body));

        database.getBot(req.body.client_id, req.body.org_id, (err, botApp)=>{
            if(!err){
                bot.verifyRequestSignature(req, res, botApp.secret);
                bot.handlePostRequest(req, res, botApp);
            }else{ console.error(err); } 
        });
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
    
    // app.get("/webhooks", function (req, res, next) {
    //     bot.handleGetRequest(req, res, database, (err, data)=>{
    //         if(!err){
    //             //store information in the browser
    //             res.cookie('user_id', data.user_id);
    //             res.cookie('binder_id', data.binder_id);
    //             res.cookie('org_id', data.org_id);
    //             res.cookie('user_name', data.username);

    //             oauth2.auth(req, res);
    //         }
    //     });
    // });


    // app.get("/oauth2/callback", function (req, res) {
    //     var cookies = cookie.parse(req.headers.cookie || '');

    //     if (!cookies.user_id || !cookies.binder_id || !cookies.org_id) {
    //         console.error("Unable to get user_id, binder_id and org_id from Cookies!");
    //         res.sendStatus(400);
    //     } else {
    //         oauth2.callback(req, res, cookies);
    //     }
    // });

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
    app.set('port', process.env.PORT || 3000);
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
                chat.sendText(`@${username} Welcome to MoxtraBot for Quickbooks!!`);
            });
        });
    
        bot.on('bot_uninstalled', (chat) => {
            const binder_id = chat.binder_id;
            console.log(`Bot uninstalled on ${binder_id}`);
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
    
                if (!conversationObj) {
                    dl.startConversationMS(client, chat.binder_id, function (err, newConversation) {
                        if(!err){
                            //TODO: store the conversation_id and binder_id
                            _conversations[chat.binder_id] = newConversation;
    
                            //Start receiving messages from WS stream - using Node client
                            startReceivingWebSocketClient(newConversation.streamUrl, newConversation.conversationId, chat);
                            
                            //send the message to MS
                            dl.sendMessagesMS(client, newConversation.conversationId, chat);
                        } 
                    });
                } else {
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
                console.error('WebSocket Client Disconnected');
                reconnectWS(chat);
            });
            //***** Receive message from MS and send to Moxtra ***** 
            connection.on('message', function (message) {
                console.log("WebSocket ---> Msg Received for conversationId: " + conversationId);
                console.log("StreamUrl:" + streamUrl);
                !chat && console.error("Sorry, couldn't find the chat obj that originate the message!");

                // Occasionally, the Direct Line service sends an empty message as a liveness ping, Ignore these messages
                if (message.type === 'utf8' && message.utf8Data.length > 0) {
                    var data = JSON.parse(message.utf8Data);
                    // send msg to Moxtra
                    sendMessagesMoxtra(data.activities, chat);

                    //save the conversation watermark
                    if (_conversations[chat.binder_id] && data.watermark) {
                        _conversations[chat.binder_id].watermark = data.watermark;
                        console.log("WATERMARK STORED: " + data.watermark);
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
                            chat.sendText(text, null, null);
                            if(buttons || options){
                                chat.sendText(null, buttons, options);
                            }
                                
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
