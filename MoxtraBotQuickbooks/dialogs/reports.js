const dateFormat = require('dateformat');
const qb = require('./../modules/qbapi');
const Token = require('./../modules/token');
const fs = require('fs');

var pdfmake = require('pdfmake');

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
            if(!Token.getToken(session.message.user.id)){
                session.beginDialog("login");    
            }else{
                next();
            }

            console.log("session.dialogData:"+JSON.stringify(session.dialogData));
        },
        function (session, results, next) {
            //not logged in
            console.log("results:"+JSON.stringify(results));
            if(!results.auth && !Token.getToken(session.message.user.id)){
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

                //get the json for the report
                qb.getReports(session, reportUrl, (err, result)=>{
                    if(err){
                        console.log('Error getting Report Data for Customer Balance Detail: '+err);
                        session.endDialog("Sorry I couldn't get the Report data from Quickbooks.");
                    }
                    else{
                        if(result){
                            console.log("Report result:"+JSON.stringify(result));
                            
                            //convert the json into a pdf
                            var fonts = {
                                Roboto: {
                                    normal: 'fonts/Roboto-Regular.ttf',
                                    bold: 'fonts/Roboto-Medium.ttf',
                                    italics: 'fonts/Roboto-Italic.ttf',
                                    bolditalics: 'fonts/Roboto-MediumItalic.ttf'
                                }
                            };


                            var PdfPrinter = require('pdfmake/src/printer');
                            var printer = new PdfPrinter(fonts);
                            
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

                            //create the pdf json layout
                            var docDefinition = {
                                content: [
                                    {text: 'ACME - The Best Sales Company', style: 'header', alignment: 'center'},
                                    {text: 'CUSTOMER BALANCE DETAIL', style: 'subheader', alignment: 'center'},
                                    {text: 'As of '+dateFormat(result.Header.Time,'longDate'), style: 'date', alignment: 'center'},
                                    {
                                        style: 'tableExample',
                                        layout: 'headerLineOnly', // optional
                                        table: {
                                            headerRows: 1,
                                            body: items
                                        }
                                    }
                                ],
                                styles: {
                                    header: {
                                        fontSize: 18,
                                        bold: true,
                                        margin: [0, 0, 0, 5]
                                    },
                                    subheader: {
                                        fontSize: 14,
                                        bold: false,
                                        margin: [0, 5, 0, 0]
                                    },
                                    date: {
                                        fontSize: 12,
                                        bold: false,
                                        margin: [0, 3, 0, 15]
                                    },
                                    tableExample: {
                                        fontSize: 10,
                                        margin: [0, 5, 0, 15]
                                    },
                                    tableHeader: {
                                        bold: true,
                                        fontSize: 13,
                                        color: 'black'
                                    },
                                    bold:{
                                        bold: true
                                    }
                                },
                                defaultStyle: {
                                    //alignment: 'right'
                                }
                                
                            }
                            console.log("docDefinition:"+JSON.stringify(docDefinition));

                            var pdfDoc = printer.createPdfKitDocument(docDefinition);
                            
                            //save the pdf in the Server
                            pdfDoc.pipe(fs.createWriteStream('pdfs/tables.pdf')).on('finish',function(){
                                session.send("PDF Report generated.");

                                //send the pdf to Moxtra
                                qb.sendInline(session, 'pdfs/tables.pdf', 'application/pdf', 'tables.pdf');
                            });
                            pdfDoc.end();
                        }
                        else{
                            session.endDialog("Sorry there is no report available for this customer.");
                        }
                    }
                });
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


const numberWithCommas = (x) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


