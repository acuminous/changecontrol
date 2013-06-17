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

var assert = require('assert');
var _ = require('underscore');
var redisFactory = require('redis');
var async = require('async');
var os = require("os");
var logger = { info: function() {}, error: function() {} }
var Change = require('../lib/Change');
var ChangeLog = require('../lib/ChangeLog');
var changeLog;
var redis;
var fail = Error('fail');

describe('Change', function() {

    before(function(done) {
        redis = redisFactory.createClient(); 
        done();       
    });

    beforeEach(function(done) {
        changeLog = ChangeLog.create('prefix', redis, {logger: logger});              
        redis.flushdb(done);        
    });

    after(function(done) {
        redis.flushdb(done);
    });

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
    });

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
        var change = getChange('test:audit_execution');

        change.execute(function(err) {
            assert.ifError(err);        
            assertAuditEntry('test:audit_execution', '2a9537e90994ef147bc24ac1521bd45c', done);
        });
    }); 

    it('should abort when the precondition aborts', function(done) {
        var change = getChange('test:precondition_aborts', undefined, {
            precondition: function(abort, next) { abort() }
        });

        change.execute(function(err) {
            assert.equal(change.invocations(), 0);
            assertNoKey('prefix:test:precondition_aborts', done);
        })
    }); 

    it('should error when the precondition errors', function(done) {
        var change = getChange('test:precondition_has_errors', undefined, {
            precondition: function(abort, next) { next(fail) }
        });
        change.execute(function(err) {
            assert.equal(err, fail);
            assert.equal(change.invocations(), 0);
            assertNoKey('prefix:test:precondition_has_errors', done);
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
        var change1 = getChange('test:modified', function(next) { 
            invocations++;
            next() 
        });
        var change2 = getChange('test:modified', function(next) { 
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


    var assertAnswersTo = function(id, partialId) {
        assert(getChange(id).answersTo(partialId), 'Change ' + id + ' did not answer to [' + partialId + ']');
    };

    var assertDoesNotAnswerTo = function(id, partialId) {
        assert(!getChange(id).answersTo(partialId), 'Change ' + id + ' answered to [' + partialId + ']');
    };  

    var assertNoKey = function(redisKey, next) {
        redis.exists(redisKey, function(err, exists) {
            assert(!exists, redisKey + ' exists after all');
            next(err);
        });
    };

    var assertAuditEntry = function(id, checksum, next) {
        var redisKey = 'prefix:changelog:change:' +  id;
        redis.hmget(redisKey, 'id', 'checksum', 'user', 'timestamp', function(err, values) {
            assert.equal(values[0], id);
            assert.equal(values[1], checksum);
            assert.notEqual(values[2], '');
            assert.notEqual(new Date(values[3]).getTime(), NaN);
            next(err);
        });
    };

    var getChange = function(id, script, options) {

        var invocations = { count: 0 };
        var script = script || function(next) { 
            invocations.count++;
            next();
        };

        var defaults = { logger: logger };
        var change = Change.create(id, script, changeLog, _.defaults(options || {}, defaults));
        change.invocations = function() {
            return invocations.count;
        };

        return change;
    }
});