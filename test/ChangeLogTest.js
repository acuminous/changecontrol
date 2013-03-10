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
	ChangeControl = require('../lib/ChangeControl').ChangeControl;

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

	it('should clear the specified change', function(done) {
		async.series([
			getChange('test:foo').execute,
			getChange('test:bar').execute,
			_.partial(changeLog.clear, 'test:foo'),
			_.partial(assertKeyNotPresent, 'changecontrol:changelog:change:test:foo'),
			_.partial(assertKeyPresent, 'changecontrol:changelog:change:test:bar')		
		], done);
	})	

	it('should clear all matching changes', function(done) {
		async.series([
			getChange('test:foo:1').execute,
			getChange('test:foo:2').execute,
			getChange('test:bar').execute,
			_.partial(changeLog.clear, 'test:foo:*'),
			_.partial(assertKeyNotPresent, 'changecontrol:changelog:change:test:foo:1'),
			_.partial(assertKeyNotPresent, 'changecontrol:changelog:change:test:foo:2'),
			_.partial(assertKeyPresent, 'changecontrol:changelog:change:test:bar')		
		], done);
	})	



	it('should dump contents of the changelog', function(done) {
		redis.debug_mode = true;		
		async.series([
			getChange('test:a').execute,
			getChange('test:b').execute,
			getChange('test:c').execute,
			changeLog.dump
		], function(err, results) {	
			if (err) return done(err);
			var changes = results[3];
			assert.equal(changes.length, 3);
			assert.equal(changes[0].id, 'test:a');
			assert.equal(changes[1].id, 'test:b');
			assert.equal(changes[2].id, 'test:c');
			done(err);
		});
	})

	var assertKeyNotPresent = function(redisKey, next) {
		redis.exists(redisKey, function(err, exists) {
			assert(!exists, redisKey + ' exists after all');
			next(err);
		})
	}

	var assertKeyPresent = function(redisKey, next) {
		redis.exists(redisKey, function(err, exists) {
			assert(exists, redisKey + ' does not exist');
			next(err);
		})
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