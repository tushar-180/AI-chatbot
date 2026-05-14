import axios from "axios";

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 
  import.meta.env.VITE_SERVER_URL || 
  "http://localhost:5000";

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export const API_BASE_URL = normalizedApiBaseUrl.endsWith("/api")
  ? normalizedApiBaseUrl
  : `${normalizedApiBaseUrl}/api`;

export const API_ORIGIN = new URL(API_BASE_URL).origin;

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if it's a network error, timeout, or a 5xx error
    if (
      axios.isAxiosError(error) &&
      (!error.response || error.code === "ECONNABORTED" || error.response.status >= 500)
    ) {
      window.dispatchEvent(new CustomEvent("server-down"));
    }
    return Promise.reject(error);
  },
);
