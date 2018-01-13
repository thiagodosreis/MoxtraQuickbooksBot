var dateFormat = require('dateformat');
var fs = require('fs');
var util = require('util');
var qb = require('./../qbapi.js');
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
                //Search for customer
                if (!session.conversationData.customerId || !session.dialogData.customerName){
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
                //get the json for the report
                getCustBalanceReport(session, (err, result)=>{
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
                            
                            //save the pdf
                            pdfDoc.pipe(fs.createWriteStream('pdfs/tables.pdf')).on('finish',function(){
                                session.send("PDF Report generated.");
                            });
                            pdfDoc.end();

                            //send to the channel and Moxtra


                            
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


//********* Quickbooks API Call ***************//

// Gets the JSON data for the Report: Customer Balance Detail
function getCustBalanceReport(session, callback){

    if(!session.userData.token.access_token || !session.userData.realmId || !session.conversationData.customerId){
        //clean the token obj
        session.message.token = null;

        //begin dialog for login again
        session.beginDialog("login");

        //send the error msg back to the call
        console.error("Missing parameters for getCustBalanceReport.");
        callback("Missing parameters for getCustBalanceReport.",null);
    }

    var _url = baseurl+"/v3/company/"+session.userData.realmId+"/reports/CustomerBalanceDetail?customer="+session.conversationData.customerId;

    qb.readQuickbooks(_url, session.userData.token.access_token, (err, response)=>{
        if(err){
            callback(err,"");
        }
        else{
            callback("", response);
        }
    });
}

//Call QuickBooks APIs for Search Invoice
function getReportPDF(session, invoiceId, invoiceDocNumber, callback){

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

const numberWithCommas = (x) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


