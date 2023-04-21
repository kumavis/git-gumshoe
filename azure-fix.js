export function fixForAzure ({ apiKey, apiVersion, configuration, axios }) {
  const baseOptions = configuration.baseOptions ?? {}
  configuration.baseOptions = {
    ...baseOptions,
    headers: {
      ...baseOptions.headers ?? {},
      'api-key': apiKey,
    },
    params: {
      ...baseOptions.params ?? {},
      'api-version': apiVersion,
    }
  }

  if (axios) {
    // Fix for azure endpoint to include deployment name
    // e.g.: "openai.azure.com/openai/deployments/gpt-35-turbo"
    axios.interceptors.request.use(function (config) {
      if (config.url.includes('openai.azure.com/')) {
        const { data: rawData } = config;
        const data = JSON.parse(rawData)
        const { model } = data;
        config.url = config.url.replace('openai.azure.com/', `openai.azure.com/openai/deployments/${model}/`)
      }
      return config
    })
  }
}
