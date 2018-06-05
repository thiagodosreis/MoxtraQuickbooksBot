const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');


module.exports = function(bot) {
    bot.dialog("searchInvoice",[
        function (session, args, next) {
            // console.log("searchInvoice args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //customer
                var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerVendorName');
                if (customerName){
                    session.dialogData.customerName = customerName.entity;
                }
                //Due dates
                var invoiceDueDateRange = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.daterange');
                if(invoiceDueDateRange){
                    session.dialogData.invoiceInitDate = invoiceDueDateRange.resolution.values[0].start + " 00:00:00";
                    session.dialogData.invoiceFinalDate = invoiceDueDateRange.resolution.values[0].end + " 00:00:00";
                }
                //invoice number
                var invoiceNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceNumber');
                if (invoiceNumber){
                    session.dialogData.invoiceNumber = invoiceNumber.entity;
                }
                //Invoice Status (Open, Paid, Overdue)
                var invoiceStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceStatus');
                if(invoiceStatus){
                    session.dialogData.invoiceStatus = invoiceStatus.resolution.values[0];
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

            // console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            if(!results.auth){
                session.send("Sorry, no authorization");
                session.endConversation();
            }
            else{
                //#01 Invoice Number: if user provided Invoice Number, skip
                if(session.dialogData.invoiceNumber){
                    next();
                }else{
                    //#02 Search for customer
                    // console.log("session.dialogData2:"+JSON.stringify(session.dialogData));
                    if (!session.conversationData.customerId || session.dialogData.customerName){
                        var args= {customerName: session.dialogData.customerName, displayMsg: false};
                        session.beginDialog('searchCustomer',args);
                    }else{
                        next();
                    }
                }                
            }
        },
        function (session, results, next) {
            //if user provided invoice number or status, skip
            if(session.dialogData.invoiceNumber || session.dialogData.invoiceStatus){
                next();
            }else{
                if(!session.conversationData.customerId){
                    session.endDialog('Sorry no Customer selected.');
                }
                
                //#03: Invoice Status: check if user provided it
                if(!session.dialogData.invoiceInitDate){
                    builder.Prompts.time(session, "Please provide the initial Invoice Due Date:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            //if user provided invoice number, skip
            if(session.dialogData.invoiceNumber || session.dialogData.invoiceStatus){
                next();
            }else{
                if(!session.dialogData.invoiceInitDate && results.response){
                    session.dialogData.invoiceInitDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
                }
                    
                //check if the user typed the final date
                if(!session.dialogData.invoiceFinalDate){
                    builder.Prompts.time(session, "Please provide the final Invoice Due Date:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            //if user provided invoice number, skip
            if(session.dialogData.invoiceNumber){
                next();
            }else{
                if(!session.dialogData.invoiceFinalDate && results.response){
                    session.dialogData.invoiceFinalDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
                }

                //create the base query
                var query = "SELECT * FROM Invoice WHERE CustomerRef = '"+session.conversationData.customerId+"'";

                //create the confirmation msg
                var msg = `Getting invoices for:\n [b]Customer:[/b] ${session.conversationData.customerName} \n`;
                if(session.dialogData.invoiceInitDate && session.dialogData.invoiceFinalDate){
                    msg += `[b]Due Date:[/b] ${dateFormat(session.dialogData.invoiceInitDate,'mediumDate')} to ${dateFormat(session.dialogData.invoiceFinalDate,'mediumDate')} \n`;
                    query += " and DueDate >= '"+dateFormat(session.dialogData.invoiceInitDate,'isoDate')+"' and DueDate <= '"+dateFormat(session.dialogData.invoiceFinalDate,'isoDate')+"'";
                }
                if(session.dialogData.invoiceStatus){
                    msg += `[b]Status:[/b] ${session.dialogData.invoiceStatus}`;
                    
                    if(session.dialogData.invoiceStatus != "All"){
                        if(session.dialogData.invoiceStatus == "Paid"){//Paid
                            query += " and  Balance = '0' ";
                        }else if(session.dialogData.invoiceStatus == "Open"){//Open
                            query += " and  Balance != '0' ";
                        }else if(session.dialogData.invoiceStatus == "Overdue"){//Overdue
                            query += " and  Balance != '0' and DueDate < '"+dateFormat(new Date(),'isoDate')+"' ";
                        }
                    }
                }


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
                        if(data && data.Invoice && data.Invoice.length > 0){
                            
                            session.send(msg);
                            
                            var invoices = {};

                            for(var i=0; i<= data.Invoice.length-1; i++){
                                //status
                                var _status = "Due";
                                var _statusColor = 'black';
                                if(data.Invoice[i].Balance == "0"){
                                    _status = "Paid";
                                    _statusColor = "green";
                                }
                                if(data.Invoice[i].Balance != "0" && data.Invoice[i].DueDate < dateFormat(new Date(),'isoDate')){
                                    _status = "Overdue";
                                    _statusColor = "orange";
                                }

                                var invoice = {
                                    id: data.Invoice[i].Id,
                                    docNumber: data.Invoice[i].DocNumber,
                                    dueDate: data.Invoice[i].DueDate + " 00:00:00",
                                    totalAmt: data.Invoice[i].TotalAmt,
                                    balance: data.Invoice[i].Balance,
                                    status: _status
                                };

                                var invoiceDisplay= "[b]#"+invoice.docNumber+"[/b]  -  Due: "+dateFormat(invoice.dueDate,'mediumDate')+" | Total: "+formatter.format(invoice.totalAmt)+" | [color="+_statusColor+"]"+invoice.status+"[/color]";

                                invoices[invoiceDisplay] = invoice;
                            }
                            session.dialogData.invoices = invoices;
                            // console.log("invoices: "+JSON.stringify(session.dialogData.invoices));
                            
                            builder.Prompts.choice(session, "I found "+data.maxResults+" invoice(s).\nPlease select the invoice you want to see:", invoices, { listStyle: 2 });
                        
                        }else{
                            session.send("Sorry. I didn't find any invoice with the parameters.");
                            session.endDialog();
                        }
                    }
                });
            }
        },
        function (session, results) {
            //if user provided invoice number
            if(session.dialogData.invoiceNumber){
                var query = "Select * from Invoice where DocNumber = '"+session.dialogData.invoiceNumber+"'";

                //get the invoice ID
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
                        if(res.Invoice && res.Invoice.length > 0){
                            var invoice = res.Invoice[0];

                            // Get specific invoice PDF on Quickbooks API
                            qb.getPDF(session, invoice.Id, invoice.DocNumber, "invoice", (err, data)=>{
                                if(err){
                                    console.error(err);
                                    session.endDialog("Error to download the PDF");
                                }else{
                                    session.endDialog("There you go.");
                                }
                            });
                        }else{
                            session.endDialog("Sorry. I didn't find any invoice with that number.");
                        }
                    }
                });
            }
            else{
                // console.log("searchInvoice results:"+JSON.stringify(results));
                invoice = session.dialogData.invoices[results.response.entity];
                session.send(`Getting Invoice #${invoice.docNumber}:`); 

                //Get specific invoice PDF on Quickbooks API
                qb.getPDF(session, invoice.id, invoice.docNumber, "invoice", (err, data)=>{
                    if(err){
                        console.error(err);
                        session.endDialog("Error to download the PDF");
                    }else{
                        session.endDialog("There you go.");
                    }
                });
            }            
        }
    ])
    .triggerAction(
        {
            matches: 'searchInvoice'
            // confirmPrompt: "This will cancel your current request. Are you sure?"
        }
    )
    .cancelAction(
        "cancelSearchInvoice", "Ok. Invoice search canceled!", 
        {
            matches: /^cancel$/i
        }
    )
    .reloadAction(
        "restartSearchInvoice", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    )
    .endConversationAction(
        "endSearchInvoice", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );
}