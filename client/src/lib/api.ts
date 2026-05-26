import axios from "axios";

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_SERVER_URL ||
  "http://localhost:5000/api";

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export const API_BASE_URL = normalizedApiBaseUrl.endsWith("/api")
  ? normalizedApiBaseUrl
  : `${normalizedApiBaseUrl}/api`;

export const API_ORIGIN = new URL(API_BASE_URL).origin;

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// --- Network health check state ---
let serverIsDown = false;
let pendingHealthCheck: ReturnType<typeof setTimeout> | null = null;

// --- Auth token wiring ---
// useAuthSetup calls setAuthTokenGetter(getToken) once on mount.
// The request interceptor below then calls it before every request.
let getAuthToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenGetter = (fn: () => Promise<string | null>) => {
  getAuthToken = fn;
};

// Attach Clerk JWT to every outgoing request
api.interceptors.request.use(async (config) => {
  if (serverIsDown) {
    return Promise.reject(new axios.Cancel("Server is offline. Request blocked to prevent spam."));
  }
  if (getAuthToken) {
    const token = await getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Synchronize serverIsDown state with global window events
if (typeof window !== "undefined") {
  window.addEventListener("server-down", () => {
    serverIsDown = true;
  });
  window.addEventListener("server-up", () => {
    serverIsDown = false;
  });
}

const confirmServerDown = () => {
  if (pendingHealthCheck) return;

  pendingHealthCheck = setTimeout(async () => {
    pendingHealthCheck = null;
    try {
      const res = await axios.get(`${API_ORIGIN}/health?t=${Date.now()}`, {
        timeout: 4000,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
      if (res.status !== 200 || !res.data || res.data.ok !== true) {
        throw new Error("Invalid health check response");
      }
      if (serverIsDown) {
        serverIsDown = false;
        window.dispatchEvent(new CustomEvent("server-up"));
      }
    } catch (error) {
      if (!serverIsDown) {
        serverIsDown = true;
        window.dispatchEvent(new CustomEvent("server-down"));
      }
    }
  }, 500);
};

api.interceptors.response.use(
  (response) => {
    if (serverIsDown) {
      serverIsDown = false;
      window.dispatchEvent(new CustomEvent("server-up"));
    }
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    if (
      axios.isAxiosError(error) &&
      (!error.response ||
        error.code === "ECONNABORTED" ||
        error.response.status >= 500)
    ) {
      confirmServerDown();
    }
    return Promise.reject(error);
  },
);
