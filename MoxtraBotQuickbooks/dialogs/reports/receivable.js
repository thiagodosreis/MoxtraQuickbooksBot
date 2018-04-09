const dateFormat = require('dateformat');
const qb = require('./../../modules/qbapi');
const Token = require('./../../modules/token');
const report = require('./../../modules/report-pdfmaker');


module.exports = function(bot) {
    bot.dialog("reportAR",[
        function (session, args, next) {
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
            //get information form QB
            const reportUrl = "AgedReceivables?minorversion=4";
            generatesReport(session, reportUrl);
        }
    ])
    .triggerAction( { matches: 'reportAR'
        }
    );
}


function generatesReport(session, reportUrl){
    //get the json for the report
    qb.getReports(session, reportUrl, (err, result)=>{
        if(err){
            console.log('Error getting Report Data for A: '+err);
            session.endDialog("Sorry I couldn't get the AR Report data from Quickbooks.");
        }
        else{
            if(result.Rows){
                session.send("This is the current Account Receivable report:");
                console.log("Report result:"+JSON.stringify(result));
                
                //generate the itens
                var items = [];
                //header
                items.push(['CUSTOMER', 'CURRENT', '1 - 30', '31 - 60', {text:'61 - 90', alignment: 'right'}, {text:'91 AND OVER', alignment: 'right'}, {text:'TOTAL', alignment: 'right'} ]);

                //itens
                for(var i = 0; i <= result.Rows.Row.length - 1; i++){
                    var _row = result.Rows.Row[i];

                    if(_row.ColData){
                        items.push([{text: _row.ColData[0].value, margin: [ 5, 0, 0, 0 ]}, {text: numberWithCommas(_row.ColData[1].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[2].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[3].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[4].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[5].value), alignment: 'right'}, {text: numberWithCommas(_row.ColData[6].value), alignment: 'right'}]);
                    }else if(_row.Summary && !_row.group){ //subtotais
                        items.push([{text: _row.Header.ColData[0].value, margin: [ 5, 0, 0, 0 ]}, {text: numberWithCommas(_row.Summary.ColData[1].value), alignment: 'right'}, {text: numberWithCommas(_row.Summary.ColData[2].value), alignment: 'right'}, {text: numberWithCommas(_row.Summary.ColData[3].value), alignment: 'right'}, {text: numberWithCommas(_row.Summary.ColData[4].value), alignment: 'right'}, {text: numberWithCommas(_row.Summary.ColData[5].value), alignment: 'right'}, {text: numberWithCommas(_row.Summary.ColData[6].value), alignment: 'right'}]);
                    } else if(_row.group){ //footer
                        items.push([{text: _row.Summary.ColData[0].value, style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[1].value), style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[2].value), style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[3].value), style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[4].value), alignment: 'right', style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[5].value), alignment: 'right', style: 'bold'}, {text: numberWithCommas(_row.Summary.ColData[6].value), alignment: 'right', style: 'bold'}]);
                    }
                }

                // console.log("items:"+JSON.stringify(items));

                var h2 = "A/R AGING SUMMARY";
                var h3 = 'As of '+dateFormat(result.Header.Time,'longDate');

                report.generateReport(session, h2, h3, items, 'AR-Aging-Summary.pdf');
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