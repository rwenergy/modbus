// TODO Clean up all logging. Make sure what is necessary is what is logged, be mindful of console and database.
// TODO Benchmark Modbus Reads and Writes
//  Required NPM Modules
let modbus = Npm.require('h5.modbus');

//  This is our globally exported object from this package
Mmodbus = class Mmodbus {
  /**
   * Constructor for Mmodbus Object.  Pass in configuraton objects
   *
   * @param {String} event
   *
   * @param {Function} cb
   *
   * @returns {Object} Provdes MModbus object
   */
  constructor({
    scanOptions: {
      supressTransationErrors = true, retryOnException = false, maxConcurrentRequests = 1, defaultUnit = 1, defaultMaxRetries = 1, defaultTimeout = 1000
    } = {},
    rtu: {
      serialPort = '/dev/ttyACM0', baudRate = 9600, rtype = 'serial'
    } = {},
    ip: {
      type = 'tcp', host = '127.0.0.1', port = 502, autoConnect = true, autoReconnect = true, minConnectTime = 2500, maxReconnectTime = 5000 // eslint-disable-line
    } = {},
    groupOptions: {
      coilReadLength = 25, holdingRegisterLength = 25, maxCoilGroups = 5, maxHoldingRegisterGroups = 10
    } = {},
    useIP = true,
    scanInterval = 5000
  }) {
    //  Options Object
    this.options = {};
    //  Options for H5 Modbus
    this.options.scanOptions = {
      supressTransationErrors, retryOnException, maxConcurrentRequests, defaultUnit, defaultMaxRetries, defaultTimeout
    };
    this.options.rtu = {
      serialPort, baudRate, rtype
    };
    this.options.ip = {
      type, host, port, autoConnect, autoReconnect, minConnectTime, maxReconnectTime
    };
    //  Options for MModbus
    this.options.groupOptions = {
      coilReadLength, holdingRegisterLength, maxCoilGroups, maxHoldingRegisterGroups
    };
    this.options.useIP = useIP;
    this.options.scanInterval = scanInterval;

    //  create logger
    this.logger = Logger;
    //  Add Colleciton Reference
    this.collections = {
      LiveTags: LiveTags,
      ScanGrups: ScanGroups,
      Tags: Tags
    };
    //  console.log(this.options);
    //  console.log(this.options.scanOptions);
    //  placeholder for the Meteor Timers
    this.modbus_timer = null;
    this.initialize();
  }
  /**

  */
  initialize() {
    let self = this;
    let masterConfig = MmodbusUtils.funcs.createMasterConfiguration(self);
    //  console.log(masterConfig);
    console.log(masterConfig)
    self.master = modbus.createMaster(masterConfig);

    //  Generate basic event handling for master connections
    //  console.time('createMasterEvents')
    self.createMasterEvents();
    //  console.timeEnd('createMasterEvents')
    //  Configure Modbus Collections 'Live Tags' & 'Scan Groups'
    //  console.time('configureModbusCollections')
    self.configureModbusCollections();
    //  console.timeEnd('configureModbusCollections')

    //  self.startAllScanning();
    //  console.log(masterConfig);
  }
  createMasterEvents() {
    let self = this;
    MmodbusUtils.funcs.syncMasterOn(self, 'error', (err) => {
      self.logger.mmodbus_error('[master#error] %s', err.message);
      self.logger.mmodbus_error('[master#error] %s', err);
      self.stopAllScanning();
    });
    MmodbusUtils.funcs.syncMasterOn(self, 'disconnected', () => {
      self.logger.mmodbus_warn('[master#disconnected]');
      self.stopAllScanning();
    });
    //  asyncMaster('connected',function(){console.log('test');});
    MmodbusUtils.funcs.syncMasterOn(self, 'connected', () => {
      self.logger.mmodbus_info('[master#connected]');
      self.logger.mmodbus_info('Beggining Scanning of Coils');
      self.startAllScanning();
    });
  }
  resetLiveTags() {
    LiveTags.remove({});
  }
  resetScanGroups() {
    ScanGroups.remove({});
  }
  configureModbusCollections() {
    let self = this;
    //  Clear the Live Tag Collection
    //  console.time('resetLiveTags')
    self.resetLiveTags();
    //  console.timeEnd('resetLiveTags')
    //  console.time('configureLiveTagCollection')
    self.configureLiveTagCollection();
    //  console.timeEnd('configureLiveTagCollection')

    //  Clear the Scan Group Collection
    //  console.time('resetScanGroups')
    self.resetScanGroups();
    //  console.timeEnd('resetScanGroups')
    //  console.time('configureModbusCoilCollections')
    self.configureModbusCoilCollections();
    //  console.timeEnd('configureModbusCoilCollections')
    //  console.time('configureModbusHoldingRegisterCollections')
    self.configureModbusHoldingRegisterCollections();
    //  console.timeEnd('configureModbusHoldingRegisterCollections')
  }
  configureLiveTagCollection() {
    //  return array of all Tags
    //  console.time('getAllTags');
    var allTags = Tags.find({}, {
      fields: {
        'tag': 1,
        'description': 1,
        'params': 1
      }
    }).fetch();
    //  console.timeEnd('getAllTags');
    //  Loop through each tag
    //  console.time('createAllLiveTags');
    let liveTagCollection = [];
    _.each(allTags, function(tag) {
      //    Loop through each Parameter
      _.each(tag.params, function(param) {
        let tagParam = tag.tag + '_' + param.name;
        let newLivetag = {
          tagid: tag._id,
          tag_param: tagParam,
          description: tag.description,
          dataType: param.dataType,
          modifiedAt: Date(),
          value: 0
        };
        liveTagCollection.push(newLivetag);
        //  LiveTags.insert(new_livetag);
      });
    });
    if(liveTagCollection.length > 0) {
      LiveTags.batchInsert(liveTagCollection);
    }
    //  console.timeEnd('createAllLiveTags');
  }
/**
 * This wil create the Scan Group Collections from the Tags collection which have coils
*/
  configureModbusCoilCollections() {
    //  Get a list of all coils (neeed address, tag_id, tag_param)
    let allCoils = Tags.find({
      "params.table": "Coil"
    }, {
      fields: {
        'tag': 1,
        'params': 1
      }
    }).fetch();
    //  unfortunately this new Array has more than just coils, will need to clean it up
    //  New array just containg the coils and their addess.
    let cleanCoils = [];
    _.each(allCoils, (tag) => {
      _.each(tag.params, (param) => {
        if (param.table === "Coil") {
          let tagParam = tag.tag + '_' + param.name;
          let newCoil = {
            tagid: tag._id,
            tag_param: tagParam,
            address: param.address
          };
          cleanCoils.push(newCoil);
        }
      });
    });
    //  create Scan Groups here
    if (cleanCoils.length !== 0) {
      MmodbusUtils.funcs.createScanGroups(MmodbusUtils.funcs.assignScanGroup(cleanCoils, this.options.groupOptions.coilReadLength, "Bit"));
    }
  }
  configureModbusHoldingRegisterCollections() {
    //  make two Scan Groups, one that hold integers and one that holds floating points.
    //  Get a list of all Holding Registers (neeed address, tag_id, tag_param)
    let allHoldingRegisters = Tags.find({
      "params.table": "Holding Register"
    }, {
      fields: {
        'tag': 1,
        'params': 1
      }
    }).fetch();
    //  New array just containg the Integers and their addesses
    let cleanIntegers = [];
    //  New array just containing the Floating Points and their addresses.
    let cleanFloats = [];
    _.each(allHoldingRegisters, (tag) => {
      _.each(tag.params, (param) => {
        if (param.table === "Holding Register") {
          let tagParam = tag.tag + '_' + param.name;
          let newNumber = {
            tagid: tag._id,
            tag_param: tagParam,
            address: param.address
          };
          if (param.dataType === "Integer") {
            cleanIntegers.push(newNumber);
          } else if (param.dataType === "Floating Point") {
            cleanFloats.push(newNumber);
          }
        }
      });
    });
    //  Create Scan Groups here
    cleanIntegers.length !== 0 ? MmodbusUtils.funcs.createScanGroups(MmodbusUtils.funcs.assignScanGroup(cleanIntegers, this.options.groupOptions.holdingRegisterLength, "Integer")) : 1;
    cleanFloats.length !== 0 ? MmodbusUtils.funcs.createScanGroups(MmodbusUtils.funcs.assignScanGroup(cleanFloats, this.options.groupOptions.holdingRegisterLength, "Floating Point")) : 1;
  }

  startAllScanning() {
    if (this.modbus_timer === null) {
      this.logger.mmodbus_info('Creating Scan timer for scan groups');
      this.modbus_timer = Meteor.setInterval(this.scanAllGroups.bind(this), this.options.scanInterval);
    } else {
      this.logger.mmodbus_info('Timer already exists for scan groups');
    }
  }
  stopAllScanning() {
    this.logger.mmodbus_warn('Stopping all scanning');
    if (this.modbus_timer !== null) {
      Meteor.clearInterval(this.modbus_timer);
      //  set timer to null indicating it is no longer active
      this.modbus_timer = null;
    }
  }
  scanAllGroups() {
    let self = this;
    self.logger.mmodbus_debug('Begin Scanning All Groups');

    var scanGroups = ScanGroups.find({
      "active": true
    }).fetch();
    self.logger.mmodbus_silly('scanGroups Array:', scanGroups);
    _.each(scanGroups, function(myGroup) {
      self.scanGroup(myGroup);
    });
    //  console.log('After each statement');
  }
  scanGroup(scanGroup) {
    let self = this;
    //  console.log(scanGroup);
    let address = scanGroup.startAddress;
    let quantity = scanGroup.quantity;
    self.logger.mmodbus_debug("Scanning Group # " + scanGroup.groupNum + ' of Data Type ' + scanGroup.dataType + ". Address " + address + ' and length ' + quantity);
    transaction = {};
    switch (scanGroup.dataType) {
      case "Bit":
        transaction = self.master.readCoils(address, quantity);
        break;
      case "Integer":
        transaction = self.master.readHoldingRegisters(address, quantity);
        break;
      case "Floating Point":
        transaction = self.master.readHoldingRegisters(address, quantity);
        break;
      default:
        self.logger.mmodbus_warn("ScanGroup ID: " + scanGroup.groupNum + " has incorrect Data Type");
    }
    transaction.setMaxRetries(0);
    MmodbusUtils.funcs.syncTransactionOn(transaction, 'timeout', function() {
      self.logger.mmodbus_info('[transaction#timeout] Scan Group #:', scanGroup.groupNum);
    });
    //  TODO What should I really do on error here?
    MmodbusUtils.funcs.syncTransactionOn(transaction, 'error', function(err) {
      self.logger.mmodbus_error(`[transaction#error] ${scanGroup.groupNum} of DataType ${scanGroup.dataType}` + 'Err Msg: ' + err.message);
      //  stopAllScanning();
    });
    MmodbusUtils.funcs.syncTransactionOn(transaction, 'complete', function(err, response) {
      //  if an error occurs, could be a timeout
      if (err) {
        self.logger.mmodbus_warn(`Error Message on Complete w/ ${scanGroup.groupNum} of DataType ${scanGroup.dataType}`);
        self.logger.mmodbus_warn(err.message);
      } else if (response.isException()) {
        self.logger.mmodbus_error(`Got an Exception Message. Scan Group #: ${scanGroup.groupNum} of DataType ${scanGroup.dataType}`);
        self.logger.mmodbus_error(response.toString());
        self.reportModbusError(scanGroup);
      } else {
        self.logger.mmodbus_debug(`Succesfully completed scanning of Scan Group #: ${scanGroup.groupNum} of DataType ${scanGroup.dataType}`);
        //  update LiveTags from the response and scanGroup
        self.handleRespone(response, scanGroup);
      }
    });
  }
    /**
     * This funciton will hande a response from a transaction. The updated tag data is evaluated from the response
     * and the MongoDB collection LiveTags is updated
     * @param {Object} response - This is Response object from a transaction.
     *
     * @param {Object} scanGroup - This is the scanGroup object for the transaction
     *
     */
  handleRespone(response, scanGroup) {
    let self = this;
    let data;

    data = (scanGroup.dataType === "Bit") ? response.getStates().map(Number) : response.getValues();
    //  self.logger.mmodbus_debug('Scan Group Data for Group#:', scanGroup.table,scanGroup.groupNum);
    //  console.log(data);
    //  self.logger.mmodbus_debug('test', data);
    _.each(scanGroup.tags, (tag) => {
      var index = tag.address - scanGroup.startAddress;
      var tagName = tag.tag_param;
      var newValue = (scanGroup.dataType === "Bit") ? data[index] : self.readTypedValue(scanGroup.dataType, scanGroup.startAddress, tag, data);
      //  console.log('Returned new Value: ',newValue);
      self.logger.mmodbus_silly('Updating Tag ' + tagName + ' at address ' + tag.address + ' to value of ' + newValue);
      LiveTags.update({
        tag_param: tagName
      }, {
        $set: {
          value: newValue,
          quality: true,
          modifiedAt: new Date()
        }
      });
    });
  }
    /**
     * This will function will report a Modbus error on scan group.  If too many erros occur, the scan group will be
     * made inactive.
     *
     */
  reportModbusError(scanGroup) {
    let self = this;
    let errors = ScanGroups.find({
      _id: scanGroup._id
    }).fetch()[0].errorCount;
    errors = errors + 1;
    self.logger.mmodbus_warn('Scan Group #' + scanGroup.groupNum + ' is reporting an error. They currently have ' + errors + ' errors');
    if (errors > self.options.scanOptions.defaultMaxRetries) {
      self.logger.mmodbus_warn('Exceeded Max Retries, disabling group #', scanGroup.groupNum);
      ScanGroups.update({
        _id: scanGroup._id
      }, {
        $set: {
          active: false
        }
      });
    }
    ScanGroups.update({
      _id: scanGroup._id
    }, {
      $inc: {
        errorCount: 1
      }
    });
  }
    /**
     * Read data from a buffer based upon the data type
     *
     * @param {String} dataType - The dataType repersents the datatype, e.g. Integer
     *
     * @param {Number} startingAddress - The address to begin reading with in the buffer
     *
     * @param {Object} tag - Tag object
     *
     * @param {BUFFER} buffer - Buffer Object, from response of transaction
     *
     *@return {Number} - Returns the number from the buffer
     */
  readTypedValue(dataType, startingAddress, tag, buffer) {
    let offset = (tag.address - startingAddress) * 2;
    //  self.logger.mmodbus_debug("reading Tag.param",tag.tag_param);
    //  self.logger.mmodbus_debug("Offset = ", offset)
    switch (dataType) {
      case 'double':
        return buffer.readDoubleBE(offset, true);
      case 'Floating Point':
        return buffer.readFloatBE(offset, true);
      case 'Integer2':
        return buffer.readUInt32BE(offset, true);
      case 'Integer1':
        return buffer.readInt32BE(offset, true);
      case 'Integer':
        return buffer.readUInt16BE(offset, true);
      case 'int8':
        return buffer.readInt16BE(offset, true);
      case 'bool':
        return buffer.readInt16BE(offset, true) === 0 ? 0 : 1;
      case 'string':
        return buffer.toString();
      default:
        return buffer.readUInt16BE(offset, true);
    }
  }
  updateValue(tagParam, value) {
    //  Attempting to use Promises
    //  console.log('began Update Value')
    let promise = new Promise((resolve) => {
      let self = this;
      let responseObject = {error: null, success: false};
      [tag, param, ...rest] = tagParam.split('_');
      if (MmodbusUtils.funcs.isEmpty(tag) || MmodbusUtils.funcs.isEmpty(param)) {
        responseObject.error = `${tagParam} is a malformed tag. Should be of form tag_param`;
        resolve(responseObject);
        return;
      }
      self.logger.mmodbus_debug(`Tag : ${tag} Param: ${param} Rest: ${rest}`);
      let tagObj = Tags.findOne({
        tag: tag
      });
      if (tagObj === undefined) {
        responseObject.error =  `${tagParam} does not exist in database`;
        resolve(responseObject);
        return;
      }
      paramObj = _.findWhere(tagObj.params, {
        name: param
      });
      if (paramObj === undefined) {
        responseObject.error = `Tag ${tag} is valid, but param ${param} is not valid for this tag`;
        resolve(responseObject);
        return;
      }
      if (!MmodbusUtils.funcs.isNumeric(value)) {
        responseObject.error = `Value: ${value} is not valid.  Must be a number`;
        resolve(responseObject);
        return;
      }
      self.modbusWrite(tagParam, value, paramObj.table, paramObj.dataType, paramObj.address, resolve);
      self.logger.mmodbus_debug(`tagObj.params: ${JSON.stringify(paramObj, null, 4)}`);
    })

    let futureValue = Promise.await(promise);
    //  console.log('After Promise Await', futureValue)
    return futureValue


  }
  modbusWrite(tagParam, value, table, dataType, address, resolve) {
    if (table === 'Coil') {
      this.modbusWriteBit(tagParam, value, table, address, resolve);
    } else if (table === 'Holding Register') {
      this.modbusWriteHoldingRegister(tagParam, value, dataType, address, resolve);
    } else {
      let responseObject = {error: null, success: false};
      responseObject.error = `Value: ${value} is not valid.  Must be a number`;
      resolve(responseObject);
      return;
    }
  }
  modbusWriteBit(tagParam, value, table, address, resolve) {
    let master = this.master;
    let self = this;
    let boolValue = (value === 0) ? false : true;

    master.writeSingleCoil(
      address, boolValue, {
        onComplete: function onWriteCoilValueComplete(err, res) {
          self.handleWriteResponse(this, err, res, tagParam, boolValue, resolve);
        },
        onError: function(err) {
          self.logger.mmodbus_error(`[transaction#error] ${tagParam} failed write` + 'Err Msg: ' + err.message);
          //  stopAllScanning();
        },
        onTimeout: function() {
          self.logger.mmodbus_error(`[transaction#timeout]  ${tagParam} failed write`);
        }
      }
    );
  }
  modbusWriteHoldingRegister(tagParam, value, dataType, address, resolve) {
    let self = this;
    let master = self.master;
    let valueBuffer;
    try {
      valueBuffer = MmodbusUtils.funcs.createValueBuffer(dataType, value);
    } catch (err) {
      self.logger.mmodbus_error(`Could not convert value to a modbus writeable buffer for tag ${tagParam} with value ${value}. Err: ${err}`);
    }
    master.writeMultipleRegisters(
      address, valueBuffer, {
        onComplete: function onWriteRegisterValueComplete(err, res) {
          self.handleWriteResponse(this, err, res, tagParam, value, resolve);
        },
        onError: function(err) {
          self.logger.mmodbus_error(`[transaction#error] ${tagParam} failed` + 'Err Msg: ' + err.message);
          //  stopAllScanning();
        },
        onTimeout: function() {
          self.logger.mmodbus_error(`[transaction#timeout]  ${tagParam} failed write`);
        }
      }
    );
  }
  handleWriteResponse(transaction, err, res, tagParam, value, resolve) {
    let responseObject = {error: null, success: false}
    if (err) {
      responseObject.error = 'Modbus Error, check logs';
      resolve(responseObject);
      this.logger.mmodbus_error(`Recieved error while writing to ${tagParam}.  Error: ${err}`);
      return;
    }
    if (res.isException()) {
      responseObject.error = 'Modbus Exception, check logs';
      resolve(responseObject);
      this.logger.mmodbus_error(`Recieved exception while writing to ${tagParam}.  Exception: ${res.toString()}`);
      return;
    }
    //TODO Update Live Tag becasue we know that it worked?
    responseObject.success = true;
    resolve(responseObject);
    this.logger.mmodbus_debug(`Succesfully wrote value '${value}' to ${tagParam}`);
    // Convert Boolean to Integer
  }
};
