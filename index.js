'use strict';

const gelfserver = require('graygelf/server');
const Firebase   = require('firebase');
const express    = require('express');
const http       = require('http');
const Q          = require('q');
const CFError    = require('cf-errors');

var createGelfServer = (port) => {
    let deferred = Q.defer();
    let created  = false;

    let gelfServer = gelfserver();
    gelfServer.on('error', (err) => {
        if (!created) {
            deferred.reject(new CFError({
                cause: err,
                message: `Failed to open gelf server on udp port: ${port}`
            }));
        }
        else {
            let error = new CFError({
                cause: err,
                message: `gelf server error`
            });
            console.error(error.stack);
        }
    });

    let sendMessage = (url, message) => {
        let ref = new Firebase(url);
        ref.push(message);
    };
    gelfServer.on('message', (gelf) => {
        console.log('received message', gelf.short_message);
        sendMessage(gelf._URL, gelf.short_message);
    });

    gelfServer.listen(port, () => {
        console.log(`Gelf server successfully started on udp port: ${port}`);
        deferred.resolve();
    });
    return deferred.promise;
};

var createHttpServer = (port) => {
    let deferred = Q.defer();
    let created  = false;

    let app = express();
    app.get('*', function (req, res) {
        res.send("ok");
    });

    let server = http.createServer(app);
    server.on('error', (err) => {
        if (!created) {
            deferred.reject(new CFError({
                cause: err,
                message: `Failed to open http server on tcp port: ${port}`
            }));
        }
        else {
            let error = new CFError({
                cause: err,
                message: `http server error`
            });
            console.error(error.stack);
        }
    });
    server.listen(port, () => {
        console.log(`Http server successfully started on tcp port: ${port}`);
        created = true;
        deferred.resolve();
    });
    return deferred.promise;
};

var firebaseAuthenticate = function (firebaseBaseUrl, firebaseSecret) {
    let baseRef = new Firebase(firebaseBaseUrl);
    return baseRef.authWithCustomToken(firebaseSecret)
        .then(() => {
            console.log(`Firebase authentication succeeded for path: ${firebaseBaseUrl}`);
        }, (err) => {
            return Q.reject(new CFError({
                cause: err,
                message: `Firebase authentication failed for path: ${firebaseBaseUrl}`
            }));
        });
};

Q()
    .then(() => {
        let port = process.env.PORT;
        if (!port) {
            return Q.reject(new CFError("PORT env var is missing"));
        }
        return Q.resolve()
            .then(() => {
                let firebaseBaseUrl = process.env.AUTH_URL;
                let firebaseSecret  = process.env.SECRET;
                if (firebaseSecret && firebaseBaseUrl) {
                    return firebaseAuthenticate(firebaseBaseUrl, firebaseSecret);
                }
            })
            .then(() => {
                return createGelfServer(port);
            })
            .then(() => {
                return createHttpServer(port);
            });
    })
    .catch((err) => {
        console.error(err.stack);
        process.exit(1);
    })
    .done();




