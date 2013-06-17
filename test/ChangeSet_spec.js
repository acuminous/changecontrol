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

var assert = require("assert");
var _ = require('underscore');	
var async = require('async');
var os = require("os");
var ChangeSet = require('../lib/ChangeSet');
var Change = require('../lib/Change');

describe('ChangeSet', function() {

	var redis;
	var changeSet;
	var logger = { info: function() {}, error: function() {} }	

	before(function(done) {
		redis = require('redis').createClient();
		done();
	});

	beforeEach(function(done) {
		redis.flushdb(done);		
	})

	after(function(done) {
		redis.flushdb(done);
	}) 		

	it('should execute all changes', function(done) {
		var change1 = getChange('test:a')
		var change2 = getChange('test:b')		
		var changeSet = ChangeSet.create('test', { redis: redis, logger: logger });
		changeSet.add(change1);
		changeSet.add(change2);
		changeSet.execute('*', function(err, next) {
			if (err) return done(err);
			assert.equal(change1.invocations(), 1);
			assert.equal(change2.invocations(), 1);
			done();
		})
	})

	it('should execute the specified change', function(done) {
		var change1 = getChange('test:a')
		var change2 = getChange('test:b')		
		var changeSet = ChangeSet.create('test', { redis: redis, logger: logger });
		changeSet.add(change1);
		changeSet.add(change2);
		changeSet.execute('test:a', function(err, next) {
			if (err) return done(err);
			assert.equal(change1.invocations(), 1);
			assert.equal(change2.invocations(), 0);
			done();
		})
	})	

	it('should execute the specified change', function(done) {
		var change1 = getChange('test:a')
		var change2 = getChange('test:b')		
		var changeSet = ChangeSet.create('test', { redis: redis, logger: logger });
		changeSet.add(change1);
		changeSet.add(change2);
		changeSet.execute('test:a', function(err, next) {
			if (err) return done(err);
			assert.equal(change1.invocations(), 1);
			assert.equal(change2.invocations(), 0);
			done();
		})
	})

	it('should abort execution if a change has been modified', function(done) {
		redis.hset('prefix:changelog:change:test:b', 'checksum', 'foobar', function(err) {
			if (err) return done(err);
			var change1 = getChange('test:a')
			var change2 = getChange('test:b')		
			var changeSet = ChangeSet.create('test', { redis: redis, logger: logger });
			changeSet.add(change1);
			changeSet.add(change2);
			changeSet.execute('test:*', function(err, next) {
				assert.equal(err.message, '\u001b[36mtest:b\u001b[39m has been modified');
				assert.equal(change1.invocations(), 0);
				assert.equal(change2.invocations(), 0);
				done();
			})
		});
	})	

	var getChange = function(id, script, options) {
		var invocations = { count: 0 };
		var script = script || function(next) { 
			invocations.count++;
			next();
		};

		var defaults = { prefix: 'prefix', redis: redis, logger: logger }
		var change = Change.create(id, script, _.defaults(options || {}, defaults));
		change.invocations = function() {
			return invocations.count;
		}
		return change;
	}	
});