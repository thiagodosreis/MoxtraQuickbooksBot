// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)

const cron = require('cron');
const request = require('request');
const crypto = require('crypto');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
require('dotenv-extended').load();

var job = new cron.CronJob({
    cronTime: '00 * * * * 1-5',
    onTick: ()=> {
        var date = new Date();

        //changing time to PST for Pivotal server Only
        date.setHours(date.getHours()-7);

        logme('job', date);
        runJob(date.toTimeString().substring(0,5));
        
    },
    onComplete: ()=>{
        console.log('Job completed');
    },
    start: false,
    timeZone: 'America/Los_Angeles'
  });

console.log('Starting the job.');
job.start();


const logme = (name, date)=> {
    console.log(`Running Job '${name}' on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}! `);
};

const runJob = (time)=>{
    const dburl = process.env.DATABASE;
    
    try{
        MongoClient.connect(dburl, (err, database) => {
            if(err){
                console.log("Database connection error: "+err);
                return;
            }
            // console.log("Successfully connected to MongoDB.");
            db = database.db();
            
            //get the alerts from DB
            const collection = db.collection('alerts');
            const aggregation = collection.aggregate([ 
                {$match: { "alerts.scheduled": {$elemMatch: {"frequency" : "daily", "time" : time} } } }, 
                {$project:  {
                    "_id": 0,
                    "binder":1,
                    "user":1,
                    "realmId":1,
                    "alerts.scheduled": {
                        $filter: {
                            input: "$alerts.scheduled",
                            as: "schedule",
                            cond: { $and: [
                                {$eq: ["$$schedule.time", time] },
                                {$eq: ["$$schedule.frequency", "daily"] }
                                ]}
                            }
                        }
                    }	
                },
                { $sort: {"binder.org_id": 1, "binder.client_id": 1} } 
            ]);
            
            console.log("AAAAAAAAAA");
            //post the messages to Bot Channel
            aggregation.forEach((doc)=>{
                console.log('Feched doc:'+JSON.stringify(doc));
                doc.alerts.scheduled.forEach((e)=>{
                    if(e.time == time){
                        console.log("----- > SENDING ALERT FOR: "+JSON.stringify(e));
                        sendAlert(doc, e.resource);
                    }
                });
            },(err)=>{
                if(err){
                    console.log('Error feching docs:'+err);
                }
            });

            // const query = {"alerts.scheduled.frequency": "daily", "alerts.scheduled.time": time};
            // const cursor = collec.find(query);
    
            //post the messages to Bot Channel
            // cursor.forEach((doc)=>{
            //     console.log('Feched doc:'+JSON.stringify(doc));
            //     doc.alerts.scheduled.forEach((e)=>{
            //         if(e.time == time){
            //             console.log("----- > SENDING ALERT FOR: "+JSON.stringify(e));
            //             sendAlert(doc, e.resource);
            //         }
            //     });
            // },(err)=>{
            //     if(err){
            //         console.log('Error feching docs:'+err);
            //     }
            // });
    
            //end DB connection
            database.close();
            // console.log("DB connection closed.");
        });
    }
    catch(err){
        console.log('Err executing the cron Job:'+err);
    }
}

//post a message to the Channel Server pretending to be Moxtra/User
const sendAlert = (alarm, resource)=>{
    const _url = process.env.BOT_CHANNEL_URL;
    
    // console.log("_url: "+_url);
    // console.log("alarm:"+JSON.stringify(alarm));
    // console.log("resource:"+resource);

    const post_json = {
        "message_type": "comment_posted",
        "binder_id": alarm.binder.id,   
        "client_id": alarm.binder.client_id,
        "org_id": alarm.binder.org_id,    
        "event": {
            "user": {
                "id": alarm.user.id,
                "name": alarm.user.name
            },
            "comment": {
                "text": resource
            }
        }
    };

    const signatureHash = crypto.createHmac('sha1', new Buffer(alarm.binder.secret))
                                .update(new Buffer(JSON.stringify(post_json), 'utf8'))
                                .digest('hex');

    request({
            method: 'post',
            url: _url,
            headers: {'x-moxtra-signature': "sha1="+signatureHash },
            json: post_json
        }, function (err, response, body){
            if (err) {
                console.error(err);
            }else{
                if(response.statusCode != 200){
                    console.log('Error sendAlert: response code: '+response.statusCode);
                    return;
                }else{//sucess
                    //callback(null, response.body);
                    console.log('Success sendAlert: response.body: '+response.body);
                    return response.body;
                }
            }
        });
};