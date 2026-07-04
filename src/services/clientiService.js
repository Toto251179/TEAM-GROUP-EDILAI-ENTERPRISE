const STORAGE_KEY = "edilai_clienti";

export function getClienti() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
}

export function saveClienti(clienti) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clienti));
}

export function addCliente(cliente) {
  const clienti = getClienti();

  cliente.id = crypto.randomUUID();

  clienti.push(cliente);

  saveClienti(clienti);

  return cliente;
}

export function updateCliente(cliente) {
  const clienti = getClienti().map((c) =>
    c.id === cliente.id ? cliente : c
  );

  saveClienti(clienti);
}

export function deleteCliente(id) {
  const clienti = getClienti().filter((c) => c.id !== id);

  saveClienti(clienti);
}