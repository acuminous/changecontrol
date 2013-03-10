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

var assert = require("assert"),
	_ = require('underscore'),	
	async = require('async'),
	os = require("os"),
	ChangeControl = require('../lib/Changecontrol').ChangeControl;

describe('ChangeLog', function() {

	var redis;
	var logger = { info: function() {}, error: function() {} }
	var changeControl;
	var changeLog;
	var renderer = { 
		render: function(changes, next) { 
			next(null, changes);
		} 
	};

	before(function(done) {
		redis = require('redis').createClient();
 		changeControl = ChangeControl(redis, { logger: logger, renderer: renderer });			
		changeLog = changeControl.changeLog();
		done();
	})

	beforeEach(function(done) {
		redis.flushdb(done);		
	})

	after(function(done) {
		redis.flushdb(done);
	}) 		

	it('should lock the changelog', function(done) {
		changeLog.lock(function(callback) {
			redis.hgetall('changecontrol:changelog:lock', function(err, lockedBy) {
				assert.equal(lockedBy.client, os.hostname() + ':' + process.pid);
				assert.notEqual(new Date(lockedBy.timestamp).getTime(), NaN);
				callback();
			})
		}, done);
	})	

	it('should not lock the changelog if already locked by another process', function(done) {
		async.series([
			_.partial(lockChangeLog, 'other:123'),
			_.partial(changeLog.lock, function() {})
		], function(err) {
			assert(err.message.match(/^Changelog was locked by .*other:123.* on .*$/, 'Unexpected err: ' + err));
			redis.hgetall('changecontrol:changelog:lock', function(err, lockedBy) {
				assert.equal(lockedBy.client, 'other:123');
				done(err);
			})			
		});
	})

	it('should unlock the changelog when locked by the same process', function(done) {
		async.series([
			_.partial(lockChangeLog, os.hostname() + ':' + process.pid),		
			_.partial(changeLog.unlock, false)
		], function(err) {
			if (err) return done(err);
			redis.exists('changecontrol:changelog:lock', function(err, exists) {
				assert(!exists, 'changelog is still locked');
				done(err);
			})	
		});
	})

	it('should not unlock when locked by another process', function(done) {
		async.series([
			_.partial(lockChangeLog, 'other:123'),
			_.partial(changeLog.unlock, false)
		], function(err) {	
			if (err) return done(err);
			redis.exists('changecontrol:changelog:lock', function(err, exists) {
				assert(exists, 'changelog was unlocked');
				done(err);
			})	
		});
	})	

	it('should forcefully unlock even when locked by another process', function(done) {
		async.series([
			_.partial(lockChangeLog, 'other:123'),
			_.partial(changeLog.unlock, true)
		], function(err) {
			if (err) return done(err);			
			redis.get('changecontrol:changelog:lock', function(err, value) {
				assert(!value, 'changelog is still locked');
				done(err);
			})
		});
	})

	var lockChangeLog = function(client, next) {
		redis.hmset('changecontrol:changelog:lock', 'client', client, 'timestamp', new Date(), next);		
	}

	var getChange = function(id, script, options) {
		var invocations = { count: 0 };
		var script = script || function(next) { 
			invocations.count++;
			next();
		};

		var change = changeControl.change(id, script, options);
		change.invocations = function() {
			return invocations.count;
		}
		return change;
	}

});