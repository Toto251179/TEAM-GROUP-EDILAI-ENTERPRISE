const TESTI_PULSANTE_VOCE = new Set(["+ voce", "+ voce economica"]);
const selettoreDescrizione = 'textarea[placeholder="Descrizione lavorazione"]';
const selettorePrezzo = 'input[placeholder="Prezzo unitario"]';
const clickRipetuti = new WeakSet();

function testoNormalizzato(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function impostaValoreReact(elemento, valore) {
  const descrittore = Object.getOwnPropertyDescriptor(
    elemento instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  );

  descrittore?.set?.call(elemento, valore);
  elemento.dispatchEvent(new Event("input", { bubbles: true }));
  elemento.dispatchEvent(new Event("change", { bubbles: true }));
}

function trovaAreaInserimento(pulsante) {
  let nodo = pulsante.parentElement;

  while (nodo && nodo !== document.body) {
    const descrizione = nodo.querySelector(selettoreDescrizione);
    const prezzo = nodo.querySelector(selettorePrezzo);
    if (descrizione && prezzo) return { contenitore: nodo, descrizione, prezzo };
    nodo = nodo.parentElement;
  }

  return null;
}

function rimuoviMessaggio(contenitore) {
  contenitore.querySelector("[data-errore-aggiunta-voce]")?.remove();
}

function mostraMessaggio(contenitore, testo) {
  rimuoviMessaggio(contenitore);
  const messaggio = document.createElement("div");
  messaggio.dataset.erroreAggiuntaVoce = "true";
  messaggio.textContent = testo;
  messaggio.style.cssText = [
    "margin-top:8px",
    "padding:8px 10px",
    "border:1px solid #ef4444",
    "border-radius:6px",
    "background:#fef2f2",
    "color:#b91c1c",
    "font-size:13px",
    "font-weight:700",
  ].join(";");
  contenitore.appendChild(messaggio);
}

function gestisciClickVoce(evento) {
  const pulsante = evento.target.closest("button");
  if (!pulsante || !TESTI_PULSANTE_VOCE.has(testoNormalizzato(pulsante.textContent))) return;
  if (!window.location.pathname.toLowerCase().includes("preventiv")) return;

  if (clickRipetuti.has(pulsante)) {
    clickRipetuti.delete(pulsante);
    return;
  }

  const area = trovaAreaInserimento(pulsante);
  if (!area) return;

  rimuoviMessaggio(area.contenitore);
  area.descrizione.style.outline = "";

  if (!area.descrizione.value.trim()) {
    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();
    area.descrizione.style.outline = "2px solid #ef4444";
    area.descrizione.focus();
    mostraMessaggio(area.contenitore, "Inserisci la descrizione della lavorazione prima di aggiungere la voce.");
    return;
  }

  if (!String(area.prezzo.value || "").trim()) {
    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();
    impostaValoreReact(area.prezzo, "0");
    clickRipetuti.add(pulsante);
    window.setTimeout(() => pulsante.click(), 0);
  }
}

document.addEventListener("click", gestisciClickVoce, true);
