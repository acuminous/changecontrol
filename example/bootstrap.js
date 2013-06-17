var rootpath = process.cwd() + '/';
var _ = require('underscore');
var async = require('async');   
var path = require('path');
var fs = require("fs");
var ChangeControl = require(rootpath + 'lib/index');

var argv = processArgs();
var redis = require('redis').createClient();
var mode = argv.m;
var changeId = argv.c;
var prefix = argv.p;
var changeLog = require('../lib/ChangeLog').create(prefix, redis);

function run() {

    var api = {
        'clear': async.apply(changeLog.clear, changeId),
        'dump': async.apply(changeLog.dump),
        'unlock': async.apply(changeLog.unlock, true),
        'pretend': executeChangeSets,
        'execute': executeChangeSets,
        'sync': executeChangeSets
    };

    var operation = api[mode];
    if (!operation) {
        console.error("Failed: " + mode + " is not a valid mode");
        process.exit(1);
    };

    operation(function(err) {
        if (err) console.error("Failed: " + err.message);
        else console.info("Done".green);
        process.exit(err ? 1 : 0);                  
    });
};

function executeChangeSets(next) {

    var changeSets = (function() {
        var baseDir = __dirname + "/changes/";
        return _.reduce(fs.readdirSync(baseDir), function(results, file) {
            return results.concat(require(baseDir + file).init(redis, changeLog))
        }, []);
    })();

    async.eachSeries(changeSets, function(changeSet, callback) {
        changeSet[mode](changeId, callback)
    }, next)
};

run();


function processArgs() {
	return require('optimist')
	    .usage('bootstrap\nUsage: $0')
	    .describe('m', 'Mode to run bootstrap (execute|pretend|sync|clear|unlock|dump)')
	    .alias('m', 'mode')
	    .default('m', 'execute')
	    .describe('c', 'Change id (optional, valid for execute|pretend|sync|clear)')
	    .alias('c', 'change')
	    .default('c', '*')
        .describe('p', 'The prefix to use to scope the changelog')
        .alias('p', 'prefix')
        .default('p', 'changecontrol')
	    .argv;
}