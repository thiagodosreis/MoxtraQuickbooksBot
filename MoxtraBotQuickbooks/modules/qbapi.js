//********* Quickbooks API Call ***************//
const Token = require('./token');
const fs = require('fs');
const util = require('util');

module.exports = {
    //Call QuickBooks APIs: Generic Invoice Query Function
    queryQuickbooks: (session, query, callback)=>{
        var error = {};

        console.log("\nQuery QuickBooks:\n"+query);

        //check for User's Token
        Token.getToken(session.message.user.id,(err, dbtoken)=>{
            if(!dbtoken){
                callback('no_token', null);
                return;
            }

            if(!session || !query){
                error.code = 999;
                error.msg = "Missing parameters for queryQuickbooks."
    
                console.error(error.msg);
                callback(error,null);
                return;
            }

            const _url = baseurl+"/v3/company/"+dbtoken.realmId+"/query?query="+query;
        
            request({
                    method: 'get',
                    url: _url,
                    headers: {'Authorization': 'Bearer ' + dbtoken.token.access_token,
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
                            Token.storeToken(session.message.user.id, null,(err, result)=>{
                                if(err){
                                    callback(err, null);
                                    return;
                                }

                                error.code = response.statusCode;
                                error.msg = "updateQuickBooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                                callback(error, null);
                            });
                        }

                        var res = JSON.parse(body);
                        // console.log("queryQuickbooks body:"+JSON.stringify(body));
                        callback(null, res.QueryResponse);
                    }
                });

        });
        
    },

    //Call QuickBooks APIs: Generic Invoice Update Function
    updateQuickBooks: (session, updateFields, type, callback)=>{
        var error = {};

        //check for User's Token
        Token.getToken(session.message.user.id,(err, dbtoken)=>{
            if(!dbtoken){
                callback('no_token', null);
                return;
            }

            if(!session || !updateFields || !type){
                error.code = 999;
                error.msg = "Missing parameters for updateQuickBooks."
    
                console.error(error.msg);
                callback(error,null);
                return;
            }

            var _url = baseurl+"/v3/company/"+dbtoken.realmId+"/"+type;
        
            request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + dbtoken.token.access_token,
                            'Accept': 'application/json'},
                json: updateFields
                }, 
                function (err, response, body){
                    if (err) {
                        error.code = 888;
                        error.msg = 'updateQuickBooks: API call failed:'+ err;
                        console.error(error.msg);
                        callback(error, null);
                    }else{
                        if(response.statusCode != 200){
                            //reseting the memory token for the user
                            Token.storeToken(session.message.user.id, null,(err, result)=>{
                                if(err){
                                    callback(err, null);
                                    return;
                                }

                                error.code = response.statusCode;
                                error.msg = "updateQuickBooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                                callback(error, null);
                            });
                        }else{//sucess
                            callback(null, response.body);
                        }
                    }
            });

        });
    },

    getReports: function (session, reportUrl, callback){
        //check for User's Token
        
        Token.getToken(session.message.user.id,(err, dbtoken)=>{
            if(!dbtoken){
                callback('no_token', null);
                return;
            }

            if(!session || !reportUrl){
                error.code = 999;
                error.msg = "Missing parameters for getReports."

                console.error(error.msg);
                callback(error,null);
                return;
            }

            var _url = baseurl+"/v3/company/"+dbtoken.realmId+"/reports/"+reportUrl;

            request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + dbtoken.token.access_token,
                            'Accept': 'application/json'}
                }, 
                function (error, response, body){
                    if (error) {
                        console.error('readQuickbooks: API call failed:', error);
                        callback(error, null);
                    }else{
                        if(response.statusCode != 200){
                            

                            //reseting the memory token for the user
                            Token.storeToken(session.message.user.id, null,(err, result)=>{
                                if(err){
                                    callback(err, null);
                                    return;
                                }

                                error.code = response.statusCode;
                                error.msg = "updateQuickBooks: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                                callback(error, null);
                            });
                        }

                        var res = JSON.parse(body);
                        //callback(null, res.QueryResponse);
                        callback(null, res);
                    }
                }
            );
            

        });
    },

    //Call QuickBooks APIs for Search Estimate
    getPDF: (session, id, docNum, type, callback)=>{

        //check for User's Token
        Token.getToken(session.message.user.id,(err, dbtoken)=>{
            if(!dbtoken){
                callback('no_token', null);
                return;
            }

            if(!id || !docNum || !type){
                error.code = 999;
                error.msg = "Missing parameters for getPDF."
    
                console.error(error.msg);
                callback(error,null);
                return;
            }

            var _url = baseurl+"/v3/company/"+dbtoken.realmId+"/"+type+"/"+id+"/pdf";
            var today = new Date();
            var filename = docNum + "_"+type+"_" + today.getDate() + ".pdf";
            var file = fs.createWriteStream(__dirname+'/../pdfs/'+filename);

            request({
                    method: 'get',
                    url: _url,
                    headers: {'Authorization': 'Bearer ' + dbtoken.token.access_token,
                                'Content-Type': 'application/pdf'}
                }).on('error', (err)=>{
                    console.error('getPDF: API call failed:', error);
                    callback(error, null);
                }).pipe(file).on('close',()=>{
                    sendInline(session, __dirname+'/../pdfs/'+filename, 'application/pdf', filename);
                });
        });  
    },

    //Pretending to be the DL Channel sending a message to Bot to get the return of OAuth 2.0 (Token)
    postMessageDL: (message, user_id, user_name, conversationId)=>{
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
            text: message
        }

        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + directLineSecret,
                            'Accept': 'application/json'},
                json: post_json
            }, function (err, response, body){
                if (err) {
                    console.error(error);
                }else{
                    if(response.statusCode != 200){
                        console.log('Error: response code: '+response.statusCode);
                        return;
                    }else{//sucess
                        //callback(null, response.body);
                        return response.body;
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
        // var msg = new builder.Message(session)
        //     .addAttachment({
        //         contentUrl: util.format('data:%s;base64,%s', contentType, base64),
        //         contentType: contentType,
        //         name: attachmentFileName
        //     });
        // msg.text("asdasdadadsd");

        session.send({
            // text: "You senta asdadasdsad:",
            attachments: [
                {
                    contentUrl: util.format('data:%s;base64,%s', contentType, base64),
                    contentType: contentType,
                    name: attachmentFileName
                }
            ]
        });

        session.endDialog();

        //delete the file
        fs.unlinkSync(filePath);
    });
}
