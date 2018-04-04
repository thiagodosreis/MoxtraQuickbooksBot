// ******** MS Direct Line functions *************
const rp = require('request-promise');
const Swagger = require('swagger-client');
const request = require('request');


var directLineSecret = process.env.DL_SECRET;
var directLineUserId = 'DirectLineMoxtraClient';
var directLineSpecUrl = 'https://docs.botframework.com/en-us/restapi/directline3/swagger.json';

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


module.exports = {

    connect: directLineClient,

    //Two steps: 1 Starting a new MS Conversation and 2. Open WebSocket
    startConversationMS: (client, binder_id, callback) => {
        //start a new MS Conversation obj
        client.Conversations.Conversations_StartConversation()
            .then(function (response) {
                var responseObj = response.obj;
                console.log("Started New Conversation Object for binder " + binder_id + ": " + JSON.stringify(responseObj));

                //delete unecessary attributes
                delete responseObj.token;
                delete responseObj.expires_in;
                delete responseObj.referenceGrammarId;

                //add new field for watermark
                responseObj.watermark = 0;

                callback(null, responseObj);
            }).catch(function (err) {
                console.log(`Error: Starting NEW MS Conversation for binder: ${binder_id}: ${err} `);
                callback(err, null);
            });;
    },

    // Posting the message to MS Bot (activity)
    sendMessagesMS:  (client, conversationId, msg, user_id, user_name) => {
        // Send message
        client.Conversations.Conversations_PostActivity({
            conversationId: conversationId,
            activity: {
                textFormat: 'plain',
                text: msg,
                type: 'message',
                from: {
                    channel: "Moxtra_Direct_Line",
                    id: user_id,
                    name: user_name
                },
                client_id: "123",
                org_id: "1111",
                binder_id: "XXXXX"
            }
        }).catch(function (err) {
            console.error('sendMessagesMS Error sending message:', err);
        });
    },


    //reconnect the conversation and get a new Stream URL for the websocket
    reconnectConversation: (conversationID, watermark, callback) => {
        console.log("STARTING TO RECONNECT WEBSOCKETS");
        request({
            method: 'get',
            url: "https://directline.botframework.com/v3/directline/conversations/" + conversationID + "?watermark=" + watermark,
            headers: { 'Authorization': 'Bearer ' + directLineSecret }
        }, function (error, response, body) {
            if (error) {
                console.error('reconnectConversation: API call failed:', error);
                callback(error, null);
            } else {
                var res = JSON.parse(body);
                console.log("Conversation RECONNECTED. Got new stream url: " + res.streamUrl);
                callback(null, res.streamUrl);
            }
        });
    },

    //check if the Websocket ssl is gone or still valid to listen to
    checkWebSocketConn: (streamUrl, callback) => {
        if (!streamUrl) {
            callback("checkWebSocketConn Error. No stream url found.");
            return;
        }

        var httpstreamurl = streamUrl.replace("wss:", "http:");

        request({
            method: 'get',
            url: httpstreamurl
        }, function (error, response, body) {
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

}

