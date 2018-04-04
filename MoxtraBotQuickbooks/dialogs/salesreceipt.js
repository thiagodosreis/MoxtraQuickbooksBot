const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');

module.exports = function(bot) { 
    bot.dialog("searchReceipt",[
        function (session, args, next) {
            console.log("searchReceipt args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //customer
                var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerName');
                if (customerName){
                    session.dialogData.customerName = customerName.entity;
                }
                //dates
                var receiptDateRange = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.daterange');
                if(receiptDateRange){
                    session.dialogData.receiptInitDate = receiptDateRange.resolution.values[0].start;
                    session.dialogData.receiptFinalDate = receiptDateRange.resolution.values[0].end;
                }

                session.dialogData.receiptDueDateOn = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                // session.dialogData.receiptStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'receiptStatus');
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
            if(!session.dialogData.receiptInitDate){
                builder.Prompts.time(session, "Please provide the initial Sales Date:");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(!session.dialogData.receiptInitDate){
                session.dialogData.receiptInitDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }
                
            //check if the user typed the final date
            if(!session.dialogData.receiptFinalDate){
                builder.Prompts.time(session, "Please provide the final Sales Date:");
            }else{
                next();
            }
        },
        function (session, results) {
            if(!session.dialogData.receiptFinalDate){
                session.dialogData.receiptFinalDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }

            session.send(`Getting Sales Receipt for:\n [b]Customer:[/b] ${session.conversationData.customerName} \n` +
                    `[b]Dates:[/b] ${dateFormat(session.dialogData.receiptInitDate,'mediumDate')} to ${dateFormat(session.dialogData.receiptFinalDate,'mediumDate')}`);

            var initDateISO = dateFormat(session.dialogData.receiptInitDate,'isoDate');
            var finalDateISO = dateFormat(session.dialogData.receiptFinalDate,'isoDate');

            const query = "SELECT * FROM SalesReceipt WHERE  TxnDate >= '"+initDateISO+"' and TxnDate <= '"+finalDateISO+"' and CustomerRef = '"+session.conversationData.customerId+"'";

            //Search for receipts on Quickbooks API
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
                    if(data.SalesReceipt){
                        var salesReceipts = {};

                        for(var i=0; i<= data.SalesReceipt.length-1; i++){
                            var _statusColor = 'green';

                            var receipt = {
                                id: data.SalesReceipt[i].Id,
                                docNumber: data.SalesReceipt[i].DocNumber,
                                txnDate: data.SalesReceipt[i].TxnDate,
                                totalAmt: data.SalesReceipt[i].TotalAmt,
                                balance: data.SalesReceipt[i].Balance,
                                status: "Paid"
                            };

                            var receiptsDisplay= "[b]#"+receipt.docNumber+"[/b]  -  Date: "+dateFormat(receipt.txnDate,'mediumDate')+" | Total: "+formatter.format(receipt.totalAmt)+" | [color="+_statusColor+"]"+receipt.status+"[/color]";

                            salesReceipts[receiptsDisplay] = receipt;
                        }
                        session.dialogData.receipts = salesReceipts;
                        console.log("receipts: "+JSON.stringify(session.dialogData.receipts));
                        
                        session.send("I found "+data.maxResults+" sales receipt(s).");
                        builder.Prompts.choice(session, "Please select the Sales Receipt to see it:", salesReceipts, { listStyle: 2 });
                    
                    }else{
                        session.send("Sorry. I didn't find any Sale Receipt with the parameters.");
                        session.endDialog();
                    }
                }
            });
        },
        function (session, results) {
            console.log("searchReceipt results:"+JSON.stringify(results));
            var receipt = session.dialogData.receipts[results.response.entity];
            session.send(`Getting Sales Receipt #${receipt.docNumber}:`); 
            
            //Get specific receipt PDF on Quickbooks API
            qb.getPDF(session, receipt.id, receipt.docNumber, "salesreceipt", (err, data)=>{
                if(err){
                    console.error(err);
                    session.endDialog("Error to download the PDF");
                }else{
                    session.endDialog("There you go.");
                }
            });
        }
    ])
    .triggerAction(
        {
            matches: 'searchReceipt',
            confirmPrompt: "This will cancel your current request. Are you sure?"
        }
    )
    .cancelAction(
        "cancelSearchReceipt", "Type 'ok' to continue.", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
        }
    )
    .reloadAction(
        "restartSearchReceipt", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    ).endConversationAction(
        "endSearchInvooice", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );

    ////////////////////////////////////////////////////////////////////////////////////////////////
    /// Dialog: promoteInvoice 
    /// Description: generate a Sales Receipt for an Invoice
    ////////////////////////////////////////////////////////////////////////////////////////////////
    bot.dialog("promoteInvoice",[
        function (session, args, next) {
            console.log("promoteInvoice args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //invoice number
                var invoiceNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceNumber');
                if (invoiceNumber){
                    session.dialogData.invoiceNumber = invoiceNumber.entity;
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
            session.send("Ok I'll create a Sales Receipt for the invoice #"+session.dialogData.invoiceNumber);

            if(session.dialogData.invoiceNumber){
                var query = "Select * from Invoice Where DocNumber = '"+session.dialogData.invoiceNumber+"'";

                //get the invoice details
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
                        console.log("res.Invoice:"+JSON.stringify(res.Invoice));
                        if(res.Invoice && res.Invoice.length > 0){
                            var invoice = res.Invoice[0];


                            //Check if the Invoice is Paid before generates Sales Receipt
                            if(invoice.Balance != '0'){
                                session.endDialog("Sorry, I can't generate a Sales Receipt because the invoice "+invoice.DocNumber+" is not Paid.");
                            }
                            else{
                                // Get Invoice info and create the Sales Receipt Obj
                                var invoiceFields = {
                                    Line: invoice.Line,
                                    CustomerRef: invoice.CustomerRef
                                };

                                console.log("invoiceFields:"+JSON.stringify(invoiceFields));
                                
                                //create the invoice in QuickBooks
                                qb.updateQuickBooks(session, invoiceFields, "salesreceipt", (error, receipt)=>{
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
                                        session.send("Sales Receipt #"+receipt.SalesReceipt.DocNumber+" is ready.");
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
            matches: 'promoteInvoice'
    })
    .cancelAction(
        "cancelPromoteInvoice", {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel any usaved action. Are you sure?"
    })
    .reloadAction(
        "restartPromoteInvoice", "Ok. Let's start over.",{
            matches: 'startover'
    })
    .endConversationAction(
        "endPromoteInvoice", "Ok. Goodbye.",{
            matches: 'goodbye'
    });
}
