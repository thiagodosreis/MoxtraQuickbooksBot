module.exports = function(bot) {
    bot.dialog("getCustomer",[
        function (session, args, next) {

            //check if there is a token
            if(!session.message.token){
                session.beginDialog("login");    
            }else{
                next();
            }
        },
        function(session, results, next){
            builder.Prompts.text(session, "Please, type the name of the customer:");
        },
        function (session, results, next) {
            var customer_name = results.response;
            session.send("OK. Searching for "+customer_name+" ...");

            searchCustomer(session, session.message.token.access_token, session.message.realmid, customer_name, (err, data)=>{
                //callback function
                if(err){
                    session.endDialog("Sorry. There was an error trying to search for customer.");
                    console.error(err);
                }else{
                    if(data.Customer){
                        var customers = {};

                        for(var i=0; i<= data.Customer.length-1; i++){
                            var customer = {
                                id: data.Customer[i].Id,
                                name: data.Customer[i].FullyQualifiedName
                            };
                            customers[data.Customer[i].FullyQualifiedName] = customer;
                        }
                        session.dialogData.customers = customers;

                        
                        session.send("I found "+data.maxResults+" customer(s).");
                        builder.Prompts.choice(session, "Please select:", customers);
                       
                    }else{
                        session.send("Sorry. I didn't find any customer with that name.");
                        session.endDialogWithResult();
                    }
                }
            });
        },
        function (session, results) {
            session.conversationData.customer_id = session.dialogData.customers[results.response.entity].id;
            session.conversationData.customer_name = session.dialogData.customers[results.response.entity].name;

            session.send(`Ok, customer selected! Name: ${session.dialogData.customers[results.response.entity].name} - ID: ${session.conversationData.customer_id} selected.`); 
            //session.endDialogWithResult(session.dialogData.customers[results.response.entity]);
            session.endDialog();
        }
    ])
    .triggerAction({
        matches: /^get customer$/i,
        confirmPrompt: "This will cancel your current request. Are you sure?"
    })
    .cancelAction(
        "cancelCustomer", "Type 'Main Menu' to continue.", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
        }
    );
}



//Call QuickBooks APIs for Search Customer
function searchCustomer(session, access_token, realmid, customer_name, callback){

    if(!access_token || !realmid || !customer_name){
        console.error("Missing parameters for searchCustomer.");
        callback("Missing parameters for searchCustomer.",null);
    }

    var _url = baseurl+"/v3/company/"+realmid+
                "/query?query=Select%20%2A%20from%20Customer%20where%20FullyQualifiedName%20like%20%27%25"+
                customer_name+"%25%27";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchCustomer: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    session.beginDialog("login");
                    callback("searchCustomer: API call failed: UNAUTHORIZED. TOKEN EXPIRED!", null);
                    return;
                }

                var res = JSON.parse(body);
                console.log("Got the Customer: "+JSON.stringify(res.QueryResponse));
                callback(null, res.QueryResponse);
            }
        });

}
