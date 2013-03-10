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
describe('Change', function() {

	var redis;
	var changeControl;
	var logger = { info: function() {}, error: function() {} }		
	var fail = Error('fail');

	before(function(done) {
		redis = require('redis').createClient();
		changeControl = ChangeControl(redis, {logger: logger});
		done();
	});

	beforeEach(function(done) {
		redis.flushdb(done);
	})	

	after(function(done) {
		redis.flushdb(done);
	})	

	it('should answer to suitable ids', function(done) {
		assertAnswersTo('a', '');		
		assertAnswersTo('a', 'a');
		assertAnswersTo('a', 'a*');
		assertAnswersTo('ab', 'a*');
		assertAnswersTo('a:b', 'a*');
		assertAnswersTo('a:b:c', 'a:*:c');		
		assertAnswersTo('a:b:c:d:e', 'a:*:c:*:e');		
		assertAnswersTo('-', '-');
		assertAnswersTo('a^', 'a^');

		assertDoesNotAnswerTo('a', 'b');
		assertDoesNotAnswerTo('ba', 'a*');
		assertDoesNotAnswerTo('a:b:c', 'a:*:d');		
		done();
	})

	var assertAnswersTo = function(id, partialId) {
		assert(getChange(id).answersTo(partialId), 'Change ' + id + ' did not answer to [' + partialId + ']');
	}

	var assertDoesNotAnswerTo = function(id, partialId) {
		assert(!getChange(id).answersTo(partialId), 'Change ' + id + ' answered to [' + partialId + ']');
	}	

	it('should describe itself', function(done) {
		assert.equal(getChange('test:describe').toString(), '\u001b[36mtest:describe\u001b[39m');
		done();
	})

	it('should execute when there is no precondition', function(done) {
		var change = getChange('test:no_precondition');

		change.execute(function(err) {
			assert.equal(change.invocations(), 1);
			done(err);
		});
	});

	it('should execute when the precondition is satisfied', function(done) {
		var change = getChange('test:precondition_satisfied', undefined, {
			precondition: function(abort, next) { next() }
		});

		change.execute(function(err) {
			assert.equal(change.invocations(), 1);
			done(err);			
		})
	});

	it('should audit change executions', function(done) {
		var change = getChange('change:test:audit_execution');

		change.execute(function(err) {
			if (err) return done(err);			
			assertAuditEntry('change:test:audit_execution', 'f82393ba6afdb21f9fa0f2664993ee15', done);
		});
	});	

	it('should abort when the precondition is aborts', function(done) {
		var change = getChange('change:test:precondition_aborts', undefined, {
			precondition: function(abort, next) { abort() }
		});

		change.execute(function(err) {
			assert.equal(change.invocations(), 0);
			assertNoKey('changecontrol:changelog:change:test:precondition_aborts', done);
		})
	});	

	it('should error when the precondition errors', function(done) {
		var change = getChange('test:precondition_has_errors', undefined, {
			precondition: function(abort, next) { next(fail) }
		});
		change.execute(function(err) {
			assert.equal(err, fail);
			assert.equal(change.invocations(), 0);
			assertNoKey('changecontrol:changelog:change:test', done);
		})
	});

	it('should only execute a change once', function(done) {
		var change = getChange('test:once');
		async.series([
			change.execute,
			change.execute
		], function(err) {
			assert.equal(change.invocations(), 1);
			done(err);
		})
	});

	it('should error if a previously executed change has been modified', function(done) {
		var invocations = 0;
		var change1 = changeControl.change('test:modified', function(next) { 
			invocations++;
			next() 
		});
		var change2 = changeControl.change('test:modified', function(next) { 
			invocations++;
			next();
		});
		async.series([
			change1.execute,
			change2.execute
		], function(err) {
			assert.equal(err.message, '\u001b[36mtest:modified\u001b[39m has been modified');
			assert.equal(invocations, 1);
			done();
		})
	});	

	it('should execute a run always change every time', function(done) {
		var change = getChange('test:run_always', undefined, { frequency: 'always' });
		async.series([
			change.execute,
			change.execute
		], function(err) {
			assert.equal(change.invocations(), 2);
			done(err);
		})
	});	

	it('should pretend to execute a change', function(done) {
		var change = getChange('test:pretend');
		async.series([
			change.pretend
		], function(err) {
			if (err) return done(err);
			assert.equal(change.invocations(), 0);	
			assertNoKey('changelog:change::test', done);
		})
	});		

	it('should synchronise changelog with new change', function(done) {
		var change = getChange('test:synchronise_new_change');
		async.series([
			change.sync
		], function(err) {
			if (err) return done(err);
			assert.equal(change.invocations(), 0);
			assertAuditEntry('test:synchronise_new_change', 'f82393ba6afdb21f9fa0f2664993ee15', done);
		})
	});	

	it('should synchronise changelog with change when previously executed', function(done) {
		var change = getChange('test:synchronise_existing_change');
		async.series([
			function(next) {
				redis.hmset(
					'changecontrol:changelog:change:test:synchronise_existing_change',
					'id', 'test:synchronise_existing_change', 
					'checksum', 'foobar', 
					next);
			},
			change.sync
		], function(err) {
			if (err) return done(err);
			assert.equal(change.invocations(), 0);
			assertAuditEntry('test:synchronise_existing_change', 'f82393ba6afdb21f9fa0f2664993ee15', done);
		})
	});	

	it('should validate a change without executing it', function(done) {
		var change = getChange('test:validate_change');

		change.validate(function(err) {
			assert.equal(change.invocations(), 0);
			done(err);
		});
	});			

	it('should report an invalid change without executing it', function(done) {
		var change = getChange('test:report_invalid_change');

		async.series([
			function(next) {
				redis.hset('changecontrol:changelog:change:test:report_invalid_change', 'checksum', 'foobar', next);
			},
			function(next) {
				change.validate(function(err) {
					assert.equal(err.message, '\u001b[36mtest:report_invalid_change\u001b[39m has been modified');
					assert.equal(change.invocations(), 0);
					next();
				});
			}
		], done)
	});

	var assertNoKey = function(redisKey, next) {
		redis.exists(redisKey, function(err, exists) {
			assert(!exists, redisKey + ' exists after all');
			next(err);
		})
	}

	var assertAuditEntry = function(id, checksum, next) {
		var redisKey = 'changecontrol:changelog:change:' +  id;
		redis.hmget(
			redisKey, 
			'id', 'checksum', 'user', 'timestamp', 
			function(err, values) {
				assert.equal(values[0], id);
				assert.equal(values[1], checksum);
				assert.notEqual(values[2], '');
				assert.notEqual(new Date(values[3]).getTime(), NaN);
				next(err);
			}
		)		
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