export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const detailParts = [
      `HTTP ${response.status}`,
      data?.code,
      data?.message || "Richiesta non riuscita",
      data?.field ? `Campo: ${data.field}` : "",
    ].filter(Boolean);
    const error = new Error(detailParts.join(" - "));
    error.status = response.status;
    error.code = data?.code;
    error.field = data?.field;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
};
