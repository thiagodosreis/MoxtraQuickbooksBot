var pdfmake = require('pdfmake');
const fs = require('fs');
const qb = require('./../modules/qbapi');

//http://pdfmake.org/playground.html

module.exports = {

    generateReport: (session, h2, h3, items, reportname)=>{
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
        
        //create the pdf json layout
        var docDefinition = {
            content: [
                {text: 'ACME - The Best Sales Company', style: 'header', alignment: 'center'},
                {text: h2, style: 'subheader', alignment: 'center'},
                {text: h3, style: 'date', alignment: 'center'},
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
        // console.log("docDefinition:"+JSON.stringify(docDefinition));

        var pdfDoc = printer.createPdfKitDocument(docDefinition);
        
        //save the pdf in the Server
        pdfDoc.pipe(fs.createWriteStream('pdfs/'+reportname)).on('finish',function(){
            //send the pdf to Moxtra
            qb.sendInline(session, 'pdfs/'+reportname, 'application/pdf', reportname);
        });
        pdfDoc.end();
    }

}   