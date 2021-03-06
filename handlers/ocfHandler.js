var OIC = require('../oic/oic');
var DEV = require('iotivity-node')("client");

const RESOURCE_FOUND_EVENT = "resourcefound";
const RESOURCE_CHANGE_EVENT = "change";
const RESOURCE_DELETE_EVENT = "delete";
const DEVICE_FOUND_EVENT = "devicefound";
const PLATFORM_FOUND_EVENT = "platformfound";

const timeoutValue = 5000; // 5s
const timeoutStatusCode = 504; // Gateway Timeout
const socketTimeoutValue = 0; // No timeout

const okStatusCode = 200; // All right
const noContentStatusCode = 204; // No content
const internalErrorStatusCode = 500; // Internal error
const badRequestStatusCode = 400; // Bad request
const notFoundStatusCode = 404; // Not found

var discoveredResources = [];
var discoveredDevices = [];
var discoveredPlatforms = [];

// Turn on global presence listening
DEV.subscribe().then(
    function() {
        console.log("Subscribed for the presence notifications.");
    },
    function(error) {
        console.log("device.subscribe() failed with: ", error);
    });

var routes = function(req, res) {

    if (req.path == '/res')
        discoverResources(req, res);
    else if (req.path == '/d')
        discoverDevices(req, res);
    else if (req.path == '/p')
        discoverPlatforms(req, res);
    else {
        if (req.method == "GET")
            handleResourceGet(req, res);
        else if (req.method == "PUT")
            handleResourcePut(req, res);
        else {
            res.writeHead(badRequestStatusCode, {'Content-Type':'text/plain'});
            res.end("Unsupported method: " + req.method);
        }
    }

    function onResourceFound(event) {
        var resource = OIC.parseRes(event);
        discoveredResources.push(resource);
    }

    function onDeviceFound(event) {
        var device = OIC.parseDevice(event);
        discoveredDevices.push(device);
    }

    function onPlatformFound(event) {
        var platform = OIC.parsePlatform(event);
        discoveredPlatforms.push(platform);
    }

    function notSupported(req, res) {
        res.writeHead(internalErrorStatusCode, {'Content-Type':'text/plain'})
        res.end("Not supported operation: " + req.method + " " + req.path);
    }

    function discoverResources(req, res) {
        console.log("discoverResources");
        res.setTimeout(timeoutValue, function() {
            DEV.removeEventListener(RESOURCE_FOUND_EVENT, onResourceFound);
            res.writeHead(okStatusCode, 'Content-Type', 'application/json');
            res.end(JSON.stringify(discoveredResources));
        });

        console.log("%s %s", req.method, req.url);

        discoveredResources.length = 0;
        DEV.addEventListener(RESOURCE_FOUND_EVENT, onResourceFound);

        console.log("Discovering resources for %d seconds.", timeoutValue/1000);
        DEV.findResources().then(function() {
            // TODO: should we send in-progress back to http-client
            console.log("findResources() successful");
        })
        .catch(function(e) {
            res.writeHead(internalErrorStatusCode, {'Content-Type':'text/plain'})
            res.end("Error: " + e.message);
        });
    }

    function discoverDevices(req, res) {
        res.setTimeout(timeoutValue, function() {
            DEV.removeEventListener(DEVICE_FOUND_EVENT, onDeviceFound);
            res.writeHead(okStatusCode, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(discoveredDevices));
        });

        console.log("%s %s", req.method, req.url);

        discoveredDevices.length = 0;
        DEV.addEventListener(DEVICE_FOUND_EVENT, onDeviceFound);

        console.log("Discovering devices for %d seconds.", timeoutValue/1000);
        DEV.findDevices().then(function() {
            // TODO: should we send in-progress back to http-client
            console.log("findDevices() successful");
        })
        .catch(function(e) {
            res.writeHead(internalErrorStatusCode, {'Content-Type':'text/plain'})
            res.end("Error: " + e.message);
        });
    }

    function discoverPlatforms(req, res) {
        res.setTimeout(timeoutValue, function() {
            DEV.removeEventListener(PLATFORM_FOUND_EVENT, onPlatformFound);
            res.writeHead(okStatusCode, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(discoveredPlatforms));
        });

        console.log("%s %s", req.method, req.url);

        discoveredPlatforms.length = 0;
        DEV.addEventListener(PLATFORM_FOUND_EVENT, onPlatformFound);

        console.log("Discovering platforms for %d seconds.", timeoutValue/1000);
        DEV.findPlatforms().then(function() {
            console.log("findPlatforms() successful");
        })
        .catch(function(e) {
            res.writeHead(internalErrorStatusCode, {'Content-Type':'text/plain'})
            res.end("Error: " + e.message);
        });
    }

    function handleResourceGet(req, res) {

        if (typeof req.query.di == "undefined") {
            res.writeHead(badRequestStatusCode, {'Content-Type':'text/plain'})
            res.end("Query parameter \"di\" is missing.");
            return;
        }
        console.log("%s %s (fd: %d)", req.method, req.url, req.socket._handle.fd);

        function observer(event) {
            var fd = (res.socket._handle == null) ? -1 : res.socket._handle.fd;
            console.log("obs: %d, fin: %s, di: %s, fd: %d",req.query.obs, res.finished, req.query.di, fd);
            if (req.query.obs == true && res.finished == false) {
                var json = OIC.parseResource(event.resource);
                res.write(json);
            } else {
                event.resource.removeEventListener(RESOURCE_CHANGE_EVENT, observer);
                event.resource.removeEventListener(RESOURCE_DELETE_EVENT, deleteHandler);
            }
        }

        function deleteHandler(event) {
            console.log("Resource %s has been deleted", req.url);
            if (req.query.obs == true && res.finished == false) {
                res.end();
            }
        }

        DEV.retrieve({deviceId: req.query.di, path: req.path}, req.query).then(
            function(resource) {
                if (req.query.obs != "undefined" && req.query.obs == true) {
                    req.on('close', function() {
                        console.log("Client: close");
                        resource.removeEventListener(RESOURCE_CHANGE_EVENT, observer);
                        resource.removeEventListener(RESOURCE_DELETE_EVENT, deleteHandler);
                        req.query.obs = false;
                    });
                    res.writeHead(okStatusCode, {'Content-Type':'application/json'});
                    req.setTimeout(socketTimeoutValue);
                    resource.addEventListener(RESOURCE_CHANGE_EVENT, observer);
                    resource.addEventListener(RESOURCE_DELETE_EVENT, deleteHandler);
                } else {
                    var json = OIC.parseResource(resource);
                    res.writeHead(okStatusCode, {'Content-Type':'application/json'});
                    res.end(json);
                }
            },
            function(error) {
                res.writeHead(notFoundStatusCode, {'Content-Type':'text/plain'})
                res.end("Resource retrieve failed: " + error.message);
            }
        );
    }

    function handleResourcePut(req, res) {
        if (typeof req.query.di == "undefined") {
            res.writeHead(badRequestStatusCode, {'Content-Type':'text/plain'})
            res.end("Query parameter \"di\" is missing.");
            return;
        }

        res.setTimeout(timeoutValue, function() {
            res.writeHead(notFoundStatusCode, {'Content-Type':'text/plain'})
            res.end("Resource not found.");
        });

        var body = [];
        req.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            body = Buffer.concat(body).toString();
            var resource = {
                id: {deviceId: req.query.di, path: req.path},
                properties: JSON.parse(body)
            };
            console.log("PUT %s: %s", req.originalUrl, JSON.stringify(resource));
            DEV.update(resource).then(
                function() {
                    res.statusCode = noContentStatusCode;
                    res.end();
                },
                function(error) {
                    res.writeHead(notFoundStatusCode, {'Content-Type':'text/plain'})
                    res.end("Resource update failed: " + error.message);
                }
            );
        });
    }
}
module.exports = routes;
