//********* Quickbooks API Call ***************//
const Token = require('./token');
const fs = require('fs');
const util = require('util');

module.exports = {
    //Call QuickBooks APIs: Generic Invoice Query Function
    queryQuickbooks: (session, query, callback)=>{
        var error = {};

        //check for User's Token
        if(!Token.getToken(session.message.user.id)){
            callback('no_token', null);
            return;
        }

        const token = Token.getToken(session.message.user.id).token;
        const realmId = Token.getToken(session.message.user.id).realmId;

        if(!token || !realmId || !query){
            error.code = 999;
            error.msg = "Missing parameters for queryQuickbooks."

            console.error(error.msg);
            callback(error,null);
        }

        const _url = baseurl+"/v3/company/"+realmId+"/query?query="+query;
        
        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + token.access_token,
                          'Accept': 'application/json'}
            }, function (err, response, body){
                if (err) {
                    error.code = 888;
                    error.msg = 'queryQuickbooks: API call failed:', err;
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        Token.storeToken(session.message.user.id, null);

                        error.code = response.statusCode;
                        error.msg = "queryQuickbooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                        return;
                    }

                    var res = JSON.parse(body);
                    // console.log("queryQuickbooks body:"+JSON.stringify(body));
                    callback(null, res.QueryResponse);
                }
            });
    },

    //Call QuickBooks APIs: Generic Invoice Update Function
    updateQuickBooks: (session, updateFields, type, callback)=>{
        var error = {};

        //check for User's Token
        if(!Token.getToken(session.message.user.id)){
            callback('no_token', null);
            return;
        }

        const token = Token.getToken(session.message.user.id).token;
        const realmId = Token.getToken(session.message.user.id).realmId;

        if(!token || !realmId || !session || !updateFields || !type){
            error.code = 999;
            error.msg = "Missing parameters for updateQuickBooks."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+realmId+"/"+type;
        
        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + token.access_token,
                            'Accept': 'application/json'},
                json: updateFields
            }, function (err, response, body){
                if (err) {
                    error.code = 888;
                    error.msg = 'updateQuickBooks: API call failed:'+ err;
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        Token.storeToken(session.message.user.id, null);

                        error.code = response.statusCode;
                        error.msg = "updateQuickBooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                    }else{//sucess
                        callback(null, response.body);
                    }
                }
            });
    },


    getReports: function (session, reportUrl, callback){
        //check for User's Token
        if(!Token.getToken(session.message.user.id)){
            callback('no_token', null);
            return;
        }

        const token = Token.getToken(session.message.user.id).token;
        const realmId = Token.getToken(session.message.user.id).realmId;

        if(!token || !realmId || !session){
            error.code = 999;
            error.msg = "Missing parameters for updateQuickBooks."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+realmId+"/reports/"+reportUrl;

        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + token.access_token,
                            'Accept': 'application/json'}
            }, function (error, response, body){
                if (error) {
                    console.error('readQuickbooks: API call failed:', error);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        session.userData.token = null;

                        //begin dialog for login again
                        session.beginDialog("login");

                        callback("readQuickbooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!", null);
                        return;
                    }

                    var res = JSON.parse(body);
                    //callback(null, res.QueryResponse);
                    callback(null, res);
                }
            });
    },

    //Call QuickBooks APIs for Search Estimate
    getPDF: (session, id, docNum, type, callback)=>{

        //check for User's Token
        if(!Token.getToken(session.message.user.id)){
            callback('no_token', null);
            return;
        }

        const token = Token.getToken(session.message.user.id).token;
        const realmId = Token.getToken(session.message.user.id).realmId;

        if(!token || !realmId || !id || !type){
            error.code = 999;
            error.msg = "Missing parameters for queryQuickbooks."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+realmId+"/"+type+"/"+id+"/pdf";
        var today = new Date();
        var filename = docNum + "_"+type+"_" + today.getDate() + ".pdf";
        var file = fs.createWriteStream(__dirname+'/../pdfs/'+filename);

        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + token.access_token,
                            'Content-Type': 'application/pdf'}
            }).on('error', (err)=>{
                console.error('getPDF: API call failed:', error);
                callback(error, null);
            }).pipe(file).on('close',()=>{
                sendInline(session, __dirname+'/../pdfs/'+filename, 'application/pdf', filename);
            });
    },

    //Pretending to be the DL Channel sending a message to Bot to get the return of OAuth 2.0 (Token)
    postMessageDL: (message, user_id, user_name, conversationId, callback)=>{
        const baseurl = "https://directline.botframework.com/v3/directline/conversations/";
        const _url = baseurl+conversationId+"/activities";
        const directLineSecret = process.env.DL_SECRET;

        const post_json = {
            type: "message",
            serviceUrl: "https://directline.botframework.com/",
            channelId: "directline",
            from: {
                        id: user_id,
                        name: user_name,
                        channel: "Moxtra_Direct_Line"
                    },
            conversation: {
                        id: conversationId
                    },
            textFormat: "plain",
            token: "1273737373",
            realmid: "ABC",
            text: message
        }

        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + directLineSecret,
                            'Accept': 'application/json'},
                json: post_json
            }, function (err, response, body){
                
                console.log("createReceipt body:"+JSON.stringify(body));
                console.log("createReceipt response.statusCode:"+response.statusCode);

                if (err) {
                    console.error(error);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        console.log('Error: status not 200');
                        return;
                    }else{//sucess
                        callback(null, response.body);
                    }
                }
            });
    },

    // Sends attachment inline in base64
    sendInline: sendInline
}

function sendInline(session, filePath, contentType, attachmentFileName){
    fs.readFile(filePath, function (err, data) {
        if (err) {
            return session.send('Oops. Error reading file:'+err);
        }
        var base64 = Buffer.from(data).toString('base64');
        var msg = new builder.Message(session)
            .addAttachment({
                contentUrl: util.format('data:%s;base64,%s', contentType, base64),
                contentType: contentType,
                name: attachmentFileName
            });
        session.endDialog(msg);

        //delete the file
        fs.unlinkSync(filePath);
    });
}
