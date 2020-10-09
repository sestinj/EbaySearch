//Variables:
var queries = [];
const emptyTableHTML = `<tr>
        <th>eBay ID</th>
        <th>Title</th>
        <th onclick="sortTable(comparePrice)">Price &#8661</th>
        <th onclick="sortTable(compareTime)">Hours Remaining &#8661</th>
      </tr>`
var currentSorting = "";

function addNewQuery() {
    let keywords = $("#keywords").val();
    let maxPrice = $("#maxPrice").val();
    let graded = $("#graded").prop("checked");
    let showAuctions = $("#showAuctions").prop("checked");
    
    hideQueryBuilder();
    
    //Add new query to DynamoDB
    const url = "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/a?keywords=" + keywords + "&maxPrice=" + maxPrice + "&graded=" + graded + "&showAuctions=" + showAuctions;
    $.ajax({url:url, success: (response) => {
        $("#selectQuery").append(`<option selected=true value="${response.id}">${response.keywords + " <= $" + response.maxPrice}</option>`);
        queries.push(response);
        loadItems(response.id);
    }});
}

function loadAllQueries() {
    $.ajax({url: "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/getAllQueries", success: function(response) {
        const select = $("#selectQuery");
        response.forEach((query) => {
            queries.push(query);
            select.append(`<option value=${query.id}>${query.keywords + " <= $" + query.maxPrice}</option>`);
        });
    }});
}

function showQueryBuilder() {
    const form = $("#newQueryForm");
    form.css("visibility", "visible");
    form.css("height", "auto");
}
function hideQueryBuilder() {
    const form = $("#newQueryForm")
    form.css("visibility", "hidden");
    form.css("height", "0px");
}
function clearTable() {
    const table = $("#table");
        table.html(emptyTableHTML); //Clear the table
}

function loadItems(queryID, clear) {
    var query = queries[0];
    for (i=0;i<queries.length;i++) {
        if (queries[i].id == queryID) {
            query = queries[i];
            break;
        }
    }
    
    const table = $("#table");
    table.css("visibility", "visible");
    $("#deleteQuery").css("visibility", "visible");
    
    //Set the queryTitle to show info
    const t = $("#queryTitle");
    t.text(`'${query.keywords}' for <= $${query.maxPrice}.\nMust be graded: ${query.graded.toLowerCase()}, Showing Auctions: ${query.showAuctions.toLowerCase() == "true"}`);
    
    //Call lambda to get items from dynamodb
    const url = "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/getItems?queryID="+queryID;
    if (clear) {
        clearTable();
    } //Append mode adds to the bottom of the table instead of clearing.
    //Recieve response with items and update title
    $.ajax({url:url, success: (response) => {
        response.forEach((item) => {
            const id = item.ebayID;
            table.append(`<tr><td> <a target="_blank" href="https://www.ebay.com/itm/${id}">${id}</a> </td>
            <td>${item.title}</td>
            <td>$${item.price}</td>
            <td>${((Date.parse(item.endTime)-Date.now())/3600000).toFixed(1)}</td></tr>`);
        });
        sortTable(compareTime);
    }});
}

function querySelected() {
    const table = $("#table");
    const selected = $("#selectQuery").find(":selected").attr("value");
    if (selected=="new") {
        showQueryBuilder();
    } else if (selected == "showAll") {
        hideQueryBuilder();
        for (var query of queries) {
            loadItems(query.id, false);
        }
        $("#queryTitle").text("Showing All");
    } else {
        hideQueryBuilder();
        loadItems(selected, true);
    }
}

function deleteQuery() {
    if (confirm("Are you sure you want to delete this query?")) {
        var queryID = $("#selectQuery").find(":selected").attr("value");
        console.log(queryID);
        
        clearTable();
        //NEED TO IMPLEMENT DELETE ALL under the show all query
        //Select the empty query and DELETE THE OLD ONE
        if (queryID == "showAll") {
            const len = queries.length;
            while (queries.length) {
                queryID = queries.pop().id;
                var url = "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/deleteQuery?id=" + queryID;
                $.ajax({url:url});
                
                $("#selectQuery").children()[3].remove();
            }
        } else {
            $("#selectQuery").find(":selected").remove();
            //Remove from queries array
            for (i=0;i<queries.length;i++) {
                if (queries[i] == queryID) {
                    queries.pop(i);
                }
            }
            const url = "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/deleteQuery?id=" + queryID;
            $.ajax({url:url});
        }
        $("#queryTitle").text("");
    }
}

function download_csv() {
    console.log("HERE");
    browser.downloads.download({
        url: 'https://ebay-search-e0427.firebaseapp.com/',
        filename: 'template.csv',
        conflictAction: 'uniquify'
    });
}

function csv_input() {
    const csv = $("#csv_input").prop('files')[0];
    
    //Upload to S3 bucket
    AWS.config.region = 'us-east-1'; // Region
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:f6e5a6f0-5c12-44ef-ab8c-71b86c29f20b',
    });
    
    var s3 = new AWS.S3({
      apiVersion: "2006-03-01",
      params: { Bucket: 'ebay-cards-input-csv' }
    });
    
    var upload = new AWS.S3.ManagedUpload({
        params: { Bucket: 'ebay-cards-input-csv',
               Key: 'ebay-cards-input-csv/' + "queryList.csv",
               Body: csv,
               ACL: 'public-read'
      }
    });
    
    var promise = upload.promise();
    promise.then(function(data) {
      alert("Successfully uploaded query list.");
    },
    function(err) {
      return alert("There was an error uploading your list: ", err.message);
    })
}



function comparePrice(tr1, tr2) {
    return parseFloat($(tr1).children()[2].textContent.substring(1)) > parseFloat($(tr2).children()[2].textContent.substring(1))
}

function compareTime(tr1, tr2) {
    return parseFloat($(tr1).children()[3].textContent) > parseFloat($(tr2).children()[3].textContent)
}

function sortTable(compare) {
    const table = $("#table");
    var rows = table.prop("rows");
    
    var ascending = false;
    if (currentSorting == String(compare)) {
        ascending = !compare(rows[1], rows[rows.length-1]);
    }
    currentSorting = String(compare);
    
    //Starts at 1, because 0 is headers
    for (var i=1;i<rows.length;i++) {
        for (var j=1;j<i;j++) {
            if (ascending == compare(rows[i], rows[j])) {
                rows[i].parentNode.insertBefore(rows[i], rows[j]); //Move row i before row j
            }
        }
    }
}



//Do stuff on page load:
loadAllQueries();