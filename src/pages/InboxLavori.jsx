import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataGrid } from "@mui/x-data-grid";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../services/api";

const tipiRichiesta = ["Edilizia", "Service Distributori"];
const provenienze = ["Email", "WhatsApp", "Telefonata", "Cliente in ufficio"];
const prioritaOpzioni = ["Alta", "Media", "Bassa"];
const statiRichiesta = [
  "Nuova",
  "Da contattare",
  "Sopralluogo da fissare",
  "Sopralluogo fissato",
  "Sopralluogo eseguito",
  "Da preventivare",
  "Preventivo inviato",
  "Accettata",
  "Rifiutata",
];

const richiestaVuota = {
  id: null,
  numeroRichiesta: "",
  data: new Date().toISOString().slice(0, 10),
  clienteId: "",
  cliente: "",
  referenteId: "",
  referente: "",
  telefono: "",
  email: "",
  indirizzo: "",
  tipoRichiesta: "Edilizia",
  provenienza: "Telefonata",
  descrizione: "",
  serveSopralluogo: false,
  priorita: "Media",
  stato: "Nuova",
  note: "",
};

function formatData(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT");
}

function priorityColor(value) {
  if (value === "Alta") return "error";
  if (value === "Bassa") return "success";
  return "warning";
}

function InboxLavori() {
  const navigate = useNavigate();
  const [richieste, setRichieste] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [referenti, setReferenti] = useState([]);
  const [form, setForm] = useState(richiestaVuota);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");

  async function caricaRichieste() {
    setLoading(true);
    setErrore("");

    try {
      const [inboxData, clientiData, referentiData] = await Promise.all([
        api.get("/inbox-lavori"),
        api.get("/clienti"),
        api.get("/referenti"),
      ]);

      setRichieste(Array.isArray(inboxData) ? inboxData : []);
      setClienti(Array.isArray(clientiData) ? clientiData : []);
      setReferenti(Array.isArray(referentiData) ? referentiData : []);
    } catch (error) {
      setErrore(error.message || "Impossibile caricare Inbox Lavori.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    caricaRichieste();
  }, []);

  const richiesteFiltrate = useMemo(
    () =>
      richieste.filter((richiesta) => {
        const matchRicerca = [
          richiesta.id,
          richiesta.numeroRichiesta,
          richiesta.clienteId,
          richiesta.cliente,
          richiesta.referenteId,
          richiesta.referente,
          richiesta.telefono,
          richiesta.email,
          richiesta.indirizzo,
          richiesta.tipoRichiesta,
          richiesta.provenienza,
          richiesta.descrizione,
          richiesta.priorita,
          richiesta.stato,
          richiesta.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase());

        const matchStato = !filtroStato || richiesta.stato === filtroStato;
        const matchTipo = !filtroTipo || richiesta.tipoRichiesta === filtroTipo;
        return matchRicerca && matchStato && matchTipo;
      }),
    [filtroStato, filtroTipo, richieste, ricerca],
  );

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const selezionaCliente = (clienteId) => {
    const cliente = clienti.find((item) => String(item.id) === String(clienteId));

    setForm((corrente) => ({
      ...corrente,
      clienteId,
      cliente: cliente?.ragioneSociale || corrente.cliente,
      telefono: corrente.telefono || cliente?.telefono || "",
      email: corrente.email || cliente?.email || "",
      indirizzo: corrente.indirizzo || cliente?.indirizzo || "",
    }));
  };

  const selezionaReferente = (referenteId) => {
    const referente = referenti.find((item) => String(item.id) === String(referenteId));

    setForm((corrente) => ({
      ...corrente,
      referenteId,
      referente: referente?.nome || corrente.referente,
      telefono: corrente.telefono || referente?.telefono || "",
      email: corrente.email || referente?.email || "",
    }));
  };

  const apriNuovaRichiesta = () => {
    setForm(richiestaVuota);
    setErrore("");
    setMessaggio("");
    setDialogOpen(true);
  };

  const apriModifica = (richiesta) => {
    setForm({
      ...richiestaVuota,
      ...richiesta,
      data: richiesta.data ? String(richiesta.data).slice(0, 10) : richiestaVuota.data,
      clienteId: richiesta.clienteId || "",
      referenteId: richiesta.referenteId || "",
      serveSopralluogo: Boolean(richiesta.serveSopralluogo),
    });
    setErrore("");
    setMessaggio("");
    setDialogOpen(true);
  };

  const salvaRichiesta = async () => {
    if (!form.cliente.trim()) {
      setErrore("Inserisci il cliente.");
      return;
    }

    setSaving(true);
    setErrore("");

    const payload = {
      numeroRichiesta: form.numeroRichiesta || undefined,
      data: form.data,
      clienteId: form.clienteId || null,
      cliente: form.cliente.trim(),
      referenteId: form.referenteId || null,
      referente: form.referente.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim(),
      indirizzo: form.indirizzo.trim(),
      tipoRichiesta: form.tipoRichiesta,
      provenienza: form.provenienza,
      descrizione: form.descrizione.trim(),
      serveSopralluogo: Boolean(form.serveSopralluogo),
      priorita: form.priorita,
      stato: form.stato,
      note: form.note.trim(),
    };

    try {
      if (form.id) {
        const aggiornata = await api.put(`/inbox-lavori/${form.id}`, payload);
        setRichieste((attuali) => attuali.map((item) => (item.id === aggiornata.id ? aggiornata : item)));
        setMessaggio("Richiesta aggiornata.");
      } else {
        const creata = await api.post("/inbox-lavori", payload);
        setRichieste((attuali) => [creata, ...attuali]);
        setMessaggio("Richiesta creata.");
      }

      setDialogOpen(false);
      setForm(richiestaVuota);
    } catch (error) {
      setErrore(error.message || "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  const eliminaRichiesta = async (richiesta) => {
    const conferma = window.confirm(`Eliminare la richiesta #${richiesta.id} di ${richiesta.cliente}?`);
    if (!conferma) return;

    try {
      await api.delete(`/inbox-lavori/${richiesta.id}`);
      setRichieste((attuali) => attuali.filter((item) => item.id !== richiesta.id));
      setMessaggio("Richiesta eliminata.");
    } catch (error) {
      setErrore(error.message || "Eliminazione non riuscita.");
    }
  };

  const aggiornaStatoENaviga = async (richiesta, stato, path) => {
    try {
      const aggiornata = await api.put(`/inbox-lavori/${richiesta.id}`, { stato });
      setRichieste((attuali) => attuali.map((item) => (item.id === aggiornata.id ? aggiornata : item)));
      navigate(path);
    } catch (error) {
      setErrore(error.message || "Operazione non riuscita.");
    }
  };

  const columns = [
    { field: "id", headerName: "ID", width: 80 },
    { field: "numeroRichiesta", headerName: "Numero richiesta", width: 160 },
    { field: "clienteId", headerName: "ID Cliente", width: 110 },
    { field: "cliente", headerName: "Cliente", minWidth: 190, flex: 1 },
    { field: "referenteId", headerName: "ID Referente", width: 125 },
    { field: "referente", headerName: "Referente", minWidth: 170, flex: 1 },
    { field: "telefono", headerName: "Telefono", width: 145 },
    { field: "email", headerName: "Email", minWidth: 190, flex: 1 },
    { field: "indirizzo", headerName: "Indirizzo", minWidth: 220, flex: 1 },
    { field: "tipoRichiesta", headerName: "Tipo richiesta", width: 170 },
    { field: "provenienza", headerName: "Provenienza", width: 150 },
    {
      field: "serveSopralluogo",
      headerName: "Sopralluogo",
      width: 130,
      renderCell: (params) => (params.value ? "SI" : "NO"),
    },
    {
      field: "priorita",
      headerName: "Priorita",
      width: 120,
      renderCell: (params) => (
        <Chip size="small" label={params.value || "Media"} color={priorityColor(params.value)} variant="outlined" />
      ),
    },
    {
      field: "stato",
      headerName: "Stato",
      width: 190,
      renderCell: (params) => <Chip size="small" label={params.value || "Nuova"} />,
    },
    {
      field: "dataCreazione",
      headerName: "Data creazione",
      width: 145,
      valueFormatter: (value) => formatData(value),
    },
    {
      field: "azioni",
      headerName: "Azioni",
      width: 460,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const richiesta = params.row;
        const requiresSopralluogo = Boolean(richiesta.serveSopralluogo);

        return (
          <Stack direction="row" spacing={1} sx={{ py: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => apriModifica(richiesta)}>
              Modifica
            </Button>
            <Button size="small" color="error" variant="outlined" onClick={() => eliminaRichiesta(richiesta)}>
              Elimina
            </Button>
            <Button size="small" variant="outlined" onClick={() => navigate("/clienti")}>
              Apri Cliente
            </Button>
            {requiresSopralluogo ? (
              <Button
                size="small"
                variant="contained"
                onClick={() => aggiornaStatoENaviga(richiesta, "Sopralluogo da fissare", "/cronoprogramma")}
              >
                Pianifica Sopralluogo
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                onClick={() => aggiornaStatoENaviga(richiesta, "Da preventivare", "/preventivi")}
              >
                Crea Preventivo
              </Button>
            )}
          </Stack>
        );
      },
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: "#f4f7fb", minHeight: "100vh" }}>
      <Stack spacing={2.5}>
        <Paper elevation={0} sx={{ p: 2.5, border: "1px solid #dbe3ef", borderRadius: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a" }}>
                Inbox Lavori
              </Typography>
              <Typography variant="body2" sx={{ color: "#64748b", mt: 0.5 }}>
                Punto di ingresso per nuove richieste, sopralluoghi e preventivi.
              </Typography>
            </Box>
            <Button variant="contained" size="large" onClick={apriNuovaRichiesta} sx={{ fontWeight: 900 }}>
              Nuova richiesta
            </Button>
          </Stack>
        </Paper>

        {errore ? <Alert severity="error">{errore}</Alert> : null}
        {messaggio ? <Alert severity="success">{messaggio}</Alert> : null}

        <Paper elevation={0} sx={{ p: 2, border: "1px solid #dbe3ef", borderRadius: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Ricerca"
              value={ricerca}
              onChange={(event) => setRicerca(event.target.value)}
              fullWidth
            />
            <FormControl sx={{ minWidth: 210 }}>
              <InputLabel id="inbox-filtro-stato">Stato</InputLabel>
              <Select
                labelId="inbox-filtro-stato"
                label="Stato"
                value={filtroStato}
                onChange={(event) => setFiltroStato(event.target.value)}
              >
                <MenuItem value="">Tutti</MenuItem>
                {statiRichiesta.map((stato) => (
                  <MenuItem key={stato} value={stato}>
                    {stato}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 210 }}>
              <InputLabel id="inbox-filtro-tipo">Tipo richiesta</InputLabel>
              <Select
                labelId="inbox-filtro-tipo"
                label="Tipo richiesta"
                value={filtroTipo}
                onChange={(event) => setFiltroTipo(event.target.value)}
              >
                <MenuItem value="">Tutte</MenuItem>
                {tipiRichiesta.map((tipo) => (
                  <MenuItem key={tipo} value={tipo}>
                    {tipo}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ border: "1px solid #dbe3ef", borderRadius: 2, overflow: "hidden" }}>
          <DataGrid
            rows={richiesteFiltrate}
            columns={columns}
            getRowId={(row) => row.id}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10, page: 0 } },
            }}
            localeText={{
              noRowsLabel: "Nessuna richiesta",
              noResultsOverlayLabel: "Nessuna richiesta",
            }}
            sx={{
              border: 0,
              "& .MuiDataGrid-columnHeaders": { backgroundColor: "#f8fafc", color: "#0f172a" },
              "& .MuiDataGrid-cell": { alignItems: "center" },
            }}
          />
        </Paper>
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{form.id ? "Modifica richiesta" : "Nuova richiesta"}</DialogTitle>
        <DialogContent dividers>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
              gap: 2,
              pt: 1,
            }}
          >
            <TextField
              label="Numero richiesta"
              value={form.numeroRichiesta || "Automatico"}
              disabled
              fullWidth
            />
            <TextField
              type="date"
              label="Data"
              value={form.data}
              onChange={(event) => aggiornaForm("data", event.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              select
              label="Seleziona cliente"
              value={form.clienteId}
              onChange={(event) => selezionaCliente(event.target.value)}
              fullWidth
              helperText={form.clienteId ? `ID Cliente: ${form.clienteId}` : "Puoi anche compilare il cliente manualmente"}
            >
              <MenuItem value="">Nessun cliente selezionato</MenuItem>
              {clienti.map((cliente) => (
                <MenuItem key={cliente.id} value={cliente.id}>
                  {cliente.ragioneSociale}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Seleziona referente"
              value={form.referenteId}
              onChange={(event) => selezionaReferente(event.target.value)}
              fullWidth
              helperText={form.referenteId ? `ID Referente: ${form.referenteId}` : "Il referente puo essere associato dopo"}
            >
              <MenuItem value="">Nessun referente selezionato</MenuItem>
              {referenti.map((referente) => (
                <MenuItem key={referente.id} value={referente.id}>
                  {referente.nome}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Cliente"
              value={form.cliente}
              onChange={(event) => aggiornaForm("cliente", event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Referente"
              value={form.referente}
              onChange={(event) => aggiornaForm("referente", event.target.value)}
              fullWidth
            />
            <TextField
              label="Telefono"
              value={form.telefono}
              onChange={(event) => aggiornaForm("telefono", event.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              value={form.email}
              onChange={(event) => aggiornaForm("email", event.target.value)}
              fullWidth
            />
            <TextField
              label="Indirizzo"
              value={form.indirizzo}
              onChange={(event) => aggiornaForm("indirizzo", event.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Tipo richiesta"
              value={form.tipoRichiesta}
              onChange={(event) => aggiornaForm("tipoRichiesta", event.target.value)}
              fullWidth
            >
              {tipiRichiesta.map((tipo) => (
                <MenuItem key={tipo} value={tipo}>
                  {tipo}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Provenienza"
              value={form.provenienza}
              onChange={(event) => aggiornaForm("provenienza", event.target.value)}
              fullWidth
            >
              {provenienze.map((provenienza) => (
                <MenuItem key={provenienza} value={provenienza}>
                  {provenienza}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priorita"
              value={form.priorita}
              onChange={(event) => aggiornaForm("priorita", event.target.value)}
              fullWidth
            >
              {prioritaOpzioni.map((priorita) => (
                <MenuItem key={priorita} value={priorita}>
                  {priorita}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Stato"
              value={form.stato}
              onChange={(event) => aggiornaForm("stato", event.target.value)}
              fullWidth
            >
              {statiRichiesta.map((stato) => (
                <MenuItem key={stato} value={stato}>
                  {stato}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(form.serveSopralluogo)}
                  onChange={(event) => aggiornaForm("serveSopralluogo", event.target.checked)}
                />
              }
              label="Serve sopralluogo"
            />
            <TextField
              label="Descrizione"
              value={form.descrizione}
              onChange={(event) => aggiornaForm("descrizione", event.target.value)}
              multiline
              minRows={4}
              fullWidth
              sx={{ gridColumn: "1 / -1" }}
            />
            <TextField
              label="Note"
              value={form.note}
              onChange={(event) => aggiornaForm("note", event.target.value)}
              multiline
              minRows={3}
              fullWidth
              sx={{ gridColumn: "1 / -1" }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Annulla</Button>
          <Button variant="contained" onClick={salvaRichiesta} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InboxLavori;
