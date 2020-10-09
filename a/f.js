//Imports
let eBay = require('ebay-node-api');
let aws = require('aws-sdk');
let utility = require('./utility');
let uuidv4 = require('uuid').v4;

//Configuration
utility.configureEbay();
utility.configureAWS();

//Lambda handlers
exports.addQuery = function(event, context, callback) {
    var query = event.queryStringParameters;
    query['id'] = uuidv4();

    utility.addNewQuery(query);

    const response = {
        'statusCode': 200,
        'headers': { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        'body': JSON.stringify(query)
    };
    callback(null, response)
}

exports.deleteQuery = function(event, context, callback) {
    const id = event.queryStringParameters.id;
    utility.clearTable(id);
    utility.deleteQuery(id);
    const response = {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': JSON.stringify({'id':id})
    };
    callback(null, response);
}

exports.refreshAllQueries = function(event, context, callback) {
    utility.refreshAllQueries();

    const response = {
        'statusCode': 200,
        'headers': { 'Content-Type': 'application/json' },
        'body': `Success refreshing all queries.`
    };
    callback(null, response)
}

exports.getAllQueries = async function(event, context) {
    const queries = await utility.getAllQueries();
    const response = {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': JSON.stringify(queries)
    };
    return response;
}

exports.getItems = async function(event, context) {
    const items = await utility.getItems(event.queryStringParameters.queryID);
    const response = {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': JSON.stringify(items)
    };
    return response;
}

/*
EbayQueries: A table of all queries for which cards are stored.
Model = {
    keywords: String,
    maxPrice: Float,
    *id: String
}

EbayCards: All the cards from all the queries
Model = {
    title: String,
    price: Float,
    *id: String,
    queryID: String <-> EbayQueries.id
}
*/