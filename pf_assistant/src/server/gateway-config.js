function readGatewayCredentials(env = process.env) {
  const deviceToken = env.OC_GATEWAY_TOKEN || env.OC_DEVICE_TOKEN || '';
  const tokenSource = env.OC_GATEWAY_TOKEN
    ? 'OC_GATEWAY_TOKEN'
    : (env.OC_DEVICE_TOKEN ? 'OC_DEVICE_TOKEN' : '');

  return {
    deviceToken,
    gatewayPassword: env.OC_GATEWAY_PASSWORD || '',
    tokenSource,
  };
}

module.exports = { readGatewayCredentials };
