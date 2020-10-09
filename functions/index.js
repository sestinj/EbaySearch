//This is the file where you setup functions to deployed (is not used client side)

// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

exports.helloWorld = functions.https.onRequest((request, response) => {
    response.send("Hello from Firebase!");
});

exports.clearListings = functions.https.onRequest((request, response) => {
    db.collection("Cards").get().then(function(querySnap) {
        querySnap.forEach(function(doc) {
            db.collection(`Cards/${doc.id}/Listings`).get().then(function(querySnap2) {
                querySnap2.forEach(function(doc2) {
                    doc2.ref.delete(); 
                });
            return null;
            }).catch();
        });
    return null;
    }).catch();
});