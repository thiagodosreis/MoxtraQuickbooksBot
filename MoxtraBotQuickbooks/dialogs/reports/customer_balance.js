const dateFormat = require('dateformat');
const qb = require('./../../modules/qbapi');
const Token = require('./../../modules/token');
const report = require('./../../modules/report-pdfmaker');


module.exports = function(bot) {
    bot.dialog("reportCustomerBalance",[
        function (session, args, next) {
            console.log("reportCustomerBalance args:"+JSON.stringify(args));

            //getting arguments typed by the user
            if(args && args.intent && args.intent.entities && args.intent.entities.length > 0){
                //customer
                var customerName = builder.EntityRecognizer.findEntity(args.intent.entities, 'CustomerName');
                if (customerName){
                    session.dialogData.customerName = customerName.entity;
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
            if(!results.auth){
                session.send("Sorry, no authorization");
                session.endConversation();
            }
            else{
                //Search for customer
                if (!session.conversationData.customerId || session.dialogData.customerName){
                    var args= {customerName: session.dialogData.customerName};
                    session.beginDialog('searchCustomer',args);
                }else{
                    next();
                }            
            }
        },
        function (session, results) {
            if(!session.conversationData.customerId){
                session.endDialog('Sorry no Customer selected.');
            }else{
                const reportUrl = "CustomerBalanceDetail?customer="+session.conversationData.customerId;
                generatesReport(session, reportUrl);
            }
        }
    ])
    .triggerAction({
        matches: 'reportCustomerBalance'
    })
    .cancelAction(
        "cancelReportCustomerBalance",{
            matches: /^cancel$/i   
    })
    .reloadAction(
        "restartReportCustomerBalance", "Ok. Let's start over.",{
            matches: 'startover'   
    })
    .endConversationAction(
        "endReportCustomerBalance", "Ok. Goodbye.",{
            matches: 'goodbye'   
    });
}

function generatesReport(session, reportUrl){
    //get the json for the report
    qb.getReports(session, reportUrl, (err, result)=>{
        if(err){
            console.log('Error getting Report Data for Customer Balance Detail: '+err);
            session.endDialog("Sorry I couldn't get the Report data from Quickbooks.");
        }
        else{
            if(result){
                console.log("Report result:"+JSON.stringify(result));
                
                //generate the itens
                var items = [];
                //header
                items.push(['DATE', 'TRANSACTION TYPE', 'NUM', 'DUE DATE', {text:'AMOUNT', alignment: 'right'}, {text:'OPEN BALANCE', alignment: 'right'}, {text:'BALANCE', alignment: 'right'} ]);
                items.push([{text: result.Rows.Row[0].Header.ColData[0].value, colSpan: 7}]);
                //itens
                for(var i = 0; i <= result.Rows.Row[0].Rows.Row.length - 1; i++){
                    var _row = result.Rows.Row[0].Rows.Row[i];
                    items.push([{text: dateFormat(_row.ColData[0].value + " 00:00:00",'mm/dd/yyyy'), margin: [ 5, 0, 0, 0 ]}, _row.ColData[1].value, _row.ColData[2].value, {text: dateFormat(_row.ColData[3].value + " 00:00:00",'mm/dd/yyyy')}, {text: numberWithCommas(_row.ColData[4].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[5].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[6].value), alignment: 'right'}]);
                }
                //footer
                items.push([{text: result.Rows.Row[0].Summary.ColData[0].value, style: 'bold', colSpan: 2},'', '', '', {text: "$"+numberWithCommas(result.Rows.Row[0].Summary.ColData[4].value), style: 'bold', alignment: 'right'}, {text: "$"+numberWithCommas(result.Rows.Row[0].Summary.ColData[5].value), style: 'bold', alignment: 'right'}, '' ]);
                items.push([{text: result.Rows.Row[1].Summary.ColData[0].value, style: 'bold'}, '', '','', {text: "$"+numberWithCommas(result.Rows.Row[1].Summary.ColData[4].value), style: 'bold', alignment: 'right'}, {text: "$"+numberWithCommas(result.Rows.Row[1].Summary.ColData[5].value), style: 'bold', alignment: 'right'}, '' ]);

                console.log("items:"+JSON.stringify(items));

                var h2 = "CUSTOMER BALANCE DETAIL";
                var h3 = 'As of '+dateFormat(result.Header.Time,'longDate');

                report.generateReport(session, h2, h3, items, 'CustomerBalance.pdf');
            }
            else{
                session.endDialog("Sorry there is no report available for this customer.");
            }
        }
    });
}

const numberWithCommas = (x) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


