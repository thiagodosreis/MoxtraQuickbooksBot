var dateFormat = require('dateformat');
var fs = require('fs');
var util = require('util');
var qb = require('./../qbapi.js');

module.exports = function(bot) {
    bot.dialog("searchInvoice",[
        function (session, args, next) {
            console.log("searchInvoice args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //customer
                var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerName');
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
                    // console.log("InvoiceStatus: "+JSON.stringify(invoiceStatus));
                    session.dialogData.invoiceStatus = invoiceStatus.resolution.values[0];
                }

                //session.dialogData.invoiceDueDateOn = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                //session.dialogData.invoiceStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceStatus');
            }

            //check if there is a ## Quick Book Token ##
            if(!session.userData.token){
                session.beginDialog("login");    
            }else{
                next();
            }

            console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            console.log("results:"+JSON.stringify(results));
            if(!results.auth && !session.userData.token){
                session.send("Sorry, no authorization");
                session.endConversation();
            }
            else{
                //#01 Invoice Number: if user provided Invoice Number, skip
                if(session.dialogData.invoiceNumber){
                    next();
                }else{
                    //#02 Search for customer
                    console.log("session.dialogData2:"+JSON.stringify(session.dialogData));
                    if (!session.conversationData.customerId || session.dialogData.customerName){
                        var args= {customerName: session.dialogData.customerName};
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
                        
                    if(session.dialogData.invoiceStatus == "Paid"){//Paid
                        query += " and  Balance = '0' ";
                    }else if(session.dialogData.invoiceStatus == "Open"){//Open
                        query += " and  Balance != '0' ";
                    }else if(session.dialogData.invoiceStatus == "Overdue"){//Overdue
                        query += " and  Balance != '0' and DueDate < '"+dateFormat(new Date(),'isoDate')+"' ";
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
                        if(data.Invoice && data.Invoice.length > 0){
                            
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
                            console.log("invoices: "+JSON.stringify(session.dialogData.invoices));
                            
                            session.send("I found "+data.maxResults+" invoice(s).");
                            builder.Prompts.choice(session, "Please select the invoice to see it:", invoices, { listStyle: 2 });
                        
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
                            getInvoicePDF(session, invoice.Id, invoice.DocNumber, (err, data)=>{
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
                console.log("searchInvoice results:"+JSON.stringify(results));
                invoice = session.dialogData.invoices[results.response.entity];
                session.send(`Getting Invoice #${invoice.docNumber}:`); 

                //Get specific invoice PDF on Quickbooks API
                getInvoicePDF(session, invoice.id, invoice.docNumber, (err, data)=>{
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
        "cancelSearchInvoice", "Type 'ok' to continue.", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
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

    
    bot.dialog('printInvoice', [
        function (session, args) {
            if (args && args.reprompt){

            }

            builder.Prompts.text(session, "Who's name will this reservation be under?");
        },
        function (session, results) {
            session.endDialogWithResult(results);
        }
    ]);
}


//********* Quickbooks API Call ***************//

//Call QuickBooks APIs for Search Invoice
function searchInvoice(session, startDate, finalDate, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !session.conversationData.customerId || !startDate || !finalDate){
        console.error("Missing parameters for searchInvoice.");
        //begin dialog for login again
        session.message.token = null;
        session.beginDialog("login");
        callback("Missing parameters for searchInvoice.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/query?query="+
        "SELECT * FROM Invoice WHERE  DueDate >= '"+startDate+"' and DueDate <= '"+finalDate+"' and CustomerRef = '"+session.conversationData.customerId+"'";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchInvoice: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    //reseting the memory token for the user
                    session.userData.token = null;

                    //begin dialog for login again
                    session.beginDialog("login");

                    callback("searchInvoice: API call failed: UNAUTHORIZED. TOKEN EXPIRED!", null);
                    return;
                }

                var res = JSON.parse(body);
                // console.log("Got the Invoices: "+JSON.stringify(res.QueryResponse));
                callback(null, res.QueryResponse);
            }
        });
}

//Call QuickBooks APIs for Search Invoice
function getInvoicePDF(session, invoiceId, invoiceDocNumber, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !invoiceId){
        console.error("Missing parameters for getInvoicePDF.");
        callback("Missing parameters for getInvoicePDF.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/invoice/"+invoiceId+"/pdf";
    var today = new Date();
    var filename = invoiceDocNumber + "_invoice_" + today.getDate() + ".pdf";
    var file = fs.createWriteStream(__dirname+'/images/'+filename);

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Content-Type': 'application/pdf'}
        }).on('error', (err)=>{
            console.error('getInvoicePDF: API call failed:', error);
            callback(error, null);
        }).pipe(file).on('close',()=>{
            sendInline(session, __dirname+'/images/'+filename, 'application/pdf', filename);
        });
}

// Sends attachment inline in base64
function sendInline(session, filePath, contentType, attachmentFileName) {
    fs.readFile(filePath, function (err, data) {
        if (err) {
            return session.send('Oops. Error reading file.');
        }
        var base64 = Buffer.from(data).toString('base64');
        var msg = new builder.Message(session)
            .addAttachment({
                contentUrl: util.format('data:%s;base64,%s', contentType, base64),
                contentType: contentType,
                name: attachmentFileName
            });
        session.endDialog(msg);
    });
}

var Intl = require('intl');
// Create our number formatter.
var formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});


