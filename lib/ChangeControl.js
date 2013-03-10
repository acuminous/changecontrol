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

var _ = require('underscore'),
	async = require('async'),
	os = require('os'),
	colors = require('colors'),
	crypto = require('crypto');

// Understands how to manage changes
function ChangeControl(redis, options) {

	// Understands how to manage the execution of a task
	function Change(id, script, options) {

		var options = options || {};
		var script = script;
		var precondition = options.precondition;
		var frequency = options.frequency;
		var checksum = crypto.createHash("md5").update(script + '').digest("hex");	
		var changeLog = ChangeLog();

		var toString = function(criteria) {
			return id.cyan;
		}

		var answersTo = function(partialId) {
			partialId = partialId || '*';
			var idMatchingPattern = '^' + RegExp.escape(partialId).replace(/\*/g, '.*?') + '$';
			return id.match(idMatchingPattern);
		}

		var validate = function(next) {
			workflow('validate', next);	
		}

		var execute = function(next) {
			logger.info('Executing ' + toString());
			workflow('execute', next);	
		}

		var pretend = function(next) {
			logger.info('Pretending to execute ' + toString());				
			workflow('pretend', next);	
		}	

		var sync = function(next) {
			logger.info('Synchronising ' + toString());		
			workflow('sync', next);	
		}	

		var workflow = function(mode, done) {
			async.series([
				_.partial(applicable, done),
				_.partial(runnable, mode, done),
				_.partial(run, mode),
				_.partial(audit, mode)
			], done);
		}

		var applicable = function(abort, next) {
			if (!precondition) return next();
			return precondition(abort, next);
		}

		var runnable = function(mode, abort, next) {
			if (_.contains(['sync'], mode)) return next();
			changeLog.getEntry(id, function(err, entry) {				
				if (err) return next(err);
				if (!entry || frequency === 'always') return next();				
				if (entry.checksum !== checksum) return next(new Error(toString() + ' has been modified'));
				if (_.contains(['execute', 'pretend'], mode)) logger.info('Skipping (already executed)'.grey);
				abort();
			});
		}

		var run = function(mode, next) {
			if (!_.contains(['execute'], mode)) return next();		
			script(next);
		}

		var audit = function(mode, next) {
			if (!_.contains(['execute', 'sync'], mode)) return next();		
			changeLog.audit({id: id, checksum: checksum}, function(err) {
				next(err);
			});
		}	

		return {
			answersTo: answersTo,
			toString: toString,
			validate: validate,
			execute: execute,
			pretend: pretend,
			sync: sync
		}	
	}

	// Understands how apply batch changes
	function ChangeSet(id) {
		var changeLog = ChangeLog();		
		var changes = [];
		var abort;

		var add = function(changeId, script, options) {
			var change = (arguments.length == 1) ? arguments[0] 
												 : Change(id + ':' + arguments[0], arguments[1], arguments[2]);
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
					_.partial(enqueue, subset, 'validate'),
					_.partial(enqueue, subset, 'execute')
				], callback);
			}, next);				
		}

		var pretend = function(partialId, next) {
			logger.info("Pretending to execute changeset " + id +  " [filter=" + partialId + ']');
			changeLog.lock(function(callback) {
				var subset = filterByChangeId(partialId);
				async.series([
					_.partial(enqueue, subset, 'validate'),
					_.partial(enqueue, subset, 'pretend')
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

	function ChangeLogLock() {
		var clientId = os.hostname() + ':' + process.pid;		
		var lockKey = [prefix, 'changelog', 'lock'].join(':');

		var lock = function(lockedCode, next) {
			logger.info("Locking changelog");
			async.series([
				obtain,
				lockedCode
			], function(err) {
				release(err, next)
			})			
		}

		var obtain = function(next) {
			async.waterfall([
				function(callback) {
					redis.watch(lockKey, callback);
				},
				function(ignore, callback) {
					redis.hgetall(lockKey, callback);
				},
				function(lockedBy, callback) {
					if (lockedBy && lockedBy.client !== clientId) return callback(
						new Error('Changelog was locked by ' + lockedBy.client.cyan + ' on ' + lockedBy.timestamp)
					);		
					var multi = redis.multi();			
					multi.hmset(lockKey, 'client', clientId, 'timestamp', new Date());
					multi.exec(callback);
				}
			], function(err) {
				redis.unwatch(function(unwatchErr) {
					if (err && unwatchErr) logger.error(unwatchErr.message);
					next(err ? err : unwatchErr);									
				})
			});
		}

		var release = function(err, next) {	
			unlock(false, function(unlockErr) {
				if (err && unlockErr) logger.error(unlockErr.message);
				next(err)
			})
		}

		var unlock = function(force, next) {
			logger.info("Unlocking changelog");
			async.waterfall([
				function(callback) {
					redis.hgetall(lockKey, callback);
				},
				function(lockedBy, callback) {				
					if ((lockedBy && lockedBy.client == clientId) || force) return callback();
					next();
				},
				function(callback) {	
					redis.del(lockKey, callback);
				}			
			], next);
		}

		return {
	 		lock: lock,
	 		unlock: unlock
		}		
	}

	// Understands how to audit change executions
	function ChangeLog() {
		var indexKey = [prefix, 'changelog', 'index'].join(':');
		var sequenceKey = [prefix, 'changelog', 'sequence'].join(':');
		var changeLogLock = ChangeLogLock();
		var lock = changeLogLock.lock;
		var unlock = changeLogLock.unlock

		var changeKey = function(id) {
			return [prefix, 'changelog', 'change', id].join(':');
		}

		var getEntry = function(id, next) {
			var redisKey = changeKey(id);
			redis.hmget(redisKey, 'checksum', 'user', 'timestamp', function(err, values) {
				if (!values[0]) return next(err, null);
				next(err, {
					id: id,
					checksum: values[0],
					user: values[1],
					timestamp: values[2]
				});
			});
		}

		var audit = function(change, next) {
			var key = changeKey(change.id);		
			redis.incr(sequenceKey, function(err, sequence) {
				var multi = redis.multi(sequenceKey);
				multi.hset(key, 'id', change.id);
				multi.hset(key, 'checksum', change.checksum);
				multi.hset(key, 'user', process.env['USER']);
				multi.hset(key, 'timestamp', new Date());
				multi.hset(key, 'sequence', sequence);
				multi.exec(next);
			})	
		}

		var dump = function(next) {
			async.waterfall([
				function(callback) {
					redis.keys(changeKey('*'), callback)
				},
				function(changeKeys, callback) {
					var multi = redis.multi();
					_.each(changeKeys, function(key) {
						multi.hgetall(key);
					});
					multi.exec(callback);
				},
				function(changes, callback) {
					changes.sort(function(a, b) {
						return parseInt(a.sequence) > parseInt(b.sequence);
					});
					callback(null, changes)
				}
			], function(err, changes) {
				if (err) return next(err);
				renderer.render(changes, next);
			});
		}

		var clear = function(partialId, next) {
			logger.info("Clearing changelog [filter=" + partialId + ']');
			lock(function(callback) { 
				var redisKey = changeKey(partialId);
				redis.keys(redisKey, function(err, changes) {					
					if (err) return callback(err);
					var multi = redis.multi();
					_.each(changes, function(change) {
						logger.info("Clearing " + change.toString());
						multi.del(change);
					})
					multi.exec(callback);
				})
			}, next);			
		}	

		return {
			clear: clear,
			audit: audit,
			getEntry: getEntry,
			dump: dump,
	 		lock: lock,
	 		unlock: unlock
		}	
	}

	var render = function(changes, next) {
		console.log('');
		console.log(['sequence', 'id', 'checksum', 'user', 'timestamp'].join(','))
		_.each(changes, function(change) {
			console.log([change.sequence, change.id, change.checksum, change.user, change.timestamp].join(','));
		})
		console.log('');		
		next();
	}	

	RegExp.escape = function(text) {
	    return text.replace(/[-[\]{}()+?.,\\^$|#\s]/g, "\\$&");
	}	

	var options = options || {};
	var logger = options.logger || console;
	var prefix = options.prefix || 'changecontrol';	
	var renderer = options.renderer || { render: render };	

	return {
		change: Change,
		changeSet: ChangeSet,
		changeLog: ChangeLog
	}
}

exports.ChangeControl = ChangeControl;

