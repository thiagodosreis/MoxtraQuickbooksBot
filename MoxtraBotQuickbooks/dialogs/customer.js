module.exports = function(bot) {
    bot.dialog("searchCustomer",[
        function (session, args, next) {
            console.log('searchCustomer args:'+JSON.stringify(args));

            //getting user name from other Dialog
            if(args.customerName){
                session.dialogData.customerName = args.customerName;
            }else{
                //getting user name from this Dialog Intent Call
                if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                    var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerName');
                    if(customerName){
                        session.dialogData.customerName = customerName.entity;
                    }
                }
            }
            
            //check if there is a token
            if(!session.userData.token){
                session.beginDialog("login");    
            }else{
                next();
            }
        },
        function(session, results, next){
            if (!session.dialogData.customerName){
                builder.Prompts.text(session, "Please, type the name of the customer:");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.customerName = results.response;
            }
            
            session.send("Searching for customer "+session.dialogData.customerName+" ...");

            searchCustomer(session, session.dialogData.customerName, (err, data)=>{
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

                        //found just one Customer. So select this
                        if(data.maxResults == "1"){
                            next({response: {entity: data.Customer[0].FullyQualifiedName } });
                        }else{
                            builder.Prompts.choice(session, "I found "+data.maxResults+" customer(s). Please select:", customers, { listStyle: 2 });
                        }
                    }else{
                        session.send("Sorry. I didn't find any customer with that name.");
                        session.endDialogWithResult();
                    }
                }
            });
        },
        function (session, results, next) {
            console.log("searchCustomer results:"+JSON.stringify(results));

            //storing Customer in the Conversation Storage container
            session.conversationData.customerId = session.dialogData.customers[results.response.entity].id;
            session.conversationData.customerName = session.dialogData.customerName = session.dialogData.customers[results.response.entity].name;

            session.endDialog(`Customer selected!\n Name: [b]${session.conversationData.customerName}[/b] - ID: ${session.conversationData.customerId}`); 
            //session.endDialogWithResult(session.dialogData.customers[results.response.entity]);
        }
    ])
    .triggerAction({
        matches: 'searchCustomer'
    })
    .cancelAction(
        "cancelCustomer", "Type anything to continue.", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your customer search. Are you sure?"
        }
    );
}



//Call QuickBooks APIs for Search Customer
function searchCustomer(session, customer_name, callback){
    console.log("session.userData:"+JSON.stringify(session.userData));
    if(!session.userData.token.access_token || !session.userData.realmId || !customer_name){
        console.error("Missing parameters for searchCustomer.");
        
        //begin dialog for login again
        session.message.token = null;
        session.beginDialog("login");

        callback("Missing parameters for searchCustomer.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+
                "/query?query=Select%20%2A%20from%20Customer%20where%20FullyQualifiedName%20like%20%27%25"+
                customer_name+"%25%27";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchCustomer: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    
                    //reseting the memory token for the user
                    session.userData.token = null;

                    //begin dialog for login again
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
