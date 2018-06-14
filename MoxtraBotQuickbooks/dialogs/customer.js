const Token = require('./../modules/token');
const qb = require('./../modules/qbapi');

module.exports = function(bot) {
    bot.dialog("searchCustomer",[
        function (session, args, next) {
            session.dialogData.displayMsg = true;

            //getting user name from other Dialog
            if(args.customerName){
                session.dialogData.customerName = args.customerName;
                session.dialogData.displayMsg = args.displayMsg;
            }else{
                //getting user name from this Dialog Intent Call
                if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                    var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerVendorName');
                    if(customerName){
                        session.dialogData.customerName = customerName.entity;
                    }

                    //estimate Status (Open, Paid, Overdue)
                    var allCustomers = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceStatus');
                    if(allCustomers){
                        if(allCustomers.resolution.values[0] == "All"){
                            session.dialogData.allCustomers = allCustomers.resolution.values[0];
                        }
                    }
                }
            }
            
            //check if there is a token
            Token.getToken(session.message.org_id, session.message.client_id, (err, result)=>{
                if(!result){
                    session.beginDialog("login");    
                }else{
                    next();
                }
            });
        },
        // function(session, results, next){
        //     if (!session.dialogData.customerName && !session.dialogData.allCustomers){
        //         builder.Prompts.text(session, "Please, type the name of the customer:");
        //     }else{
        //         next();
        //     }
        // },
        function (session, results, next) {
            if(results.response){
                if(results.response.toLowerCase() == "all"){
                    session.dialogData.allCustomers = true;
                }
                // else{
                //     session.dialogData.customerName = results.response;
                // }
            }

            let query = "Select Id, FullyQualifiedName from Customer";
            if(!session.dialogData.allCustomers && session.dialogData.customerName){
                query += " where FullyQualifiedName like%20%27%25"+session.dialogData.customerName+"%25%27";
            }

            //Search for customers in Quickbooks API
            qb.queryQuickbooks(session, query, (error, data)=>{
                if(error){
                    if(error.code == 888 || error.code == 999){
                        console.log(error.msg);
                    }else if(error.code == 401){
                        //token not valid
                        session.endDialog("The access to QuickBooks was denied! Please, ask your Quickbooks Admin to log in again.");
                    }else{
                        session.send(`[b]I didn't find any customer with name ${jsUcfirst(session.dialogData.customerName)}![/b]\nTo view all customers try: [i]Show me all customers[/i]`);
                        session.conversationData.customerName = "";
                        session.conversationData.customerId = "";
                        session.endDialog();
                    }
                } 
                else{
                    if(data && data.Customer){
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
                            builder.Prompts.choice(session, "I found "+data.maxResults+" customer(s).\nPlease select one:", customers, { listStyle: 2 });
                        }
                    }else{
                        session.send(`[b]I didn't find any customer with name ${jsUcfirst(session.dialogData.customerName)}![/b]\nTo view all customers try: [i]Show me all customers[/i]`);
                        session.conversationData.customerName = "";
                        session.conversationData.customerId = "";

                        session.endDialog();
                    }
                }
            });
        },
        function (session, results, next) {
            console.log("searchCustomer results:"+JSON.stringify(results));

            //storing Customer in the Conversation Storage container
            session.conversationData.customerId = session.dialogData.customers[results.response.entity].id;
            session.conversationData.customerName = session.dialogData.customerName = session.dialogData.customers[results.response.entity].name;

            if(session.dialogData.displayMsg){
                session.endDialog(`Customer selected.\n Name: [b]${session.conversationData.customerName}[/b]`); 
            }
            else{
                session.endDialog();
            }
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


function jsUcfirst(string) 
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}