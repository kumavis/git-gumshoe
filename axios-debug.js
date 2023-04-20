import axios from 'axios';

export function setupAxiosDebugging () {

  // Add a request interceptor
  axios.interceptors.request.use(function (config) {
    const { data } = config;
    console.log(`<--`, JSON.parse(data))
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
    return Promise.reject(error);
  });

}