const Token = require('./../modules/token');
const qb = require('./../modules/qbapi');

module.exports = function(bot) {
    bot.dialog("searchVendor",[
        function (session, args, next) {
            session.dialogData.displayMsg = true;

            //getting Vendor name from other Dialog
            if(args.vendorName){
                session.dialogData.vendorName = args.vendorName;
                session.dialogData.displayMsg = args.displayMsg;
            }else{
                //getting user name from this Dialog Intent Call
                if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                    console.log("searchVendor args:"+JSON.stringify(args.intent.entities));

                    var vendorName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerVendorName');
                    if(vendorName){
                        session.dialogData.vendorName = vendorName.entity;
                    }

                    //estimate Status (Open, Paid, Overdue)
                    var allVendors = builder.EntityRecognizer.findEntity(args.intent.entities, 'InvoiceStatus');
                    if(allVendors){
                        if(allVendors.resolution.values[0] == "All"){
                            session.dialogData.allVendors = allVendors.resolution.values[0];
                        }
                    }
                }
            }
            
            //check if there is a token
            Token.getToken(session.message.user.id, (err, result)=>{
                if(!result){
                    session.beginDialog("login");    
                }else{
                    next();
                }
            });
        },
        function(session, results, next){
            if (!session.dialogData.vendorName && !session.dialogData.allVendors){
                builder.Prompts.text(session, "Please, type the name of the vendor:");
            }else{
                next();
            }
        },
        function (session, results, next) {
            if(results.response){
                session.dialogData.vendorName = results.response;
            }

            // if(session.dialogData.displayMsg){
            //     session.send("Searching for vendor "+session.dialogData.vendorName+" ...");
            // }

            let query = "Select Id, DisplayName from Vendor";

            if(!session.dialogData.allVendors && session.dialogData.vendorName){
                query += " where DisplayName like%20%27%25"+session.dialogData.vendorName+"%25%27";
            }

            //Search for invoices on Quickbooks API
            qb.queryQuickbooks(session, query, (error, data)=>{
                if(error){
                    if(error.code == 888 || error.code == 999){
                        console.log(error.msg);
                    }else if(error.code == 401){
                        //token expired
                        session.send("Sorry, your QuickBooks session has expired. You need to login again into your account.");
                        session.beginDialog('login');
                    }else{
                        session.send("Sorry. I didn't find any vendor with that name!");
                        session.endDialog();
                    }
                } 
                else{
                    if(data && data.Vendor){
                        var vendors = {};
                        
                        for(var i=0; i<= data.Vendor.length-1; i++){
                            var vendor = {
                                id: data.Vendor[i].Id,
                                name: data.Vendor[i].DisplayName
                            };
                            vendors[data.Vendor[i].DisplayName] = vendor;
                        }
                        session.dialogData.vendors = vendors;

                        //found just one vendor. So select this
                        if(data.maxResults == "1"){
                            next({response: {entity: data.Vendor[0].DisplayName } });
                        }else{
                            builder.Prompts.choice(session, "I found "+data.maxResults+" vendor(s). Please select:", vendors, { listStyle: 2 });
                        }
                    }else{
                        session.send("Sorry. I didn't find any vendor with that name!");
                        session.endDialog();
                    }
                }
            });
        },
        function (session, results, next) {
            //storing vendor in the Conversation Storage container
            session.conversationData.vendorId = session.dialogData.vendors[results.response.entity].id;
            session.conversationData.vendorName = session.dialogData.vendorName = session.dialogData.vendors[results.response.entity].name;

            if(session.dialogData.displayMsg){
                session.endDialog(`Vendor selected.\n Name: [b]${session.conversationData.vendorName}[/b]`); 
            }else{
                session.endDialog();
            }
        }
    ])
    .triggerAction({
        matches: 'searchVendor'
    })
    .cancelAction(
        "cancelVendor", "Ok. Vendor search canceled.", 
        {
            matches: /^cancel$/i
        }
    );
}
