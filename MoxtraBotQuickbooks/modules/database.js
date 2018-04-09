'use strict';

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
require('dotenv').load();

const dburl = process.env.DATABASE;
let db;

module.exports = {

    connect: (callback) => {
        MongoClient.connect(dburl, (err, database) => {
            assert.equal(null, err);
            
            console.log("Successfully connected to MongoDB.");
    
            db = database.db();
            callback();
        });
    },

    getQBToken: (user_id, callback) => {
        const collec = db.collection('tokens');
        const query = {_id: user_id};
    
        collec.findOne(query, (err, doc)=>{
            assert.equal(null, err);
    
            if(!doc){
                callback("Error: No token with the user_id: "+user_id+" found in the DB.", null);
            }else{
                callback(null, doc);
            }
        });
    },

    updateQBToken: (user_id, token, callback) => {
        const collec = db.collection('tokens');
    
        if(user_id && token){
            collec.updateOne({_id: user_id}, {$set: token }, {upsert: true} , (err, r)=>{
                if(err){
                    callback(err, null);
                }else{
                    if(r.modifiedCount == 1 || r.upsertedId){
                        callback(null, true);
                    }else{
                        callback(null, false);
                    }
                }
            });
        }else{
            callback("Missign key data: user_id and token.",null);
        }  
    }

}