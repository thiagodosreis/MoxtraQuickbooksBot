var dateFormat = require('dateformat');
var fs = require('fs');
var util = require('util');

module.exports = function(bot) {
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
                if(estimateDueDateRange){
                    session.dialogData.estimateInitDate = estimateDateRange.resolution.values[0].start;
                    session.dialogData.estimateFinalDate = estimateDateRange.resolution.values[0].end;
                }

                session.dialogData.estimateDueDateOn = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                // session.dialogData.estimateStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'EstimateStatus');
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

            //Search for estimates on Quickbooks API
            searchEstimate(session, initDateISO, finalDateISO, (err, data)=>{
                    //callback function
                    if(err){
                        session.endDialog("Sorry. There was an error trying to search for estimates.");
                        console.error(err);
                    }else{
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

                                var estimateDisplay= "[b]#"+estimate.docNumber+"[/b]  -  Date: "+dateFormat(estimate.txnDate,'mediumDate')+" | Total: "+formatter.format(estimate.totalAmt)+" | "+estimate.status+"";

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
            getEstimatePDF(session, estimate.id, (err, data)=>{
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
            matches: 'searchEstimate',
            confirmPrompt: "This will cancel your current request. Are you sure?"
        }
    )
    .cancelAction(
        "cancelSearchEstimate", "Type 'ok' to continue.", 
        {
            matches: /^cancel$/i,
            confirmPrompt: "This will cancel your search. Are you sure?"
        }
    )
    .reloadAction(
        "restartSearchEstimate", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    );
}


//********* Quickbooks API Call ***************//

//Call QuickBooks APIs for Search Estimate
function searchEstimate(session, startDate, finalDate, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !session.conversationData.customerId || !startDate || !finalDate){
        console.error("Missing parameters for searchEstimate.");
        //begin dialog for login again
        session.message.token = null;
        session.beginDialog("login");
        callback("Missing parameters for searchEstimate.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/query?query="+
        "SELECT * FROM Estimate WHERE  TxnDate >= '"+startDate+"' and TxnDate <= '"+finalDate+"' and CustomerRef = '"+session.conversationData.customerId+"'";

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Accept': 'application/json'}
        }, function (error, response, body){
            if (error) {
                console.error('searchEstimate: API call failed:', error);
                callback(error, null);
            }else{
                if(response.statusCode != 200){
                    //reseting the memory token for the user
                    session.userData.token = null;

                    //begin dialog for login again
                    session.beginDialog("login");

                    callback("searchEstimate: API call failed: UNAUTHORIZED. TOKEN EXPIRED!", null);
                    return;
                }

                var res = JSON.parse(body);
                // console.log("Got the Estimates: "+JSON.stringify(res.QueryResponse));
                callback(null, res.QueryResponse);
            }
        });

}

//Call QuickBooks APIs for Search Estimate
function getEstimatePDF(session, estimateId, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !estimateId){
        console.error("Missing parameters for getEstimatePDF.");
        callback("Missing parameters for getEstimatePDF.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/estimate/"+estimateId+"/pdf";
    var today = new Date();
    var filename = estimateId + "_estimate_" + today.getDate() + ".pdf";
    var file = fs.createWriteStream(__dirname+'/images/'+filename);

    request({
            method: 'get',
            url: _url,
            headers: {'Authorization': 'Bearer ' + session.userData.token.access_token,
                        'Content-Type': 'application/pdf'}
        }).on('error', (err)=>{
            console.error('getEstimatePDF: API call failed:', error);
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


// Create our number formatter.
var formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2
});


