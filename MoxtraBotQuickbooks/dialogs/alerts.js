const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');

module.exports = function(bot) { 

    bot.dialog("showAlerts",[
        function (session, args, next) {
            if(session.message.binder_id && session.message.user.id){
                const query = {"binder.id": session.message.binder_id, "user.id": session.message.user.id};

                database.getAlerts(query, {"_id": 0, "alerts": 1 }, (err, docs)=>{
                    if(err){
                        session.endDialog("Sorry there was an error getting you alerts.");        
                        console.error('showScheduledAlerts: '+err);
                    }else{
                        console.log("docs length:"+docs.length);

                        if(docs.length > 0){
                            let msg = "[b]Alerts:[/b]\n";
                            let i = 0;
                            docs.forEach((e)=>{
                                //scheduled
                                if(e.alerts.scheduled){
                                    e.alerts.scheduled.forEach((s)=>{
                                        i++;   
                                        if(s.frequency == "specific_day"){
                                            var date = new Date(s.specific_date);
                                            dateFormat.masks.eventTime = "mm/dd/yy 'at' h:MMtt";
                                            msg += `${i}. Scheduled: ${s.resource.replace('_',' ').toUpperCase()} | ${dateFormat(date, "eventTime")} hr\n`;
                                        }else{
                                            msg += i+". Scheduled: "+s.resource.replace('_',' ').toUpperCase() + " | " + s.frequency.toUpperCase() + " | " + s.time + " hr\n";
                                        }
                                        
                                    });
                                }
                                //realtime
                                if(e.alerts.realtime){
                                    e.alerts.realtime.forEach((r)=>{
                                        i++;
                                        msg += i+". Real-time: "+r.replace('_',' ').toUpperCase()+"\n";
                                    });
                                }      
                            });
                            if(i == 0){
                                msg = `There are no scheduled alerts for you in this binder.
                                [mxButton=bot_postback payload="help_alerts" client_id="${session.message.client_id}"]Help with Alerts[/mxButton]`;
                            }
                            session.endDialog(msg);
                        }else{
                            var msg = `There are no scheduled alerts for you in this binder.
                                [mxButton=bot_postback payload="help_alerts" client_id="${session.message.client_id}"]Help with Alerts[/mxButton]`;
                            session.endDialog(msg);            
                        }
                    }
                });
            }
            else{
                session.endDialog("Sorry. I couldn't get the information to search for your alerts.");
            }   
        }
    ])
    .triggerAction(
        {
            matches: 'showAlerts'
        }
    );

    bot.dialog("configAlerts",[
        function (session, args, next) {

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                
                console.log("args:"+JSON.stringify(args.intent.entities));

                //Action [start/stop]
                var action = builder.EntityRecognizer.findEntity(args.intent.entities, 'AlertActions');
                if (action){
                    session.dialogData.action = action.resolution.values[0];
                }

                //Resource [invoice|estimate|sales_receipt|ap_report|ar_report]
                var resource = builder.EntityRecognizer.findEntity(args.intent.entities, 'resources');
                if (resource){
                    session.dialogData.resource = resource.resolution.values[0];
                }

                //AlertFrequency
                var daily = builder.EntityRecognizer.findEntity(args.intent.entities, 'AlertFrequency::daily')
                var monthly = builder.EntityRecognizer.findEntity(args.intent.entities, 'AlertFrequency::monthly')
                var specific_day = builder.EntityRecognizer.findEntity(args.intent.entities, 'AlertFrequency::specific_day')
                var weekly = builder.EntityRecognizer.findEntity(args.intent.entities, 'AlertFrequency::weekly')

                //DateTime
                var datetime = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.datetime');
                if(datetime){
                    session.dialogData.datetime = datetime.resolution.values[0].value;
                }else{
                    //Date
                    var date = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.date');
                    if(date){
                        session.dialogData.date = date.resolution.values[0].value;
                    }

                    //Time
                    var time = builder.EntityRecognizer.findEntity(args.intent.entities, 'builtin.datetimeV2.time');
                    if(time){
                        session.dialogData.time = time.resolution.values[0].value.substring(0,5);
                    }

                    if(date && time){
                        session.dialogData.datetime = session.dialogData.date + " " + session.dialogData.time;
                    }
                }

            

                if(daily){
                    session.dialogData.frequency = daily.type.split("::")[1];
                }
                else if(monthly){
                    session.dialogData.frequency = monthly.type.split("::")[1];
                }
                else if(specific_day || datetime || date){
                    session.dialogData.frequency = "specific_day";
                }
                else if(weekly){
                    session.dialogData.frequency = weekly.type.split("::")[1];
                }
            }


            if(!session.dialogData.resource){
                var alerts = ["Invoices", "Estimates", "Sales Receipt", "Bills", "AR Report", "AP Report"];

                builder.Prompts.choice(session, "Please select the alert you want:", alerts, { listStyle: 2 });
            } else {
                next();
            }
        },
        function (session, results, next) {
            if (results.response) {
                //normalize the results as it is in the Luis Entities
                switch(results.response.entity){
                    case "Invoices":
                        session.dialogData.resource = "invoice";
                        break;
                    case "Estimates":
                        session.dialogData.resource = "estimate";
                        break;
                    case "Sales Receipt":
                        session.dialogData.resource = "sales_receipt";
                        break;
                    case "Bills":
                        session.dialogData.resource = "bill";
                        break;
                    case "AR Report":
                        session.dialogData.resource = "ar_report";
                        break;
                    case "AP Report":
                        session.dialogData.resource = "ap_report";
                        break;
                }
            }
            

            //check if we should get more info
            if (session.dialogData.action == "start" && (session.dialogData.resource == "ap_report" || session.dialogData.resource == "ar_report")) {
                if(!session.dialogData.frequency){
                    var freq = ["Daily","In a specific date"];
                    builder.Prompts.choice(session, "When do you want this alert?", freq, { listStyle: 2 });
                }else{
                    next();
                }
            } else {
                next();
            }
        },
        function (session, results, next) {
            if (results.response) {

                //normalize the results as it is in the Luis Entities
                switch(results.response.entity){
                    case "Daily":
                        session.dialogData.frequency = "daily";
                        break;
                    case "In a specific date":
                        session.dialogData.frequency = "specific_day";
                        break;
                }
            }
            
            if(session.dialogData.action == "start" && session.dialogData.frequency == "daily" && !session.dialogData.time){
                builder.Prompts.time(session, "What time?");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if (results.response) {
                console.log("time:"+JSON.stringify(results.response));
                var date = new Date(builder.EntityRecognizer.resolveTime([results.response]));
                session.dialogData.time = padLeft(date.getHours(),"0", 2)+":"+padLeft(date.getMinutes(), "0",2);
            }

            if(session.dialogData.action == "start" && session.dialogData.frequency == "specific_day" && !session.dialogData.datetime){
                builder.Prompts.time(session, "What date and time?");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if (results.response) {
                session.dialogData.datetime = builder.EntityRecognizer.resolveTime([results.response]);
            }


            // var msg = "Ok. I will configure alerts for you:";
            // msg += "\nAction: "+session.dialogData.action;
            // msg += "\nResource: "+session.dialogData.resource;
            // msg += "\nFrequency: "+session.dialogData.frequency;
            // msg += "\nTime: "+session.dialogData.time;
            // msg += "\nDateTime: "+session.dialogData.datetime;
            // session.send(msg);

            const alert = {
                "action": session.dialogData.action,
                "resource": session.dialogData.resource,
                "frequency": session.dialogData.frequency,
                "time": session.dialogData.time,
                "specific_date": session.dialogData.datetime
            };
            
            
            updateAlerts(alert, session);
        }
    ])
    .triggerAction(
        {
            matches: 'configAlerts'
        }
    ).cancelAction(
        "cancelconfigAlerts", "Ok", 
        {
            matches: /^cancel$/i
        }
    );
}


function updateAlerts(alert, session){
    let query = "";
    let update = ""
    let upsert = false;
    
    //get the Bot Secret
    database.getBot(session.message.client_id, session.message.org_id, (err, doc)=>{
        if(err){
            session.endDialog('Sorry, I couldn\'t get Bot\'s information.');
            console.error('Error getting Bot Secret:'+JSON.stringify(session.message) + "\nDetails: "+err);
            return;
        }

        database.getQBToken(session.message.org_id, session.message.client_id, (err, tokenOjb)=>{
            if(err){
                console.error(`Error getting QB Token for org: ${session.message.org_id} and client: ${session.message.client_id} `);
                session.endDialog("Sorry. I can't find your company to set up the alerts.");
                return;
            }

            if (tokenOjb.company){
                //insert/update operation
                if (alert.action == "start"){
                    upsert = true;
                    update = {};
                    delete alert.action;
    
                    query = {"user.id": session.message.user.id, "binder.id": session.message.binder_id};  
                
                    update.$set = {
                        company: tokenOjb.company, 
                        user:{
                            id: session.message.user.id,
                            name: session.message.user.name
                        }, 
                        binder: {
                            id: session.message.binder_id,
                            client_id: session.message.client_id,
                            secret: doc.secret,
                            org_id: session.message.org_id
                        }
                    };

                    // Realtime
                    if(alert.resource == "invoice" || alert.resource == "estimate" || alert.resource == "sales_receipt" || alert.resource == "bill"){
                        update.$addToSet = {"alerts.realtime": alert.resource};
                    }
                    else{//Scheduled
                        update.$addToSet = {"alerts.scheduled": alert};
                    }
                }
                
                //delete operation
                if(alert.action == "stop"){
                    query = {"user.id":session.message.user.id, "binder.id":session.message.binder_id};
                    
                    //Realtime
                    if(alert.resource == "invoice" || alert.resource == "estimate" || alert.resource == "sales_receipt" || alert.resource == "bill"){
                        update = {$pull: {"alerts.realtime": alert.resource}};
                    }
                    else{//Scheduled
                        update = {$pull: {"alerts.scheduled": {"resource": alert.resource}}};
                    }
                }
                
                database.updateAlerts(query, update, upsert, (err, result)=>{

                    if(err){
                        session.endDialog('Sorry, I couldn\'t perform the alert operation.');
                        console.error('Error updating alert:'+JSON.stringify(alert) + "\nDetails: "+err);
                        return;
                    }
    
                    if(result){
                        session.endDialog('Alert updated successfully!');
                    }else{
                        session.endDialog('You already have this alert.');
                    }
    
                    session.beginDialog('showAlerts');
                });
            }
            else{
                session.send('Sorry, I cound\'t identify your company.');
                session.beginDialog("login");
            }
        });
    });
    
}


function padLeft(txt, fill, size){    
    var strTxt = txt.toString();
    var result = strTxt;

    if(strTxt.length < size){
        for(var i = strTxt.length; i < size; i++){
            result = fill + result;
        }
    }

    return result;
}