const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');


module.exports = function(bot) {
    bot.dialog("searchBill",[
        function (session, args, next) {
            console.log("searchBill args:"+JSON.stringify(args));

            if(args.billId){
                session.dialogData.billId = args.billId;
            }

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //vendor
                var vendorName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerVendorName');
                if (vendorName){
                    session.dialogData.vendorName = vendorName.entity;
                }
                //Due dates
                var billDueDateRange = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.daterange');
                if(billDueDateRange){
                    session.dialogData.billInitDate = billDueDateRange.resolution.values[0].start + " 00:00:00";
                    session.dialogData.billFinalDate = billDueDateRange.resolution.values[0].end + " 00:00:00";
                }
                //bill number
                var billId = builder.EntityRecognizer.findEntity(args.intent.entities, 'billId');
                if (billId){
                    session.dialogData.billId = billId.entity;
                }
                //bill Status (Open, Paid, Overdue)
                var billStatus = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceStatus');
                if(billStatus){
                    session.dialogData.billStatus = billStatus.resolution.values[0];
                }
            }

            //check if there is a token
            Token.getToken(session.message.user.id, (err, result)=>{
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
            else{
                //#01 bill Number: if user provided bill Number, skip
                if(session.dialogData.billId){
                    next();
                }else{
                    //#02 Search for vendor
                    console.log("session.dialogData2:"+JSON.stringify(session.dialogData));
                    if (!session.conversationData.vendorId || session.dialogData.vendorName){
                        var args= {vendorName: session.dialogData.vendorName, displayMsg: false};
                        session.beginDialog('searchVendor',args);
                    }else{
                        next();
                    }
                }                
            }
        },
        function (session, results, next) {
            //if user provided bill number or status, skip
            if(session.dialogData.billId || session.dialogData.billStatus){
                next();
            }else{
                if(!session.conversationData.vendorId){
                    session.endDialog('Sorry no vendor selected.');
                }
                
                //#03: bill Status: check if user provided it
                if(!session.dialogData || !session.dialogData.billInitDate){
                    builder.Prompts.time(session, "Please provide the initial bill Due Date:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            //if user provided bill number, skip
            if(session.dialogData.billId || session.dialogData.billStatus){
                next();
            }else{
                if(!session.dialogData.billInitDate && results.response){
                    session.dialogData.billInitDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
                }
                    
                //check if the user typed the final date
                if(!session.dialogData.billFinalDate){
                    builder.Prompts.time(session, "Please provide the final bill Due Date:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            //if user provided bill number, skip
            if(session.dialogData.billId){
                next();
            }else{
                if(!session.dialogData.billFinalDate && results.response){
                    session.dialogData.billFinalDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
                }

                //create the base query
                var query = "SELECT * FROM Bill WHERE VendorRef = '"+session.conversationData.vendorId+"'";

                //create the confirmation msg
                var msg = `Getting bills for:\n [b]Vendor:[/b] ${session.conversationData.vendorName} \n`;
                if(session.dialogData.billInitDate && session.dialogData.billFinalDate){
                    msg += `[b]Due Date:[/b] ${dateFormat(session.dialogData.billInitDate,'mediumDate')} to ${dateFormat(session.dialogData.billFinalDate,'mediumDate')} \n`;
                    query += " and DueDate >= '"+dateFormat(session.dialogData.billInitDate,'isoDate')+"' and DueDate <= '"+dateFormat(session.dialogData.billFinalDate,'isoDate')+"'";
                }
                if(session.dialogData.billStatus){
                    msg += `[b]Status:[/b] ${session.dialogData.billStatus}`;
                        
                    if(session.dialogData.billStatus != "All"){
                        if(session.dialogData.billStatus == "Paid"){//Paid
                            query += " and  Balance = '0' ";
                        }else if(session.dialogData.billStatus == "Open"){//Open
                            query += " and  Balance != '0' ";
                        }else if(session.dialogData.billStatus == "Overdue"){//Overdue
                            query += " and  Balance != '0' and DueDate < '"+dateFormat(new Date(),'isoDate')+"' ";
                        }
                    }
                }

                //Search for bills on Quickbooks API
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
                        if(data.Bill && data.Bill.length > 0){
                            
                            session.send(msg);
                            
                            var bills = {};

                            for(var i=0; i<= data.Bill.length-1; i++){
                                //status
                                var _status = "Due";
                                var _statusColor = 'black';
                                if(data.Bill[i].Balance == "0"){
                                    _status = "Paid";
                                    _statusColor = "green";
                                }
                                if(data.Bill[i].Balance != "0" && data.Bill[i].DueDate < dateFormat(new Date(),'isoDate')){
                                    _status = "Overdue";
                                    _statusColor = "orange";
                                }

                                var bill = {
                                    id: data.Bill[i].Id,
                                    // docNumber: data.Invoice[i].DocNumber,
                                    dueDate: data.Bill[i].DueDate + " 00:00:00",
                                    totalAmt: data.Bill[i].TotalAmt,
                                    balance: data.Bill[i].Balance,
                                    status: _status
                                };

                                var billDisplay= "[b]ID: "+bill.id+"[/b]  -  Due: "+dateFormat(bill.dueDate,'mediumDate')+" | Total: "+formatter.format(bill.totalAmt)+" | [color="+_statusColor+"]"+bill.status+"[/color]";

                                bills[billDisplay] = bill;
                            }
                            session.dialogData.bills = bills;
                            // console.log("bills: "+JSON.stringify(session.dialogData.bills));
                            
                            builder.Prompts.choice(session, "I found "+data.maxResults+" bill(s).\nPlease select the bill you want to see it:", bills, { listStyle: 2 });
                        
                        }else{
                            session.send("Sorry. I didn't find any bill with the parameters.");
                            session.endDialog();
                        }
                    }
                });
            }
        },
        function (session, results) {
            //if user provided bill number
            if(!session.dialogData.billId && results.response){
                session.dialogData.billId = session.dialogData.bills[results.response.entity].id;
            }

            console.log("results.response: "+JSON.stringify(results.response));
            console.log("session.dialogData.billId: "+session.dialogData.billId);

            var query = "Select * from Bill where Id = '"+ session.dialogData.billId +"'";

            //get the bill ID
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
                    if(res.Bill && res.Bill.length > 0){
                        var bill = res.Bill[0];
                        var msg = "";

                        var _status = "Due";
                        var _statusColor = 'black';
                        if(bill.Balance == "0"){
                            _status = "Paid";
                            _statusColor = "green";
                        }
                        if(bill.Balance != "0" && bill.DueDate < dateFormat(new Date(),'isoDate')){
                            _status = "Overdue";
                            _statusColor = "orange";
                        }

                        msg += `[b]ID:[/b] ${bill.Id}\n`;
                        msg += `[b]Vendor:[/b] ${bill.VendorRef.name}\n`;
                        msg += `[b]Status:[/b] [color=${_statusColor}]${_status}[/color]\n`;
                        if(bill.Balance != "0"){
                            msg += `[b]Due:[/b] ${dateFormat(bill.DueDate + " 00:00:00",'mediumDate')}\n`;
                        }
                        
                        msg += `\n[b]Items:[/b]\n`;
                        res.Bill[0].Line.forEach((e)=>{
                            console.log("Bill:"+JSON.stringify(e));

                            if(e.AccountBasedExpenseLineDetail){
                                msg += `${e.Id}. ${e.AccountBasedExpenseLineDetail.AccountRef.name} | ${e.Description} | ${formatter.format(e.Amount)}\n`;
                            }else if(e.ItemBasedExpenseLineDetail){
                                msg += `${e.Id}. ${e.ItemBasedExpenseLineDetail.ItemRef.name} | ${e.Description} | ${formatter.format(e.Amount)}\n`;
                            }
                            
                        });
                        msg += `[b]Total:[/b] ${formatter.format(bill.TotalAmt)}\n`;
                        
                        session.endDialog(msg);
                    }else{
                        session.endDialog("Sorry. I didn't find any bill with that ID.");
                    }
                }
            });
        }
    ])
    .triggerAction(
        {
            matches: 'searchBill'
        }
    )
    .cancelAction(
        "cancelSearchBill", "Ok Bill Search canceled!", 
        {
            matches: /^cancel$/i
        }
    )
    .reloadAction(
        "restartSearchBill", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    )
    .endConversationAction(
        "endSearchBill", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );


    bot.dialog("updateBill",[
        function (session, args, next) {
            console.log("updateBill args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //bill number
                var billNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'billId');
                if (billNumber){
                    session.dialogData.billNumber = billNumber.entity;
                }
                //new due date
                var billNewDueDate = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                if(billNewDueDate){
                    session.dialogData.billNewDueDate = billNewDueDate.resolution.values[0].value + " 00:00:00";
                }
            }

            //check if there is a token
            Token.getToken(session.message.user.id, (err, result)=>{
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
            else{//Get bill number
                if(!session.dialogData.billNumber){
                    builder.Prompts.text(session, "Please provide the Bill Id:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.billNumber = results.response;
            }
                
            //Get the New Due Date
            if(!session.dialogData.billNewDueDate){
                builder.Prompts.time(session, "What's the new Due Date for the bill?");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.billNewDueDate = builder.EntityRecognizer.resolveTime([results.response]).toISOString();
            }
            
            // session.send("Ok. Updating bill "+session.dialogData.billNumber+" due date to "+dateFormat(session.dialogData.billNewDueDate,'mediumDate'));

            //search for the bill by Doc Number
            var query = "Select * from Bill where Id = '"+session.dialogData.billNumber+"'";

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
                    if(res.Bill.length > 0){

                        var bill = res.Bill[0];
                        console.log("bill:"+JSON.stringify(bill));

                        //get the bill fields and reate the post obj 
                        var fields = {
                            sparse: true,
                            Id: bill.Id,
                            SyncToken: bill.SyncToken,
                            DueDate: session.dialogData.billNewDueDate,
                            VendorRef: { value: bill.VendorRef.value }
                        };
                        
                        //call the api to update the bill fields
                        qb.updateQuickBooks(session, fields, "bill", (error, success)=>{
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
                                var args= {billId: session.dialogData.billNumber};

                                session.endDialog("The bill [b]#"+bill.Id+"[/b] Due Date was successfully changed to [b]"+dateFormat(session.dialogData.billNewDueDate,'mediumDate') +"[/b].");
                                session.beginDialog('searchBill',args);
                            }
                        });
                    }else{
                        session.endDialog("Sorry. I didn't find any bill with that ID.");
                    }
                }
            });            
        }
    ])
    .triggerAction(
        {
            matches: 'updateBill'
        }
    )
    .cancelAction(
        "cancelSearchBill", "Ok Bill Search canceled!",
        {
            matches: /^cancel$/i
        }
    )
    .reloadAction(
        "restartUpdateBill", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    )
    .endConversationAction(
        "endUpdateBill", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );

    bot.dialog("payBill",[
        function (session, args, next) {
            console.log("payBill args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //bill number
                var billId = builder.EntityRecognizer.findEntity(args.intent.entities, 'billId');
                if (billId){
                    session.dialogData.billId = billId.entity;
                }
            }

            //check if there is a token
            Token.getToken(session.message.user.id, (err, result)=>{
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
            else{//Get bill number
                if(!session.dialogData.billId){
                    builder.Prompts.text(session, "Please provide the Bill Id:");
                }else{
                    next();
                }
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.billId = results.response;
            }

            //Getting Payment Accounts
            var query = "select Id, Name, AccountType, CurrentBalance  from Account where AccountType = 'Bank'";
            var accounts = {};

            qb.queryQuickbooks(session, query, (error, data)=>{
                if(error){
                    if(error.code == 888 || error.code == 999){
                        console.log(error.msg);
                    }else if(error.code == 404){
                        //token expired
                        session.send("Sorry you need to login again into your account.");
                        session.beginDialog('login');
                    }else{
                        session.endDialog("Sorry, I couldn't find any Payment Account.");
                    }
                }
                else{
                    if(data.Account && data.Account.length > 0){
                        for(var i=0; i<= data.Account.length-1; i++){
                            var account = {
                                id: data.Account[i].Id,
                                name: data.Account[i].Name,
                                type: data.Account[i].AccountType,
                                balance: data.Account[i].CurrentBalance
                            };
                            
                            var accountDisplay = account.type+": "+account.name+" | Balance: "+formatter.format(account.balance);
                            accounts[accountDisplay] = account;
                        }

                        session.dialogData.accounts = accounts;
                        builder.Prompts.choice(session, "Please select an Account to make the Payment:", accounts, { listStyle: 2 });
                    }else{
                        session.endDialog("Sorry, I couldn't find any Payment Account to pay the Bill.");
                    }
                }
            });
        },
        function (session, results, next){
            
            var account = session.dialogData.accounts[results.response.entity];

            //search for the bill by Doc Number
            var query = "Select Id, TotalAmt, VendorRef, Balance from Bill where Id = '"+session.dialogData.billId+"'";

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
                    if(res.Bill.length > 0){

                        var bill = res.Bill[0];
                        // console.log("bill:"+JSON.stringify(bill));

                        if(bill.Balance == 0){
                            session.endDialog("Sorry, this bill is [color=red]already paid![/color]");
                            return;
                        }

                        //get the bill fields and reate the post obj 
                        var fields = {
                            VendorRef: { 
                                value: bill.VendorRef.value,
                                name: bill.VendorRef.name
                            },
                            "PayType": "CreditCard",
                            "CreditCardPayment": {
                                "CCAccountRef": {
                                    "value": account.id,
                                    "name": account.name
                                }
                            },
                            "TotalAmt": bill.TotalAmt,
                            "PrivateNote": "Paid using Moxtra's Bot",
                            "Line": [{
                                "Amount": bill.TotalAmt,
                                "LinkedTxn": [{
                                    "TxnId": bill.Id,
                                    "TxnType": "Bill"
                                }]
                            }]
                        };
                        
                        //call the api to update the bill fields
                        qb.updateQuickBooks(session, fields, "billpayment", (error, success)=>{
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
                                var args= {billId: session.dialogData.billId};

                                session.endDialog("The bill [b]#"+bill.Id+"[/b] was paid!");
                                session.beginDialog('searchBill',args);
                            }
                        });
                    }else{
                        session.endDialog("Sorry. I didn't find any bill with that ID.");
                    }
                }
            });            
        }
    ])
    .triggerAction(
        {
            matches: 'payBill'
        }
    )
    .cancelAction(
        "cancelPayBill", "Ok Bill Payment canceled!",
        {
            matches: /^cancel$/i
        }
    )
    .reloadAction(
        "restartPayBill", "Ok. Let's start over.",
        {
            matches: 'startover'
        }
    )
    .endConversationAction(
        "endPayBill", "Ok. Goodbye.",
        {
            matches: 'goodbye'
        }
    );
}