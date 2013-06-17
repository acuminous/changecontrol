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

var _ = require('underscore');
var	async = require('async');
var	colors = require('colors');

var ChangeLog = require('./ChangeLog');
var Change = require('./Change');

/*
1. Pass in changeLog as 2nd parameter
2. Remove redis from options
3. Remove prefix from options
4. Repeat for Change
5. Amend how a change is created

*/
module.exports.create =	function(id, options) {

	var options = options || {};
	var redis = options.redis;
	var logger = options.logger || console;
	var prefix = options.prefix || 'changecontrol';			

	var changeLog = ChangeLog.create({prefix: prefix, logger: logger, redis: redis});		
	var changes = [];
	var abort;

	var add = function(changeId, script, options) {
		var change = (arguments.length == 1) ? arguments[0] 
											 : Change.create(id + ':' + arguments[0], arguments[1], arguments[2]);
		changes.push(change)
	}

	var filterByChangeId = function(partialId) {
		return _.filter(changes, function(change) {
			return change.answersTo(partialId);
		});
	}

	var execute = function(partialId, next) {
		logger.info("Executing changeset " + id +  " [filter=" + partialId + ']');
		changeLog.lock(function(callback) {
			var subset = filterByChangeId(partialId);
			async.series([
				async.apply(enqueue, subset, 'validate'),
				async.apply(enqueue, subset, 'execute')
			], callback);
		}, next);				
	}

	var pretend = function(partialId, next) {
		logger.info("Pretending to execute changeset " + id +  " [filter=" + partialId + ']');
		changeLog.lock(function(callback) {
			var subset = filterByChangeId(partialId);
			async.series([
				async.apply(enqueue, subset, 'validate'),
				async.apply(enqueue, subset, 'pretend')
			], callback);
		}, next);
	}		

	var sync = function(partialId, next) {
		logger.info("Synchronising changeset " + id + " [filter=" + partialId + ']');
		changeLog.lock(function(callback) {
			var subset = filterByChangeId(partialId);
			enqueue(subset, 'sync', callback);
		}, next)
	}	

	var enqueue = function(changes, mode, next) {
		if (changes.length == 0) next();

		var queue = async.queue(function(change, callback) {
			if (abort) return callback();
			change[mode](callback);
		}, 1);

		queue.drain = function() { 
			next(abort);
		};

		queue.push(changes, function(err) {
			if (err) abort = err;
		});		
	}

	return {
		add: add,
		pretend: pretend,
		execute: execute,
		sync: sync
	}	
}	

RegExp.escape = function(text) {
    return text.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&");
}
