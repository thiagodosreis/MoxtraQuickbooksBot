var dateFormat = require('dateformat');
var fs = require('fs');
var util = require('util');

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

            //Search for receipts on Quickbooks API
            searchReceipt(session, initDateISO, finalDateISO, (err, data)=>{
                    //callback function
                    if(err){
                        session.endDialog("Sorry. There was an error trying to search for receipts.");
                        console.error(err);
                    }else{
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
            getReceiptPDF(session, receipt.id, (err, data)=>{
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
}


//********* Quickbooks API Call ***************//

//Call QuickBooks APIs for Search Receipt
function searchReceipt(session, startDate, finalDate, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !session.conversationData.customerId || !startDate || !finalDate){
        console.error("Missing parameters for searchReceipt.");
        //begin dialog for login again
        session.message.token = null;
        session.beginDialog("login");
        callback("Missing parameters for searchReceipt.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/query?query="+
        "SELECT * FROM SalesReceipt WHERE  TxnDate >= '"+startDate+"' and TxnDate <= '"+finalDate+"' and CustomerRef = '"+session.conversationData.customerId+"'";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchReceipt: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    //reseting the memory token for the user
                    session.userData.token = null;

                    //begin dialog for login again
                    session.beginDialog("login");

                    callback("searchReceipt: API call failed: UNAUTHORIZED. TOKEN EXPIRED!", null);
                    return;
                }

                var res = JSON.parse(body);
                // console.log("Got the receipts: "+JSON.stringify(res.QueryResponse));
                callback(null, res.QueryResponse);
            }
        });

}

//Call QuickBooks APIs for Search receipt
function getReceiptPDF(session, receiptID, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !receiptID){
        console.error("Missing parameters for getReceiptPDF.");
        callback("Missing parameters for getReceiptPDF.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/salesreceipt/"+receiptID+"/pdf";
    var today = new Date();
    var filename = receiptID + "_salesreceipt_" + today.getDate() + ".pdf";
    var file = fs.createWriteStream(__dirname+'/images/'+filename);

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Content-Type': 'application/pdf'}
        }).on('error', (err)=>{
            console.error('getReceiptPDF: API call failed:', error);
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


