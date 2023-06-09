export function setupAxiosDebugging (axios, maxVerbosity = false) {

  // Add a request interceptor
  axios.interceptors.request.use(function (config) {
    const { data: rawData } = config;
    const data = JSON.parse(rawData)
    const { model, input, ...rest } = data;
    if (maxVerbosity) {
      console.log(`<--`, config)
    } else {
      switch (model) {
        case 'text-embedding-ada-002': {
          console.log(`<--`, model, `(${input.length} documents)`, Reflect.ownKeys(rest).join(', '))
          break;
        }
        default: {
          console.log(`<--`, model, input, Reflect.ownKeys(rest).join(', '))
          break;
        }
      }
    }
    // Do something before request is sent
    return config;
  }, function (error) {
    // Do something with request error
    return Promise.reject(error);
  });

  // Add a response interceptor
  axios.interceptors.response.use(function (response) {
    const { data } = response;
    console.log(`-->`, data)
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
  }, function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    console.log(`--> (err)`, error.toJSON && error.toJSON() || error)
    return Promise.reject(error);
  });

}