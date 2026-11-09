const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const setToken = (t) => localStorage.setItem("token", t);
export const getToken = () => localStorage.getItem("token");

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const login = (email, password) => {
  const body = new URLSearchParams({ username: email, password });
  return req("/auth/login", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" }});
};

export const register = (clinic_name, email, password) =>
  req("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clinic_name, email, password }) });

export const me = () => req("/auth/me");
export const dashboard = () => req("/dashboard");

export const analyze = (file, patient_name) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("patient_name", patient_name);
  return req("/analyze", { method: "POST", body: fd });
};

export const checkout = (plan) =>
  req("/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
