var rootpath = process.cwd() + '/',
    _ = require('underscore'),
    async = require('async'),    
    path = require('path'),
    fs = require("fs"),
    ChangeControl = require(rootpath + 'lib/ChangeControl').ChangeControl;

var argv = processArgs();
var redis = require('redis').createClient();
var changeControl = ChangeControl(redis, { logger: console });
var changeLog = changeControl.changeLog();
var mode = argv.m;
var changeId = argv.c;
var changeSets = getChangeSets();

var api = {
	'clear': _.partial(changeLog.clear, changeId),
	'dump': _.partial(changeLog.dump),
	'unlock': _.partial(changeLog.unlock, true),
	'pretend': executeChangeSets,
	'execute': executeChangeSets,
	'sync': executeChangeSets
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

function getChangeSets() {
  var baseDir = __dirname + "/changes/";
  return _.reduce(fs.readdirSync(baseDir), function(results, file) {
    return results.concat(require(baseDir + file).changeSet(changeControl, redis))
  }, [])
};

function executeChangeSets(next) {
  async.eachSeries(changeSets, function(changeSet, callback) {
    changeSet[mode](changeId, callback)
  }, next)
}

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