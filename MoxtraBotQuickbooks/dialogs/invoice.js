var dateFormat = require('dateformat');
var fs = require('fs');
var util = require('util');

module.exports = function(bot) {
    bot.dialog("searchInvoice",[
        function (session, args, next) {
            
            if (!session.conversationData.customer_id){
                session.beginDialog('getCustomer');
            }else{
                session.send("All right, let's search Invoices for "+session.conversationData.customer_name);
                next();
            }
        },
        function (session, results) {
            if(!session.conversationData.customer_id){
                session.endDialog('Sorry no Customer selected.');
            }
            builder.Prompts.time(session, "Please provide the initial Due Date:");
        },
        function (session, results) {
            session.dialogData.invoiceInitDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            builder.Prompts.time(session, "Please provide the final Due Date:");
        },
        function (session, results) {
            session.dialogData.invoiceFinalDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            session.send(`Ok. I'll get the Invoices for: ${session.conversationData.customer_name} ` +
                    `between: ${dateFormat(session.dialogData.invoiceInitDate,'mediumDate')} and ${dateFormat(session.dialogData.invoiceFinalDate,'mediumDate')}`);

            searchInvoice(session, session.message.token.access_token, session.message.realmid, session.conversationData.customer_id, 
                dateFormat(session.dialogData.invoiceInitDate,'isoDate'), dateFormat(session.dialogData.invoiceFinalDate,'isoDate'), 
                function(err, data){
                    //callback function
                    if(err){
                        session.endDialog("Sorry. There was an error trying to search for invoices.");
                        console.error(err);
                    }else{
                        if(data.Invoice){
                            var invoices = {};

                            for(var i=0; i<= data.Invoice.length-1; i++){
                                var invoice = {
                                    id: data.Invoice[i].Id,
                                    docNumber: data.Invoice[i].DocNumber,
                                    dueDate: data.Invoice[i].DueDate,
                                    totalAmt: data.Invoice[i].TotalAmt
                                };
                                invoices[data.Invoice[i].DocNumber] = invoice;
                            }
                            session.dialogData.invoices = invoices;
                            console.log("invoices: "+JSON.stringify(session.dialogData.invoices));
                            
                            session.send("I found "+data.maxResults+" invoice(s).");
                            builder.Prompts.choice(session, "Please select:", invoices);
                        
                        }else{
                            session.send("Sorry. I didn't find any invoice with the parameters.");
                            session.endDialogWithResult();
                        }
                    }
                });
        },
        function (session, results) {
            var invoice = session.dialogData.invoices[results.response.entity];
            session.send(`Ok. Invoice Number ${invoice.docNumber} - Total: ${invoice.totalAmt} - Due Date: ${invoice.dueDate}.`); 
            
            getInvoicePDF(session, session.message.token.access_token, session.message.realmid, invoice.id, (err, data)=>{
                if(err){
                    console.error(err);
                    session.endDialog("Error to download the PDF");
                }else{
                    session.endDialog();
                }
            });
        }
    ])
    .triggerAction({
        matches: /^search invoice$/i,
        confirmPrompt: "This will cancel your current request. Are you sure?"
    })
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
            matches: /^start over$/i
        }
    )
    .endConversationAction(
        "endSearchInvooice", "Ok. Goodbye.",
        {
            matches: /^goodbye$/i
        }
    );
}



//Call QuickBooks APIs for Search Invoice
function searchInvoice(session, access_token, realmid, customerId, startDate, finalDate, callback){

    if(!access_token || !realmid || !customerId || !startDate || !finalDate){
        console.error("Missing parameters for searchInvoice.");
        callback("Missing parameters for searchInvoice.",null);
    }

    var _url = baseurl+"/v3/company/"+realmid+"/query?query="+
        "SELECT * FROM Invoice WHERE  DueDate >= '"+startDate+"' and DueDate <= '"+finalDate+"' and CustomerRef = '"+customerId+"'";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchInvoice: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    session.message.token = null;
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
function getInvoicePDF(session, access_token, realmid, invoiceId, callback){

    if(!access_token || !realmid || !invoiceId){
        console.error("Missing parameters for getInvoicePDF.");
        callback("Missing parameters for getInvoicePDF.",null);
    }

    var _url = baseurl+"/v3/company/"+realmid+"/invoice/"+invoiceId+"/pdf";
    var today = new Date();
    var filename = invoiceId + "_invoice_" + today.getDate() + ".pdf";
    var file = fs.createWriteStream(__dirname+'/images/'+filename);

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + access_token,
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
        session.send(msg);
    });
}

