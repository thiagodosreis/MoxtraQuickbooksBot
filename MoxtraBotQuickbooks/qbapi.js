//********* Quickbooks API Call ***************//

module.exports = {
    //Call QuickBooks APIs: Generic Invoice Query Function
    queryInvoice: function(session, query, callback){
        var error = {};

        if(!session.userData.token.access_token || !session.userData.realmId || !query){
            error.code = 999;
            error.msg = "Missing parameters for queryInvoice."

            console.error(error.msg);
            callback(error,null);
        }

        var _url = baseurl+"/v3/company/"+session.userData.realmId+"/query?query="+query;
        // console.log("queryInvoice: "+_url);
        request({
                method: 'get',
                url: _url,
                headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                            'Accept': 'application/json'}
            }, function (err, response, body){
                if (err) {
                    error.code = 888;
                    error.msg = 'queryInvoice: API call failed:', err;
                    console.error(error.msg);
                    callback(error, null);
                }else{
                    if(response.statusCode != 200){
                        //reseting the memory token for the user
                        session.userData.token = null;

                        error.code = response.statusCode;
                        error.msg = "queryInvoice: API call failed: UNAUTHORIZED. TOKEN EXPIRED!";

                        callback(error, null);
                        return;
                    }

                    var res = JSON.parse(body);
                    // console.log("queryInvoice body:"+JSON.stringify(body));
                    callback(null, res.QueryResponse);
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
    }


}

