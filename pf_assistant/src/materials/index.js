module.exports = {
  definitions: require('./definitions/default-parameter-definitions'),
  unitConverter: require('./converters/unit-converter'),
  parameterResolver: require('./resolvers/parameter-resolver'),
  materialParameters: require('./repositories/material-parameters-repository'),
};
