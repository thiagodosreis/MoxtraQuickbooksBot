//********* Quickbooks API Call ***************//

module.exports = {
    //Call QuickBooks APIs: Generic Invoice Query Function
    queryQuickbooks: function(session, query, callback){
        var error = {};

        if(!session.userData.token.access_token || !session.userData.realmId || !query){
            error.code = 999;
            error.msg = "Missing parameters for queryQuickbooks."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+session.userData.realmId+"/query?query="+query;
        // console.log("queryQuickbooks: "+_url);
        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
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
                        session.userData.token = null;

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

    readQuickbooks: function(_url, access_token, callback){
        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + access_token,
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

    //Call QuickBooks APIs: Generic Invoice Update Function
    updateInvoice: function(session, updateFields, callback){
        var error = {};

        if(!session.userData.token.access_token || !session.userData.realmId || !updateFields){
            error.code = 999;
            error.msg = "Missing parameters for updateInvoice."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+session.userData.realmId+"/invoice";
        console.log("updateInvoice: "+_url);
        console.log("updateFields: "+JSON.stringify(updateFields));
        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                            'Accept': 'application/json'},
                json: updateFields
            }, function (err, response, body){
                
                console.log("updateInvoice body:"+JSON.stringify(body));
                console.log("updateInvoice response.statusCode:"+response.statusCode);

                if (err) {
                    error.code = 888;
                    error.msg = 'updateInvoice: API call failed:', err;
                    
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        session.userData.token = null;

                        error.code = response.statusCode;
                        error.msg = "updateInvoice: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                        return;
                    }else{//sucess
                        callback(null, true);
                    }
                }
            });
    },

    //Call QuickBooks APIs: Generic Invoice Update Function
    createInvoice: function(session, invoiceFields, callback){
        var error = {};

        if(!session.userData.token.access_token || !session.userData.realmId || !invoiceFields){
            error.code = 999;
            error.msg = "Missing parameters for updateInvoice."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+session.userData.realmId+"/invoice";
        console.log("createInvoice: "+_url);
        console.log("invoiceFields: "+JSON.stringify(invoiceFields));
        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                            'Accept': 'application/json'},
                json: invoiceFields
            }, function (err, response, body){
                
                console.log("createInvoice body:"+JSON.stringify(body));
                console.log("createInvoice response.statusCode:"+response.statusCode);

                if (err) {
                    error.code = 888;
                    error.msg = 'createInvoice: API call failed:', err;
                    
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        session.userData.token = null;

                        error.code = response.statusCode;
                        error.msg = "createInvoice: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                        return;
                    }else{//sucess
                        callback(null, response.body);
                    }
                }
            });
    },

    //Call QuickBooks APIs: Generic Invoice Update Function
    createReceipt: function(session, receiptFields, callback){
        var error = {};

        if(!session.userData.token.access_token || !session.userData.realmId || !receiptFields){
            error.code = 999;
            error.msg = "Missing parameters for updateInvoice."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+session.userData.realmId+"/salesreceipt";
        console.log("createReceipt: "+_url);
        console.log("receiptFields: "+JSON.stringify(receiptFields));
        request({
                method: 'post',
                url: _url,
                headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                            'Accept': 'application/json'},
                json: receiptFields
            }, function (err, response, body){
                
                console.log("createReceipt body:"+JSON.stringify(body));
                console.log("createReceipt response.statusCode:"+response.statusCode);

                if (err) {
                    error.code = 888;
                    error.msg = 'createReceipt: API call failed:', err;
                    
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        session.userData.token = null;

                        error.code = response.statusCode;
                        error.msg = "createReceipt: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                        return;
                    }else{//sucess
                        callback(null, response.body);
                    }
                }
            });
    }
}

