import axios from "axios";
import i18n from "@/i18n";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send/receive httpOnly auth + CSRF cookies
});

function readCookie(name) {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

const UNSAFE = new Set(["post", "put", "patch", "delete"]);

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (UNSAFE.has(method)) {
    const csrf = readCookie("csrf_token");
    if (csrf) {
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

export default api;

export function formatApiError(err, fallbackMessage = i18n.t("common:errors.generic")) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallbackMessage;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join(" ");
  }
  return typeof detail === "object" && detail.msg ? detail.msg : String(detail);
}
