const request = require('request');
const crypto = require('crypto');
const express = require('express');
const URLSafeBase64 = require('urlsafe-base64');
const fetch = require('node-fetch');
const dateFormat = require('dateformat');

const qb = require('./../modules/qbapi');


//in memory Bot token for faster access
let moxtra_tokens = {};

module.exports = {
    getQBwebhooks: (req, res, db) => {
        console.log("Data received:"+JSON.stringify(req.body));
        
        try{
            var qbEvents = req.body.eventNotifications;
        
            if(qbEvents && qbEvents.length > 0){
                
                //Loop through the QB events by Company/RealmID
                qbEvents.forEach((e)=>{
                    if(e.dataChangeEvent && e.dataChangeEvent.entities){
                        
                        //Loop through each Event
                        e.dataChangeEvent.entities.forEach((data)=>{
                            var date = new Date(data.lastUpdated)
    
                            //changing time to PST for Pivotal server Only
                            date.setHours(date.getHours()-7);
                            dateFormat.masks.eventTime = "mm/dd/yy 'at' h:MMtt";

                            let msg = "";    
                            let event = data.name.toLowerCase();

                            if(data.name.toLowerCase() == "salesreceipt"){
                                event = "sales_receipt";
                            }

                            const query = { "alerts.realtime": event,  "company.realmId": e.realmId};
                            const proj = {"_id": 0, "binder": 1};
                            // console.log("query:"+JSON.stringify(query) + JSON.stringify(proj) );

                            //Get Binders for the Alerts from DB
                            database.getAlerts(query, proj, (err, docs)=>{
                                if(err){
                                    console.error('Error getting Alerts: '+err);
                                }else{
                                    //only if someone wants this information, go to QB to get more details
                                    if(docs.length > 0){

                                        //uses the org_id and client_id of the first alert to get the token
                                        //make QB API request to get details for the Resource
                                        getQBresourceDetails(docs[0].binder.org_id, docs[0].binder.client_id, data.name, data.id, (err, resourceObj)=>{
                                            if(err){
                                                console.log(err);
                                                return;
                                            }

                                            if(data.name == "SalesReceipt"){
                                                data.name = "Sales Receipt";
                                            }

                                            if(resourceObj.DocNumber){
                                                msg = `[b]Alert:[/b] ${data.name} #${resourceObj.DocNumber} ${data.operation.toLowerCase()}d on ${dateFormat(date, "eventTime")}!`;                                                
                                            }else{
                                                msg = `[b]Alert:[/b] ${data.name} ID ${data.id} ${data.operation.toLowerCase()}d on ${dateFormat(date, "eventTime")}!`;
                                            }

                                            //send the Event msg to every binder
                                            docs.forEach((doc)=>{
                                                getMoxtraToken(doc.binder.org_id, doc.binder.client_id, (err, token)=>{
                                                    if(token){
                                                        //Post message to Moxtra
                                                        postMessageBinder(msg, doc.binder.id, token.access_token);
                                                    }else{
                                                        console.log('Error getting Moxtra token: '+err);
                                                    }
                                                });
                                            });
                                        });
                                    }else{
                                        console.log(`No alerts in db for realmId: ${e.realmId}`);
                                    }
                                }                   
                            });                            
                        });
                    }
                });               
            }else{
                console.log("No data found!");
            }
        }catch(err){
            console.log(err);
        }
    }
}

const getQBresourceDetails = (org_id, client_id, resource, resource_id, callback)=>{

    //get information from the QB Events
    const session = { message: { org_id, client_id }};
    const query = `Select DocNumber from ${resource.replace("_","")} Where Id = '${resource_id}'`;
    let responseObj = {};

    qb.queryQuickbooks(session, query, (err, result)=>{
        if(err){
            callback(err, null);
        }else{
            if(result){
                switch(resource.toLowerCase()){
                    case "invoice":
                        responseObj = result.Invoice[0];
                        break;
                    case "salesreceipt":
                        responseObj = result.SalesReceipt[0];
                        break;
                    case "estimate":
                        responseObj = result.Estimate[0];
                        break;
                    case "bill":
                        responseObj = result.Bill[0];
                        break;
                    default:
                        callback('No result from QB API', null);
                        break;
                }
            }else{
                callback('No result from QB API', null);
            }

            callback(null, responseObj);
        }
    });
    
};

const postMessageBinder = (text, binder_id, access_token)=>{
	const url = process.env.MOXTRA_API + '/' + binder_id + '/messages';
    var body = { message: {text: text } };

    console.log('Posting msg to Binder: '+binder_id);
	// console.log("url: " + url + " body: " + JSON.stringify(body));
    // console.log("binder_id: " + binder_id);
    // console.log("text: " + text);
    // console.log("access_token: " + access_token);
    
    request({
        method: 'post',
        url: url,
        headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Bearer ' + access_token
		},
        json: body
    }, function (err, response, body){
        if (err) {
            console.error(error);
        }else{
            if(response.statusCode != 200){
                //TO DO: Delete the alert if the binder is not valid anymore.
                console.error('Error postMessageBinder: response code: '+response.statusCode);
                console.error('Error postMessageBinder: response body: '+JSON.stringify(response.body));
                return;
            }else{//sucess
                //callback(null, response.body);
                console.log('Success postMessageBinder: response.body: '+JSON.stringify(response.body));
                return response.body;
            }
        }
    });
};

const getMoxtraToken = (org_id, client_id, callback)=>{
    if(moxtra_tokens[org_id+client_id] && isMoxtraTokenValid(moxtra_tokens[org_id+client_id])){
        console.log("Valid Moxtra token in memory!!");
        callback(null, moxtra_tokens[org_id+client_id]);
    }else{
        //first check in DB
        database.getBot(client_id, org_id, (err, result)=>{
            if(result && isMoxtraTokenValid(result.token)){
                console.log("Valid Moxtra token in DB!!");

                //store the token in memory for next requests
                moxtra_tokens[org_id+client_id] = result.token;
                callback(null, result.token);
            }else{
                //second generate a new token
                genMoxtraAccessToken(result._id, result.org_id, result.secret, (err, token)=>{
                    if(token){
                        console.log("New Moxtra Token generated!!");
                        //third store the new Token in the DB
                        database.updateBotToken(result._id, result.org_id, token, (err, udpdated)=>{
                            if(err || !udpdated){
                                console.error("New Moxtra token not stored in DB.");
                            }else{
                                console.log("New Moxtra Token stored in memory for future!!");
                                //store in memory too to quick access
                                moxtra_tokens[result.org_id+result._id] = token;
                            }
                            callback(null, token);
                        });
                    }else{
                        console.error('Error generating new Moxtra Token: '+err);
                        callback(err, null);
                    }
                });
            }
        });
    }
};

const genMoxtraAccessToken = function (client_id, org_id, secret, callback) {
    const timestamp = (new Date).getTime();
    const buf = client_id + org_id + timestamp;
    const sig = crypto.createHmac('sha256', new Buffer(secret)).update(buf).digest();
    const signature = URLSafeBase64.encode(sig);
    const url = process.env.MOXTRA_API + '/apps/token?client_id=' + client_id + '&org_id=' + org_id + '&timestamp=' + timestamp + '&signature=' + signature;
  
    console.log("GENERATING NEW MOXTRA TOKEN!");
    console.log("Moxtra Token Url: " + url);
    
    fetch(url)
      .then(response => {
        response.json().then(json => {
          token = {};        
          token.access_token = json.access_token;
          token.expired_time = timestamp + parseInt(json.expires_in) * 1000;
  
          console.log("New token:"+JSON.stringify(token));
  
          callback(null, token);
        });
      })
      .catch(error => {
        console.log(error);
        callback(error, null);
      });
  
};

// verify if still valid
const isMoxtraTokenValid = (token) => {
    // console.log("VALIDATING MOXTRA TOKEN!");
    if (token) {
      const timestamp = (new Date).getTime();
      return timestamp < token.expired_time;
    }else{
      return false;
    }
};