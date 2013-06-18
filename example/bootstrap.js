/*
 * Copyright 2010 Acuminous Ltd
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var rootpath = process.cwd() + '/';
var _ = require('underscore');
var async = require('async');   
var path = require('path');
var fs = require("fs");

var argv = processArgs();
var redis = require('redis').createClient();
var mode = argv.m;
var changeId = argv.c;
var prefix = argv.p;

var ChangeControl = require(rootpath + 'lib/index');
var changeLog = ChangeControl.ChangeLog.create(prefix, redis);

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
            return results.concat(require(baseDir + file).init(changeLog, redis))
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