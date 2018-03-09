Package.describe({
  name: 'jeremybyu:mmodbus',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'Adds a Modbus Client which queries a slave and stores information in MongoDB',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/JeremyBYU/modbus.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  "h5.modbus": "https://github.com/morkai/h5.modbus/archive/8eb063d6f00a07ba9b20076f037ed4cf1eea1d66.tar.gz",
  "serialport": "^6.0.4",
  "winston": "^2.4.0",
  "winston-mongodb": "^3.0.1"
});


Package.onUse(function(api) {
  api.versionsFrom('1.2.1');

  api.use(['ecmascript@0.1.5']);
  api.use(['aldeed:collection2@2.5.0', 'mikowals:batch-insert@1.1.13']);
  api.use(['underscore', 'adriancbo:chalk', 'okgrow:promise'], 'server');

  api.addFiles('lib/models/liveTags.js');
  api.addFiles('lib/models/scanGroups.js');
  api.addFiles('lib/models/tag.js');
  api.addFiles('lib/global.js');

  api.addFiles(['server/logging.js', 'server/utils.js', 'server/modbus.js', 'server/publications.js'], 'server');

  api.export('Mmodbus');
  api.export('MmodbusUtils');
});

Package.onTest(function(api) {
  api.use(['ecmascript@0.1.5', 'underscore']);
  api.use('tinytest');

  api.use('sanjo:jasmine@0.20.2');
  api.use('jeremybyu:mmodbus');
  api.addFiles(['tests/server/fixtures.js', 'tests/server/modbus-tests.js'], 'server');
});
