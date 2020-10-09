const aws = require('aws-sdk');
const eBay = require('ebay-node-api');
const request = require('request');
const https = require('https');
const uuidv4 = require('uuid').v4;

function awsCallback(err, data, func, errMessage="Error on AWS Callback") {
    if (err) console.log(errMessage+": ", JSON.stringify(err));
    else {
        func(data);
    }
}

function addNewQuery(query) {
    var params = {
        TableName:"EbayQueries",
        Item: {
            "keywords": query.keywords,
            "maxPrice": query.maxPrice,
            "id": query.id,
            "graded": query.graded,
            "showAuctions": query.showAuctions
        }
    }
    docClient.put(params, function(err, data) {
        if (err) console.log(JSON.stringify(err));
        else refreshQuery(query);//This takes a long time...had to set timeout to 5 seconds instead of 3 for f.addQuery
    });
}

function cartesianProduct(sets, previous=null, initial=true) {
    if (initial) {
        var product = [];
        for (i=0;i<sets[0].length;i++) {
            product[i] = [sets[0][i]];
        }
        return cartesianProduct(sets.slice(1), product, false);
    } else if (previous==null) console.log("Previous should only be null when initial is true");

    if (sets.length == 0) return previous;

    var product = [];
    var i = 0;
    for (var set of previous) {
        for (var element of sets[0]) {
            var newSet = set.slice(); newSet.push(element);
            product[i] = newSet;
            i++;
        }
    }
    return cartesianProduct(sets.slice(1), product, false);
}

const testQuery = {keywords: 'larry bird rookie', graded: true, maxPrice: 500, showAuctions: true};
async function ebaySearch(query) {
    const aspects = {"Professional+Grader": [
    encodeURI("Professional Sports (PSA)"),
    encodeURI("Sportscard (SGC)"),
    encodeURI("Beckett (BCCG)"),
    encodeURI("Beckett (BGS)"),
    encodeURI("Beckett (BVG)")]};

    if (!query.graded) {
        aspects["Professional+Grader"] = ["Not+Professionally+Graded", "Not+Specified"];
    }

    const combinations = cartesianProduct(Object.values(aspects));
    const bigPromise = new Promise(function(bigResolve, bigReject) {
        var promises = [];
        for (combination of combinations) {
            var url = `https://svcs.ebay.com/services/search/FindingService/v1?
            OPERATION-NAME=findItemsAdvanced
            &SERVICE-VERSION=1.13.0
            &SECURITY-APPNAME=NathanSe-CardSear-PRD-58223104d-1da215bc
            &RESPONSE-DATA-FORMAT=JSON
            &REST-PAYLOAD=true
            &keywords=${encodeURI(query.keywords)}`
    
            for (i=0;i<Object.keys(aspects).length;i++) {
                var aspectName = Object.keys(aspects)[i];
                url += `&aspectFilter(0).aspectName=${aspectName}
                &aspectFilter(0).aspectValueName=${combination[i]}`
            }
    
            url += `&itemFilter(0).name=MaxPrice
            &itemFilter(0).value=${query.maxPrice}
            &itemFilter(1).name=ListingType
            &itemFilter(1).value=AuctionWithBIN
            &itemFilter(1).value=FixedPrice`
    
            if (query.showAuctions) {
                url += `&itemFilter(1).value=Auction`
            }
            url = url.replace(/(\r\n|\n|\r)/gm," ").replace(/ /g, '') ; //Remove linebreaks
            const promise = new Promise(function(resolve, reject) {
                request.get(url, function(err, response, body) {
                    if (err) reject(err);
                    resolve(JSON.parse(body).findItemsAdvancedResponse[0].searchResult[0].item);
                });
            });
            promises.push(promise);
        }
        //Once the last promise is resolved, then turn all of the promises into objects
        var finalItems = [];
        promises[promises.length-1].then((data) => {
            //Check that results were returned (i.e. data is iterable)
            if (data != null){
                for (item of data) {
                    finalItems.push(item);
                }
            }
            var promisesLeft = promises.length-1;
            for (promise of promises) {
                promise.then((data2) => {
                    if (data2 != null) {
                        for (item of data2) {
                            finalItems.push(item);
                        }
                    }
                    promisesLeft--;
                    if (promisesLeft==0) {
                        for (item of finalItems) {
                            console.log(item.title[0]);
                        }
                        bigResolve(Array.from(new Set(finalItems)));
                    }
                });
            }
        });
    });
    
    //&paginationInput.entriesPerPage=${query.limit} no longer using limit...eBay's default=100

    return bigPromise;
}
ebaySearch(testQuery);

function refreshQuery(query) {
    //Clear before replacement
    clearTable(query.id);

    //Call eBay API
    ebaySearch(query).then((data) => {
        for (i=0;i<data.length;i++) {
            var itm = data[i];
            var params = {
                TableName:"EbayCards",
                Item:{
                    "id": uuidv4(),
                    "ebayID": itm.itemId[0],
                    "queryID": query.id,
                    "title": itm.title[0],
                    "price": parseFloat(itm.sellingStatus[0].currentPrice[0].__value__),
                    "endTime": itm.listingInfo[0].endTime[0]
                }
            };
            //Put new items in DynamoDB
            docClient.put(params, function(err, data) {
                if (err) console.log("There was an error adding the item: ", JSON.stringify(err));
            })
        }
    });
}

function refreshAllQueries() {
    getAllQueries().then((queries) => {
        queries.forEach(function(query) {
            refreshQuery(query);
        });
    });
}

async function getAllQueries() {
    const promise = new Promise(function(resolve, reject) {
        docClient.scan({TableName:"EbayQueries"}, function(err, data) {
            if (err) {
                console.log("Error scanning EbayQueries table: ", JSON.stringify(err));
                reject(err);
            } else {
                var queries = [];
                data.Items.forEach(function(queryItm) {
                    queries.push(queryItm);
                });
                resolve(queries);
            }
        });
    });
    return promise
}

async function getItems(queryID) {
    var params = {
        TableName:"EbayCards",
        FilterExpression: "#qid = :id",
        ExpressionAttributeNames: {
            "#qid": "queryID"
        },
        ExpressionAttributeValues: {
            ":id": queryID
        }
    }
    const promise = new Promise(function(resolve, reject) {
        var items = [];
        docClient.scan(params, function(err, data) {
            data.Items.forEach((item) => {
                items.push(item);
            });
            resolve(items);
        });
    });
    return promise;
}

function clearTable(queryID) {
    //DELETE all current items
    var params = {
        TableName:"EbayCards",
        FilterExpression: "#qid = :id",
        ExpressionAttributeNames: {
            "#qid": "queryID"
        },
        ExpressionAttributeValues: {
            ":id": queryID
        }
    }
    docClient.scan(params, function(err, data) {
        if (err) console.log("Err querying: ", JSON.stringify(err));
        else {
            data.Items.forEach(function(card) {
                var params = {
                    TableName:"EbayCards",
                    Key: {
                        "id":card.id
                    }
                }
                docClient.delete(params, function(err, data) {
                    if (err) console.log("Error deleting item: ", err);
                });
            });
        }
    });
}

function deleteQuery(queryID) {
    var params = {
        TableName: "EbayQueries",
        Key: {
            "id": queryID
        }
    };
    docClient.delete(params, function(err, data) {
        if (err) console.log("Error deleting query: ", err);
    });
}

function configureAWS() {
    aws.config.update({
        region: "us-east-1",
        endpoint: "https://dynamodb.us-east-1.amazonaws.com"
    });
    docClient = new aws.DynamoDB.DocumentClient();        
}

function configureEbay() {
    ebay = new eBay({
        clientID: 'NathanSe-CardSear-PRD-58223104d-1da215bc',
        clientSecret: 'PRD-8223104dcd13-445b-40a8-99e2-9b37',
        body: {
            grant_type: 'client_credentials',
            scope: 'https://api.ebay.com/oauth/api_scope'
        }
    });
}

module.exports = {
    awsCallback: awsCallback,

    addNewQuery: addNewQuery,

    refreshQuery: refreshQuery,

    refreshAllQueries: refreshAllQueries,

    getAllQueries: getAllQueries,

    getItems: getItems,

    clearTable: clearTable,

    deleteQuery: deleteQuery,

    configureAWS: configureAWS,
    
    configureEbay: configureEbay,

    ebaySearch: ebaySearch
}