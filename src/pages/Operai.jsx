import { useEffect, useMemo, useState } from "react";
import { operaiService } from "../services/operaiService";

const ruoli = ["Tecnico", "Caposquadra", "Operaio", "Amministrativo"];

const operaioVuoto = {
  id: "",
  nome: "",
  cognome: "",
  telefono: "",
  ruolo: "Tecnico",
  attivo: true,
};

function Operai() {
  const [operai, setOperai] = useState([]);
  const [form, setForm] = useState(operaioVuoto);
  const [ricerca, setRicerca] = useState("");

  const caricaOperai = () => setOperai(operaiService.lista());

  useEffect(() => {
    caricaOperai();
    window.addEventListener("teamGroupDataChanged", caricaOperai);
    return () => window.removeEventListener("teamGroupDataChanged", caricaOperai);
  }, []);

  const filtrati = useMemo(
    () =>
      operai.filter((operaio) =>
        [operaio.nome, operaio.cognome, operaio.telefono, operaio.ruolo, operaio.attivo ? "attivo" : "non attivo"]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [operai, ricerca],
  );

  const salva = () => {
    if (!form.nome.trim()) return;
    operaiService.salva(form);
    setForm(operaioVuoto);
    caricaOperai();
  };

  const elimina = (operaio) => {
    if (!window.confirm(`Eliminare ${operaio.nome} ${operaio.cognome || ""}?`)) return;
    operaiService.elimina(operaio.id);
    caricaOperai();
  };

  return (
    <div>
      <h1>Operai / Tecnici</h1>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>{form.id ? "Modifica tecnico/operaio" : "Nuovo tecnico/operaio"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          <input placeholder="Cognome" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} />
          <input placeholder="Telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <select value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value })}>
            {ruoli.map((ruolo) => <option key={ruolo}>{ruolo}</option>)}
          </select>
          <select value={String(form.attivo)} onChange={(e) => setForm({ ...form, attivo: e.target.value === "true" })}>
            <option value="true">Attivo</option>
            <option value="false">Non attivo</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <button onClick={salva}>{form.id ? "Salva modifica" : "Crea tecnico"}</button>
          <button onClick={() => setForm(operaioVuoto)} style={{ background: "white", color: "var(--enterprise-primary)" }}>Nuovo / Annulla</button>
        </div>
      </section>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Elenco operai e tecnici</h2>
        <input
          placeholder="Ricerca per nome, ruolo, telefono o stato"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ width: "420px", maxWidth: "100%", marginBottom: "12px" }}
        />

        <table width="100%">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cognome</th>
              <th>Telefono</th>
              <th>Ruolo</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtrati.map((operaio) => (
              <tr key={operaio.id}>
                <td>{operaio.nome}</td>
                <td>{operaio.cognome || "-"}</td>
                <td>{operaio.telefono || "-"}</td>
                <td>{operaio.ruolo}</td>
                <td>{operaio.attivo ? "Attivo" : "Non attivo"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => setForm(operaio)}>Modifica</button>
                    <button onClick={() => elimina(operaio)} style={{ background: "var(--enterprise-danger)" }}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Operai;
