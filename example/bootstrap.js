var rootpath = process.cwd() + '/',
    _ = require('underscore'),
    path = require('path'),
    ChangeControl = require(rootpath + 'lib/ChangeControl').ChangeControl

var argv = processArgs();
var redis = require('redis').createClient();
var changeControl = ChangeControl(redis, { logger: console });
var changeLog = changeControl.changeLog();
var mode = argv.m;
var changeId = argv.c;

var changeSet = require('./changes/release-1.0').changeSet(changeControl, redis);

var api = {
	'clear': _.partial(changeLog.clear, changeId),
	'dump': _.partial(changeLog.dump),
	'unlock': _.partial(changeLog.unlock, true),
	'pretend': _.partial(changeSet.pretend, changeId),
	'execute': _.partial(changeSet.execute, changeId),
	'sync': _.partial(changeSet.sync, changeId)
}

var operation = api[mode];
if (!operation) {
	console.error("Failed: " + mode + " is not a valid mode");
	process.exit(1);
}

operation(function(err) {
	if (err) console.error("Failed: " + err.message);
	else console.info("Finished");
	process.exit(err ? 1 : 0);					
})

function processArgs() {
	return require('optimist')
	    .usage('bootstrap\nUsage: $0')
	    .describe('m', 'Mode to run bootstrap (execute|pretend|sync|clear|unlock|dump)')
	    .alias('m', 'mode')
	    .default('m', 'execute')
	    .describe('c', 'Change id (optional, valid for execute|pretend|sync|clear)')
	    .alias('c', 'change')
	    .default('c', '*')
	    .argv;
}