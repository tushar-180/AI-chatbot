import axios from "axios";

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||import.meta.env.VITE_API_BASE_URL_DEV || "http://localhost:5000/api";

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export const API_BASE_URL = normalizedApiBaseUrl.endsWith("/api")
  ? normalizedApiBaseUrl
  : `${normalizedApiBaseUrl}/api`;

export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if it's a network error or a 5xx error
    if (!error.response || error.response.status >= 500) {
      window.dispatchEvent(new CustomEvent("server-down"));
    }
    return Promise.reject(error);
  },
);
