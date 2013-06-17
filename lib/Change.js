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
var async = require('async');
var colors = require('colors');
var crypto = require('crypto');

var ChangeLog = require('./ChangeLog');

module.exports.create = function(id, script, changeLog, options) {

    var options = options || {};
    var logger = options.logger || console;
    var precondition = options.precondition;
    var frequency = options.frequency;
    var checksum = crypto.createHash("md5").update(script + '').digest("hex");  

    var toString = function(criteria) {
        return id.cyan;
    };

    var answersTo = function(partialId) {
        partialId = partialId || '*';
        var idMatchingPattern = '^' + RegExp.escape(partialId).replace(/\*/g, '.*?') + '$';
        return id.match(idMatchingPattern);
    };

    var validate = function(next) {
        workflow('validate', next); 
    };

    var execute = function(next) {
        logger.info('Executing ' + toString());
        workflow('execute', next);  
    };

    var pretend = function(next) {
        logger.info('Pretending to execute ' + toString());             
        workflow('pretend', next);  
    };  

    var sync = function(next) {
        logger.info('Synchronising ' + toString());     
        workflow('sync', next); 
    };

    var workflow = function(mode, done) {
        async.series([
            async.apply(applicable, done),
            async.apply(runnable, mode, done),
            async.apply(run, mode),
            async.apply(audit, mode)
        ], function(err) {
            done(err);
        });
    };

    var applicable = function(abort, next) {
        if (!precondition) return next();
        return precondition(abort, next);
    };

    var runnable = function(mode, abort, next) {
        if (_.contains(['sync'], mode)) return next();
        changeLog.getEntry(id, function(err, entry) {               
            if (err) return next(err);
            if (!entry || frequency === 'always') return next();                
            if (entry.checksum !== checksum) return next(new Error(toString() + ' has been modified'));
            if (_.contains(['execute', 'pretend'], mode)) logger.info('Skipping (already executed)'.grey);
            abort();
        });
    };

    var run = function(mode, next) {
        if (!_.contains(['execute'], mode)) return next();      
        script(next);
    };

    var audit = function(mode, next) {
        if (!_.contains(['execute', 'sync'], mode)) return next();      
        changeLog.audit({id: id, checksum: checksum}, function(err) {
            next(err);
        });
    };

    return {
        answersTo: answersTo,
        toString: toString,
        validate: validate,
        execute: execute,
        pretend: pretend,
        sync: sync
    }; 
};