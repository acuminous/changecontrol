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
var async = require('async');
var redisFactory = require('redis');
var ChangeLog = require('../lib/ChangeLog');
var logger = { info: function() {}, error: function() {} }
var renderer = { 
    render: function(changes, next) { 
        next(null, changes);
    } 
};
var redis;

describe('ChangeLog', function() {

    var changeLog;
    var sequence = 0;

    before(function(done) {
        redis = redisFactory.createClient(); 
        done();       
    });

    beforeEach(function(done) {
        changeLog = ChangeLog.create('prefix', redis, {renderer: renderer, logger: logger});
        redis.flushdb(done);        
    });

    after(function(done) {
        redis.flushdb(done);
    });

    it('should clear the specified change', function(done) {
        async.series([
            async.apply(logChange, 'test:foo'),
            async.apply(logChange, 'test:bar'),
            async.apply(changeLog.clear, 'test:foo'),
            async.apply(assertKeyNotPresent, 'prefix:changelog:change:test:foo'),
            async.apply(assertKeyPresent, 'prefix:changelog:change:test:bar')      
        ], done);
    });

    it('should clear all matching changes', function(done) {
        async.series([
            async.apply(logChange, 'test:foo:1'),
            async.apply(logChange, 'test:foo:2'),
            async.apply(logChange, 'test:bar'),
            async.apply(changeLog.clear, 'test:foo:*'),
            async.apply(assertKeyNotPresent, 'prefix:changelog:change:test:foo:1'),
            async.apply(assertKeyNotPresent, 'prefix:changelog:change:test:foo:2'),
            async.apply(assertKeyPresent, 'prefix:changelog:change:test:bar')      
        ], done);
    })  

    it('should dump contents of the changelog', function(done) {
        redis.debug_mode = true;        
        async.series([
            async.apply(logChange, 'test:a'),
            async.apply(logChange, 'test:b'),
            async.apply(logChange, 'test:c'),
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


    function logChange(id, next) {
        var key = 'prefix:changelog:change:' + id;
        var multi = redis.multi();
        multi.hset(key, 'id', id);
        multi.hset(key, 'checksum', 'abcd123456');
        multi.hset(key, 'user', 'test-user');
        multi.hset(key, 'timestamp', new Date());
        multi.hset(key, 'sequence', sequence++);
        multi.exec(next);
    };

    var assertKeyNotPresent = function(redisKey, next) {
        redis.exists(redisKey, function(err, exists) {
            assert.ifError(err);
            assert(!exists, redisKey + ' exists after all');
            next();
        });
    };

    var assertKeyPresent = function(redisKey, next) {
        redis.exists(redisKey, function(err, exists) {
            assert.ifError(err);
            assert(exists, redisKey + ' does not exist');
            next();
        });
    };

});