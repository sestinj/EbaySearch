#https://linuxconfig.org/introduction-to-ebay-api-with-python-the-finding-api-part-2
#https://developer.ebay.com/devzone/finding/callref/types/ItemFilterType.html
from __future__ import print_function # Python 2/3 compatibility
import gevent
import grequests #This needs to be imported at the top (https://github.com/gevent/gevent/issues/1016)
import boto3
import pandas as pd
import json
import io

s3 = boto3.client('s3')

queryAttributes = ["showAuctions", "graded", "keywords", "maxPrice"]

def handler(event, context):
    record = event["Records"][0]
    bucket = record['s3']['bucket']['name']
    key = record['s3']['object']['key']
    print("RIGHT BEFORE data = s3.get_object...BUCKET: " + bucket + ", KEY: " + key)
    data = s3.get_object(Bucket=bucket, Key=key)
    #Delete csv from s3 after it is retrieved
    s3.delete_object(Bucket=bucket, Key=key)
    contents = data['Body'].read()
    df = pd.read_csv(io.BytesIO(contents))

    urls = []
    for index, row in df.iterrows():
        url = "https://yvautfn4jg.execute-api.us-east-1.amazonaws.com/default/a?"
        for attr in queryAttributes:
            url += attr + "=" + str(row[attr]) + "&"
        urls.append(url)
    
    responses = (grequests.get(url) for url in urls)
    rs = grequests.map(responses)

    for r in rs:
        if r.status_code != '200':
            return "Failure"
    return "Success"


#with open('event.json') as file:
#    data = json.load(file)
#    handler(data, None)