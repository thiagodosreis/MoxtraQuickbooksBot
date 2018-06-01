const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');

module.exports = function(bot) {
    bot.dialog("updateInvoice",[
        function (session, args, next) {
            console.log("updateInvoice args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //invoice number
                var invoiceNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceNumber');
                if (invoiceNumber){
                    session.dialogData.invoiceNumber = invoiceNumber.entity;
                }
                //new due date
                var invoiceNewDueDate = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                if(invoiceNewDueDate){
                    session.dialogData.invoiceNewDueDate = invoiceNewDueDate.resolution.values[0].value + " 00:00:00";
                }
            }

            //check if there is a token
            Token.getToken(session.message.org_id, session.message.client_id, (err, result)=>{
                if(!result){
                    session.beginDialog("login");    
                }else{
                    next({auth: true});
                }
            });

            console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            console.log("results:"+JSON.stringify(results));
            if(!results.auth){
                session.send("Sorry, no authorization");
                session.endConversation();
            }
            else{//Get Invoice number
                if(!session.dialogData.invoiceNumber){
                    builder.Prompts.text(session, "Please provide the Invoice Number:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.invoiceNumber = results.response;
            }
                
            //Get the New Due Date
            if(!session.dialogData.invoiceNewDueDate){
                builder.Prompts.time(session, "What's the new Due Date for the invoice?");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.invoiceNewDueDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }
            
            session.send("Ok. Updating invoice "+session.dialogData.invoiceNumber+" due date to "+session.dialogData.invoiceNewDueDate);

            //search for the invoice by Doc Number
            var query = "Select * from Invoice where DocNumber = '"+session.dialogData.invoiceNumber+"'";

            qb.queryQuickbooks(session, query, (error, res)=>{

                if(error){
                    if(error.code == 888 || error.code == 999){
                        console.log(error.msg);
                    }else if(error.code == 404){
                        //token expired
                        session.send("Sorry you need to login again into your account.");
                        session.beginDialog('login');
                    }
                }
                else{
                    if(res.Invoice.length > 0){

                        var invoice = res.Invoice[0];

                        //get the invoice fields and reate the post obj 
                        var fields = {
                            sparse: true,
                            Id: invoice.Id,
                            SyncToken: invoice.SyncToken,
                            DueDate: session.dialogData.invoiceNewDueDate
                        };
                        
                        //call the api to update the invoice fields
                        qb.updateQuickBooks(session, fields, "invoice", (error, success)=>{
                            if(error){
                                if(error.code == 888 || error.code == 999){
                                    console.log(error.msg);
                                }else if(error.code == 404){
                                    //token expired
                                    session.send("Sorry you need to login again into your account.");
                                    session.beginDialog('login');
                                }
                            }
                            else{
                                //return a positive or negative response to the user
                                session.endDialog("The invoice [b]#"+invoice.DocNumber+"[/b] Due Date was successfully changed to [b]"+dateFormat(session.dialogData.invoiceNewDueDate,'mediumDate') +"[/b].");
                            }
                        });
                    }else{
                        session.endDialog("Sorry. I didn't find any invoice with that number.");
                    }
                }
            });            
        }
    ])
    .triggerAction(
        {
            matches: 'updateInvoice'
            // confirmPrompt: "This will cancel your current request. Are you sure?"
        }
    )
    .cancelAction(
        "cancelUpdateInvoice", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
        }
    )
    .reloadAction(
        "restartUpdateInvoice", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    )
    .endConversationAction(
        "endUpdateInvoice", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );
}

