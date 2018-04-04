const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');

module.exports = function(bot) {

    ////////////////////////////////////////////////////////////////////////////////////////////////
    /// Dialog: searchEstimate 
    /// Description: search estimates filtering by Due Date, Customer, Status and etc
    ////////////////////////////////////////////////////////////////////////////////////////////////
    bot.dialog("searchEstimate",[
        function (session, args, next) {
            console.log("searchEstimate args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //customer
                var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerName');
                if (customerName){
                    session.dialogData.customerName = customerName.entity;
                }
                //dates
                var estimateDateRange = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.daterange');
                if(estimateDateRange){
                    session.dialogData.estimateInitDate = estimateDateRange.resolution.values[0].start;
                    session.dialogData.estimateFinalDate = estimateDateRange.resolution.values[0].end;
                }

                session.dialogData.estimateDueDateOn = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                // session.dialogData.estimateStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'EstimateStatus');
            }


            //check if there is a token
            if(!Token.getToken(session.message.user.id)){
                session.beginDialog("login");    
            }else{
                next();
            }

            console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            console.log("results:"+JSON.stringify(results));
            if(!results.auth && !Token.getToken(session.message.user.id)){
                session.send("Sorry, no authorization");
                session.endConversation();
            }
            else{//search customer
                console.log("session.dialogData2:"+JSON.stringify(session.dialogData));
                if (!session.conversationData.customerId || session.dialogData.customerName){
                    var args= {customerName: session.dialogData.customerName};
                    session.beginDialog('searchCustomer',args);
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            if(!session.conversationData.customerId){
                session.endDialog('Sorry no Customer selected.');
            }
            
            //check if the user typed the start date
            if(!session.dialogData.estimateInitDate){
                builder.Prompts.time(session, "Please provide the initial Estimate Date:");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(!session.dialogData.estimateInitDate){
                session.dialogData.estimateInitDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }
                
            //check if the user typed the final date
            if(!session.dialogData.estimateFinalDate){
                builder.Prompts.time(session, "Please provide the final Estimate Date:");
            }else{
                next();
            }
        },
        function (session, results) {
            if(!session.dialogData.estimateFinalDate){
                session.dialogData.estimateFinalDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }

            session.send(`Getting estimates for:\n [b]Customer:[/b] ${session.conversationData.customerName} \n` +
                    `[b]Dates:[/b] ${dateFormat(session.dialogData.estimateInitDate,'mediumDate')} to ${dateFormat(session.dialogData.estimateFinalDate,'mediumDate')}`);

            var initDateISO = dateFormat(session.dialogData.estimateInitDate,'isoDate');
            var finalDateISO = dateFormat(session.dialogData.estimateFinalDate,'isoDate');

            const query = "SELECT * FROM Estimate WHERE  TxnDate >= '"+initDateISO+"' and TxnDate <= '"+finalDateISO+"' and CustomerRef = '"+session.conversationData.customerId+"'";

            //Search for invoices on Quickbooks API
            qb.queryQuickbooks(session, query, (error, data)=>{
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
                    if(data.Estimate){
                        var estimates = {};

                        for(var i=0; i<= data.Estimate.length-1; i++){
                            var estimate = {
                                id: data.Estimate[i].Id,
                                docNumber: data.Estimate[i].DocNumber,
                                txnDate: data.Estimate[i].TxnDate,
                                totalAmt: data.Estimate[i].TotalAmt,
                                status: data.Estimate[i].TxnStatus
                            };

                            var estimateDisplay= "[b]#"+estimate.docNumber+"[/b]  -  Date: "+dateFormat(estimate.txnDate,'mediumDate')+" | Total: "+formatter.format(estimate.totalAmt)+" | "+estimate.status;//+"[mxButton='bot_postback' client_id='YzIxODgyMzN' payload='xxx']Create Invoice[/mxButton]";

                            estimates[estimateDisplay] = estimate;
                        }
                        session.dialogData.estimates = estimates;
                        console.log("estimates: "+JSON.stringify(session.dialogData.estimates));
                        
                        session.send("I found "+data.maxResults+" estimate(s).");
                        builder.Prompts.choice(session, "Please select the estimate to see it:", estimates, { listStyle: 2 });
                    }else{
                        session.send("Sorry. I didn't find any estimate with the parameters.");
                        session.endDialog();
                    }
                 }
            });
        },
        function (session, results) {
            console.log("searchEstimate results:"+JSON.stringify(results));
            var estimate = session.dialogData.estimates[results.response.entity];
            session.send(`Getting Estimate #${estimate.docNumber}:`); 
            
            //Get specific estimate PDF on Quickbooks API
            qb.getPDF(session, estimate.id, estimate.docNumber, "estimate", (err, data)=>{
                if(err){
                    console.error(err);
                    session.endDialog("Error to download the PDF");
                }else{
                    session.endDialog("There you go.");
                }
            });
        }
    ])
    .triggerAction({
        matches: 'searchEstimate'
    })
    .cancelAction(
        "cancelSearchEstimate", "Type 'ok' to continue.", {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
    })
    .reloadAction(
        "restartSearchEstimate", "Ok. Let's start over.",{
            matches: 'startover'
    })
    .endConversationAction(
        "endSearchInvooice", "Ok. Goodbye.",{
            matches: 'goodbye'   
    });


    ////////////////////////////////////////////////////////////////////////////////////////////////
    /// Dialog: promoteEstimate 
    /// Description: convert an existing estimate to an invoice
    ////////////////////////////////////////////////////////////////////////////////////////////////
    bot.dialog("promoteEstimate",[
        function (session, args, next) {
            console.log("promoteEstimate args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //estimate number
                var estimateNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceNumber');
                if (estimateNumber){
                    session.dialogData.estimateNumber = estimateNumber.entity;
                }
            }

            //check if there is a token
            if(!Token.getToken(session.message.user.id)){
                session.beginDialog("login");    
            }else{
                next();
            }

            console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            console.log("results:"+JSON.stringify(results));
            if(!results.auth && !Token.getToken(session.message.user.id)){
                session.send("Sorry, no authorization");
                session.endConversation();
            }

            if(session.dialogData.estimateNumber){
                var query = "Select * from Estimate Where DocNumber = '"+session.dialogData.estimateNumber+"'";

                //get the estimate info
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
                        console.log("res.Estimate:"+JSON.stringify(res.Estimate));
                        if(res.Estimate && res.Estimate.length > 0){
                            var estimate = res.Estimate[0];

                            //check for estimate status
                            if(estimate.TxnStatus == "Closed" || estimate.TxnStatus == "Rejected"){
                                session.endDialog("Sorry the Estimate #"+estimate.DocNumber+" is [b][color=red]"+estimate.TxnStatus+"[/color][/b].");
                            }else{
                                // Get Estimate infor and create the Invoice Obj
                                var invoiceFields = {
                                    Line: estimate.Line,
                                    CustomerRef: estimate.CustomerRef,
                                    LinkedTxn: [{
                                        TxnId: estimate.Id,
                                        TxnType: "Estimate"
                                    }]
                                };

                                console.log("invoiceFields:"+JSON.stringify(invoiceFields));
                                
                                //create the invoice in QuickBooks
                                qb.updateQuickBooks(session, invoiceFields, "invoice", (error, invoice)=>{
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
                                        session.send("Estimate approved and a new Invoice #"+invoice.Invoice.DocNumber+" is ready.");
                                        // builder.Prompts.confirm(session, "Do you want to see this invoice?");
                                    }
                                });
                            }
                        }else{
                            session.endDialog("Sorry. I didn't find any invoice with that number.");
                        }
                    }
                });
            }
        }
    ])
    .triggerAction({
            matches: 'promoteEstimate'
    })
    .cancelAction(
        "cancelPromoteEstimate", {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel any usaved action. Are you sure?"
    })
    .reloadAction(
        "restartPromoteEstimate", "Ok. Let's start over.",{
            matches: 'startover'
    })
    .endConversationAction(
        "endPromoteEstimate", "Ok. Goodbye.",{
            matches: 'goodbye'
    });
}