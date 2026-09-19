const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("teamGroupTecniciToken") || "";
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/tecnici${path}`, {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.message || "Richiesta non riuscita");
  }

  return data;
}

export const apiTecnici = {
  login: (codice) => request("/login", { method: "POST", body: JSON.stringify({ codice }) }),
  me: () => request("/me"),
  chiamate: () => request("/chiamate"),
  storico: (cerca = "") => request(`/storico${cerca ? `?cerca=${encodeURIComponent(cerca)}` : ""}`),
  chiamata: (id) => request(`/chiamate/${id}`),
  arrivo: (id) => request(`/chiamate/${id}/arrivo`, { method: "PUT", body: JSON.stringify({}) }),
  aggiorna: (id, body) => request(`/chiamate/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  foto: (id, body) => request(`/chiamate/${id}/foto`, { method: "POST", body: JSON.stringify(body) }),
  chiudi: (id, body) => request(`/chiamate/${id}/chiudi`, { method: "PUT", body: JSON.stringify(body) }),
};
