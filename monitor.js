var AWS = require('aws-sdk');
var Q = require('q');
var _ = require('underscore');
var http = require('http');
var https = require('https');
var moment = require('moment');
var rp = require('request-promise');
var url = require("url");


var accessKeyId = process.env.ACCESS_KEY_ID;
var secretAccessKey = process.env.SECRET_ACCESS_KEY;

//var elasticbeanstalk = new AWS.ElasticBeanstalk({
//    apiVersion: '2012-06-01',
//    region: 'eu-west-1',
//    accessKeyId: accessKeyId,
//    secretAccessKey: secretAccessKey
//});

var elb = new AWS.ELB({
    apiVersion: '2012-06-01',
    region: 'eu-west-1',
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey
});

//var cloudformation = new AWS.CloudFormation({
//    apiVersion: '2010-05-15',
//    region: 'eu-west-1',
//    accessKeyId: accessKeyId,
//    secretAccessKey: secretAccessKey
//});

var cloudWatch = new AWS.CloudWatch({
    apiVersion: '2010-08-01',
    region: 'eu-west-1',
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey
});

var ec2 = new AWS.EC2({
    apiVersion: '2016-11-15',
    region: 'eu-west-1',
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey
})

function cmsEC2Instance() {
    var deferred = Q.defer();
    var params = {
        //ApplicationName: "appTrendsStageTest",
        //VersionLabels: [
        //	"app-trends-ui-20160511-1126"
        //]
    };

    ec2.describeInstances(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            deferred.reject(err);
        }
        else {
            //console.log("Data: " + JSON.stringify(data));
            _.forEach(data.Reservations, function (reservation) {
                _.forEach(reservation.Instances, function (instance) {
                    _.forEach(instance.Tags, function (tag) {
                        if (tag.Key === 'Name' && tag.Value.indexOf('erab-Cms') != -1) {
                            deferred.resolve(instance.InstanceId);
                        }
                    });
                });
            });

        }
    });
    return deferred.promise;
}

function elbWithInstance(instanceId) {
    var deferred = Q.defer();
    var params = {
        //StackName: stackName, /* required */
        //NextToken: undefined
    };

    elb.describeLoadBalancers(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            deferred.reject(error);
        }
        else {
            //console.log("Data: " + JSON.stringify(data));
            _.forEach(data.LoadBalancerDescriptions, function (loadBalancerDesc) {
                _.forEach(loadBalancerDesc.Instances, function (instance) {
                    console.log("Instance in ELB: " + instance.InstanceId);
                    if (instance.InstanceId === instanceId) {
                        deferred.resolve(loadBalancerDesc);
                    }
                });
            });

        }
    });
    return deferred.promise;
}

function performHealthCheckCMS() {
    var deferred = Q.defer();
    console.log("Performing healthcheck CMS!!!");
    cmsEC2Instance().then(function (instanceId) {
        console.log("InstanceId: " + JSON.stringify(instanceId));
        elbWithInstance(instanceId).then(function (elb) {
            console.log("ELB: " + JSON.stringify(elb));

            var proxy = url.parse(process.env.QUOTAGUARDSTATIC_URL);
            var target  = url.parse("http://ip.quotaguard.com/");

            options = {
                host: proxy.hostname,
                port: proxy.port || 80,
                path: target.href,
                headers: {
                    "Proxy-Authorization": "Basic " + (new Buffer(proxy.auth).toString("base64")),
                    "Host" : target.hostname
                }
            };


            //var options = {
            //    host: elb.DNSName,
            //    //host: 'www.google.se',
            //    path: '/',
            //    port: 443,
            //    method: 'GET',
            //    rejectUnauthorized: false,
            //    requestCert: true,
            //    agent: false,
            //    headers: {
            //        "Proxy-Authorization": "Basic " + (new Buffer(proxy.auth).toString("base64")),
            //        "Host" : target.hostname
            //    }
            //};

            console.log("URL: " + options.host);

            var req = https.request(options, function (response) {
                console.log("Done with CMS Healthcheck. " + response.statusCode + " " + response.statusMessage);
                deferred.resolve({
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                });

            });
            req.end();

        }).catch(function (error) {
            console.log("Error: " + JSON.stringify(error));
            deferred.reject(error);
        });
    });
    return deferred.promise;
}

function performHealthCheckAPI() {
    var deferred = Q.defer();
    console.log("Performing healthcheck API!!!");

    var options = {
        method: 'GET',
        uri: 'https://api.erabu.sonymobile.com/info',
        resolveWithFullResponse: true
    };

    rp(options).then(function (response) {
            console.log("Done with API Healthcheck. " + response.statusCode);
            deferred.resolve({
                statusCode: response.statusCode,
            });
        })
        .catch(function (err) {
            console.log("API Error: " + JSON.stringify(err));
        });

    return deferred.promise;
}

function performHealthCheck() {
    var deferred = Q.defer();
    console.log("Performing healthcheck!!!");

    var promises = [];
    promises.push(performHealthCheckCMS());
    promises.push(performHealthCheckAPI());
    Q.allSettled(promises).then(function( results){
        console.log("All here: " + JSON.stringify(results));
        deferred.resolve(results);
    });

    return deferred.promise;
}

function getCMSAlarm() {
    var deferred = Q.defer();
    var params = {
        //ActionPrefix: 'STRING_VALUE',
        //AlarmNamePrefix: 'STRING_VALUE',
        //AlarmNames: [
        //    'STRING_VALUE',
        //    /* more items */
        //],
        //MaxRecords: 0,
        //NextToken: 'STRING_VALUE',
        //StateValue: 'OK | ALARM | INSUFFICIENT_DATA'
    };
    cloudWatch.describeAlarms(params, function (err, data) {
        if (err) {
            console.log(err, err.stack);
            deferred.reject(err);
        } // an error occurred
        else {
            //console.log(JSON.stringify(data));
            _.forEach(data.MetricAlarms, function (alarm) {
                //console.log("Alarm name: " + alarm.AlarmName);
                if (alarm.AlarmName === 'cmsHealthyHostCountAlarm') {
                    console.log("Resolving Alarm");
                    deferred.resolve(alarm);
                }
            });
        }
        deferred.reject(err);
    });

    return deferred.promise;
}

function getAlarmHistory(alarm) {
    var deferred = Q.defer();

    //var params = {
    //    AlarmName: alarm.AlarmName,
    //    EndDate: new Date,
    //    HistoryItemType: 'ConfigurationUpdate|StateUpdate|Action',
    //    MaxRecords: 100,
    //    //NextToken: 'STRING_VALUE',
    //    StartDate: new Date(moment().add(-2, 'weeks').toDate())
    //};

    var params = {
        AlarmName: alarm.AlarmName,
        EndDate: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789,
        //HistoryItemType: 'StateUpdate | Action | ConfigurationUpdate',
        MaxRecords: 100,
        //NextToken: 'STRING_VALUE',
        StartDate: new Date(moment().add(-2, 'weeks').toDate())
    };

    cloudWatch.describeAlarmHistory(params, function (err, data) {
        if (err) {
            console.log(err, err.stack);
            deferred.reject(err);
        } // an error occurred
        else {
            //console.log("Resolving AlarmHistory: " + JSON.stringify(data));
            var alarmHistory = [];
            _.forEach(data.AlarmHistoryItems, function (alarmHistoryItem) {
                if (alarmHistoryItem.HistoryItemType !== 'Action') {
                    alarmHistory.push(alarmHistoryItem);
                }
            })
            deferred.resolve(alarmHistory);
        }
    });
    return deferred.promise;
}

function fetchAlarmHistory() {
    var deferred = Q.defer();
    getCMSAlarm().then(function (alarm) {
        //console.log(JSON.stringify(alarm));
        getAlarmHistory(alarm).then(function (alarmHistory) {
            deferred.resolve(alarmHistory);
        })
    }).catch(function (error) {
        console.log("Error fetching Alarm and/or AlarmHistory: " + JSON.stringify(error));
        deferred.resolve(error);
    });

    return deferred.promise;
}

fetchAlarmHistory();

exports.performHealthCheck = performHealthCheck;
exports.fetchAlarmHistory = fetchAlarmHistory;

//function cfStackInfo() {
//    var deferred = Q.defer();
//    var params = {
//        //ApplicationName: "appTrendsStageTest",
//        //VersionLabels: [
//        //	"app-trends-ui-20160511-1126"
//        //]
//    };
//
//    cloudformation.listStacks(params, function (err, data) {
//        if (err) {
//            console.log(err, err.stack); // an error occurred
//            deferred.reject(error);
//        }
//        else {
//            //console.log("Data: " + JSON.stringify(data));
//            _.forEach(data.StackSummaries, function (stackSummary) {
//                if (stackSummary.StackName.indexOf('erabu-dev-infra-db-1-cms') != -1 && stackSummary.DeletionTime == undefined) {
//                    console.log("StackName: " + stackSummary.StackName + "      " + stackSummary.StackId + "  " + stackSummary.CreationTime + "   " + stackSummary.DeletionTime);
//                    deferred.resolve({
//                        stackSummary: stackSummary,
//                        nextToken: data.NextToken
//                    });
//                }
//            });
//
//        }
//    });
//    return deferred.promise;
//}

//function cfStackResources(stackName, nextToken) {
//    var deferred = Q.defer();
//    var params = {
//        StackName: stackName, /* required */
//        NextToken: undefined
//    };
//
//    cloudformation.listStackResources(params, function (err, data) {
//        if (err) {
//            console.log(err, err.stack); // an error occurred
//            deferred.reject(error);
//        }
//        else {
//            //console.log("Data: " + JSON.stringify(data));
//            //_.forEach(data.StackSummaries, function(stackSummary){
//            //    if(stackSummary.StackName.indexOf('erabu-dev-infra-db-1-cms') != -1 && stackSummary.DeletionTime == undefined) {
//            //        console.log("StackName: " + stackSummary.StackName + "      " + stackSummary.StackId + "  " + stackSummary.CreationTime + "   " + stackSummary.DeletionTime);
//            //        deferred.resolve({
//            //            stackSummary: stackSummary,
//            //            nextToken: data.NextToken
//            //        });
//            //    }
//            //});
//
//        }
//    });
//    return deferred.promise;
//}

//function performHealthCheck() {
//    var deferred = Q.defer();
//
//    var options = {
//        host: 'www.google.se',
//        path: '/',
//        port: 443,
//        method: 'GET',
//        rejectUnauthorized: false,
//        requestCert: true,
//        agent: false
//    };
//
//    console.log("URL: " + options.host);
//
//    var req = https.request(options, function (response) {
//        console.log(response.statusCode + " " + response.statusMessage);
//        deferred.resolve(response.statusCode + " " + response.statusMessage);
//
//    });
//    req.end();
//
//    return deferred.promise;
//}

//performHealthCheck();

//listELBs().then(function(list){
//    console.log("List: " + JSON.stringify(list));
//});

//function beanstalkInfo() {
//    var deferred = Q.defer();
//    var params = {
//        //ApplicationName: "appTrendsStageTest",
//        //VersionLabels: [
//        //	"app-trends-ui-20160511-1126"
//        //]
//    };
//
//    elasticbeanstalk.describeApplications(params, function (err, data) {
//        if (err) {
//            console.log(err, err.stack); // an error occurred
//            deferred.reject(err);
//        }
//        else {
//            console.log("Resolve here");
//            deferred.resolve(data); // successful response
//        }
//    });
//
//    return deferred.promise;
//}

//function testIt() {
//    elasticbeanstalk.describeApplications(params, function (err, data) {
//        if (err) {
//            console.log(err, err.stack); // an error occurred
//        }
//        else {
//            console.log("Resolve here");
//            return 5;
//        }
//    });
//}

//function testIt() {
//    console.log("Starting here");
//    var promises = [];
//    promises.push(beanstalkInfo());
//    Q.allSettled(promises).then(function (data) {
//        console.log("Data: " + JSON.stringify(data));
//        return 5;
//    }).catch(function (error) {
//        console.log("Error: " + JSON.stringify(error));
//    });
//    //setTimeout(function apa(){
//    //    console.log("Apa");
//    //}, 3000);
//}

//testIt();

//exports.handler = function (event, context, callback) {
//    console.log("Starting here");
//    var params = {
//        //ApplicationName: "appTrendsStageTest",
//        //VersionLabels: [
//        //	"app-trends-ui-20160511-1126"
//        //]
//    }
//
//    elasticbeanstalk.describeApplications(params, function (err, data) {
//        if (err) {
//            console.log(err, err.stack); // an error occurred
//            //deferred.reject(err);
//        }
//        else {
//            console.log("Resolve here");
//            //deferred.resolve(data); // successful response
//        }
//    });
//    console.log("Done with this Lambda");
//}

//var params = {
//	AttributeNames: [
//		'All'
//		//'Status | Color | Causes | ApplicationMetrics | InstancesHealth | All | HealthStatus | RefreshedAt',
//		/* more items */
//	],
//	EnvironmentId: 'e-jrftdc4md6',
//	EnvironmentName: 'erabu-dev-infra-db-1-cms-16-CmsApplication-SOOESHD5O2BI'
//};
//elasticbeanstalk.describeEnvironmentHealth(params, function(err, data) {
//	if (err) console.log(err, err.stack); // an error occurred
//	else     console.log(data);           // successful response
//});

//var params = {
//	EnvironmentName: 'erabu-dev-infra-db-1-cms-16-CmsApplication-SOOESHD5O2BI',
//	EndTime: new Date()
//};
//elasticbeanstalk.describeEvents(params, function(err, data) {
//	if (err) console.log(err, err.stack); // an error occurred
//	else     console.log(data);           // successful response
//	/*
//	 data = {
//	 Events: [
//	 {
//	 ApplicationName: "my-app",
//	 EnvironmentName: "my-env",
//	 EventDate: <Date Representation>,
//	 Message: "Environment health has transitioned from Info to Ok.",
//	 Severity: "INFO"
//	 },
//	 {
//	 ApplicationName: "my-app",
//	 EnvironmentName: "my-env",
//	 EventDate: <Date Representation>,
//	 Message: "Environment update completed successfully.",
//	 RequestId: "b7f3960b-4709-11e5-ba1e-07e16200da41",
//	 Severity: "INFO"
//	 },
//	 {
//	 ApplicationName: "my-app",
//	 EnvironmentName: "my-env",
//	 EventDate: <Date Representation>,
//	 Message: "Using elasticbeanstalk-us-west-2-012445113685 as Amazon S3 storage bucket for environment data.",
//	 RequestId: "ca8dfbf6-41ef-11e5-988b-651aa638f46b",
//	 Severity: "INFO"
//	 },
//	 {
//	 ApplicationName: "my-app",
//	 EnvironmentName: "my-env",
//	 EventDate: <Date Representation>,
//	 Message: "createEnvironment is starting.",
//	 RequestId: "cdfba8f6-41ef-11e5-988b-65638f41aa6b",
//	 Severity: "INFO"
//	 }
//	 ]
//	 }
//	 */
//});

//var params = {
//	InfoType: 'bundle', /* required */
//	EnvironmentId: 'e-c2prb7feip',
//	EnvironmentName: 'appTrendsStageTest-hvm-env'
//};
//elasticbeanstalk.retrieveEnvironmentInfo(params, function(err, data) {
//	if (err) console.log(err, err.stack); // an error occurred
//	else     console.log(data);           // successful response
//});


//var params = {
//	LoadBalancerName: 'udl-stage-Frontend-KWCZQ3LL5G8D', /* required */
//	Instances: [
//		{
//			InstanceId: 'i-094b5478d0cd9fe19'
//		},
//		/* more items */
//	]
//};
//elb.describeInstanceHealth(params, function(err, data) {
//	if (err) console.log(err, err.stack); // an error occurred
//	else {
//		console.log("ELB Instance Health:>>>>>>>>>>");
//		console.log(data);           // successful response
//	}
//});