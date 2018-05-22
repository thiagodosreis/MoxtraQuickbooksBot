module.exports = function(bot) { 

    bot.dialog("help",[
        function (session, args, next) {
        
            let introMsg = '[size=18][b]Help:[/b][/size]\nClick on the topic do you need help with today?\n';

            if(args && args.introMsg){
                introMsg = args.introMsg;
            }

            const msg= `${introMsg}
                    [table][tr]
                    [td][mxButton=bot_postback payload="help_invoices" client_id="${session.message.client_id}"]Invoices[/mxButton][/td]
                    [td][mxButton=bot_postback payload="help_sales_receipt" client_id="${session.message.client_id}"]Sales Receipt[/mxButton][/td]
                    [td][mxButton=bot_postback payload="help_estimates" client_id="${session.message.client_id}"]Estimates[/mxButton][/td]
                    [td][mxButton=bot_postback payload="help_bills" client_id="${session.message.client_id}"]Bills[/mxButton][/td]
                    [td][mxButton=bot_postback payload="help_reports" client_id="${session.message.client_id}"]Reports[/mxButton][/td]
                    [td][mxButton=bot_postback payload="help_alerts" client_id="${session.message.client_id}"]Alerts[/mxButton][/td]
                    [/tr][/table]`;

            session.endDialog(msg);
        }
        // ,
        // function (session, results){
        //     console.log("results:"+JSON.stringify(results));
        //     if(results){
        //         session.endDialog("your selection was: "+results.response);
        //     }
        // }
    ])
    .triggerAction(
        {
            matches: /help/
        }
    );

    bot.dialog("help_invoice",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Invoices Help:[/b][/size]

            To [b]view invoices[/b], please type one of the following:
            -	Show me invoices
            -	Get all invoices for Mark Zuller 
            -	Find overdue invoices
            -	Bring me open invoices from Dec 1st to May 30th

            To [b]update invoices due date[/b], please type:
            -   Postpone invoice 1092 to Feb 27th 2018

            You can also filter invoices based on their status – Paid, Open & Overdue.

            All invoices commands will be applied to the [b]selected customer[/b] or a specified invoice number.
            To select a customer, please type:
            -   Select customer Tony
            -   Show me all customers`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');

            // session.replaceDialog('help', {introMsg: "Would you like to know more?\n"});
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog('Ok. I\'ll always be here to [i]help[/i].');
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_invoice/
        }
    );

    bot.dialog("help_sales_receipt",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Sales Receipt Help:[/b][/size]

            To [b]view sales receipts[/b], please type one of the following:
            -	Show sales receipt 1200
            -	Get sales receipt from Dec 1st to May 30th for Mark Zuller 
            -	Show me all sales receipt for Mark Zuller

            If you do not specify the customer's name, the commands will be applied to the selected customer.`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog('Ok. I\'ll always be here to [i]help[/i].');
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_sales_receipt/
        }
    );

    bot.dialog("help_estimates",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Estimates Help:[/b][/size]

            To [b]view estimates[/b], please type one of the following:
            -	Show estimate 1009
            -	Find all estimates for Mark Zuller
            -	Get estimates from Dec 1st to May 30th for Mark Zuller

            To [b]promote an estimate to invoice[/b], please type:
            -	Approve estimate 1008

            All estimates commands will be applied to the selected customer.`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog('Ok. I\'ll always be here to [i]help[/i].');
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_estimates/
        }
    );

    bot.dialog("help_bills",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Bills Help:[/b][/size]

            To [b]view bills[/b], please type one of the following:
            -	Show me bill 299
            -	Get me all bills for Fidelity
            -	Bring open bills from Dec 1st to May 30th

            To [b]pay a bill[/b], please type:
            -	Pay bill 299

            All bill commands will be applied to the [b]selected vendor[/b] or a specified bill ID.
            To select a vendor, please type:
            -   Select vendor Fidelity
            -   Show me all vendors`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog('Ok. I\'ll always be here to [i]help[/i].');
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_bills/
        }
    );

    bot.dialog("help_reports",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Reports Help:[/b][/size]

            I can show you 3 different reports:
            - Customer Balance Report
            - Account Receivable Report (AR Report)
            - Account Payable Report (AP Report)

            To [b]view reports[/b], please type:
            -	Show me Customer Balance Report fo Fidelity
            -	Get me AR Report  

            You can always shorter the text to AR Report and AP Report.`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog('Ok. I\'ll always be here to [i]help[/i].');
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_reports/
        }
    );

    bot.dialog("help_alerts",[
        function (session, args, next) {
            
            const msg = `[size=18][b]Alerts/Notifications Help:[/b][/size]

            You can configure two kinds of notifications:

            [b]Scheduled notification[/b] will send you alerts at pre-determined times with the reports you selected.
            Supported reports: AR Report, AP Report
            
            [b]Real-time notification[/b] will alert you when an action happens in Quickbooks for:
            Bills, Invoices, Estimates and Sales Receipt
            

            To set up notifications, please type one of the following
            -	Setup invoices notifications  
            -	Send me ar report every day at 9am   
            -	Show my alerts
            -	Delete Sales Receipt notification`;

            session.send(msg);
            builder.Prompts.confirm(session, 'Would you like to know more?');
        },
        function(session, results){
            if(results && results.response){
                session.beginDialog('help', {introMsg: "What else Would you like to know now?\n"});
            }
            else{
                session.endDialog();
            }
        }
    ])
    .triggerAction(
        {
            matches: /help_alerts/
        }
    );
}
