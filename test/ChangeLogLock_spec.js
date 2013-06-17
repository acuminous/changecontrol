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

var os = require('os');
var assert = require('assert');
var async = require('async');
var redisFactory = require('redis');
var ChangeLogLock = require('../lib/ChangeLogLock');
var logger = { info: function() {}, error: function() {} }
var redis;
var lock;

describe('ChangeLogLock', function() {

    before(function(done) {
        redis = redisFactory.createClient(); 
        done();       
    })

    beforeEach(function(done) {
        lock = ChangeLogLock.create('prefix', redis, { logger: logger} );
        redis.flushdb(done);        
    })

    after(function(done) {
        redis.flushdb(done);
    })

    it('should lock the change log', function(done) {
        lock.lock(function(callback) {
            redis.hgetall('prefix:changelog:lock', function(err, lockedBy) {
                assert.ifError(err);
                assert(lockedBy, 'Was not locked');
                assert.equal(lockedBy.client, os.hostname() + ':' + process.pid);
                assert.notEqual(new Date(lockedBy.timestamp).getTime(), NaN);
                callback();
            })
        }, done);
    });

    it('should not lock the changelog if already locked by another process', function(done) {
        async.series([
            async.apply(setLock, 'other:123'),
            async.apply(lock.lock, function() {})
        ], function(err) {
            assert(err.message.match(/^Changelog was locked by .*other:123.* on .*$/, 'Unexpected err: ' + err));
            redis.hgetall('prefix:changelog:lock', function(err, lockedBy) {
                assert.ifError(err);
                assert(lockedBy, 'Was not locked');
                assert.equal(lockedBy.client, 'other:123');
                done(err);
            })          
        });
    }); 

    it('should unlock the changelog when locked by the same process', function(done) {
        async.series([
            async.apply(setLock, os.hostname() + ':' + process.pid),        
            async.apply(lock.unlock, false)
        ], function(err) {
            assert.ifError(err);
            redis.exists('prefix:changelog:lock', function(err, exists) {
                assert.ifError(err);
                assert(!exists, 'changelog is still locked');
                done(err);
            });
        });
    });

    it('should not unlock when locked by another process', function(done) {
        async.series([
            async.apply(setLock, 'other:123'),
            async.apply(lock.unlock, false)
        ], function(err) {  
            assert.ifError(err);
            redis.exists('prefix:changelog:lock', function(err, exists) {
                assert.ifError(err);
                assert(exists, 'changelog was unlocked');
                done(err);
            }); 
        });
    });

    it('should forcefully unlock even when locked by another process', function(done) {
        async.series([
            async.apply(setLock, 'other:123'),
            async.apply(lock.unlock, true)
        ], function(err) {
            assert.ifError(err);
            redis.get('foo:changelog:lock', function(err, value) {
                assert.ifError(err);
                assert(!value, 'changelog is still locked');
                done(err);
            })
        });
    })    

    var setLock = function(client, next) {
        redis.hmset('prefix:changelog:lock', 'client', client, 'timestamp', new Date(), next);       
    }    
});
