import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { api } from "../services/api";

const initialData = {
  preventivi: [],
  cantieri: [],
  sal: [],
  chiamate: [],
  squadre: [],
};

const isClosed = (value) =>
  /chius|complet|annull|rifiut/i.test(String(value || ""));

const includesAny = (value, words) => {
  const text = String(value || "").toLowerCase();
  return words.some((word) => text.includes(word.toLowerCase()));
};

const sameDay = (value, date) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toDateString() === date.toDateString();
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

function FieldLine({ label, value }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="caption" sx={{ color: "#64748b", minWidth: 78 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: "#0f172a", fontWeight: 600 }}>
        {value || "Non indicato"}
      </Typography>
    </Stack>
  );
}

function SectionItem({ title, subtitle, meta, tone = "default" }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderColor: tone === "urgent" ? "#fecaca" : "#e2e8f0",
        backgroundColor: tone === "urgent" ? "#fff7f7" : "#ffffff",
      }}
    >
      <Typography variant="subtitle2" sx={{ color: "#0f172a", fontWeight: 800 }}>
        {title || "Senza titolo"}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" sx={{ color: "#475569", mt: 0.5 }}>
          {subtitle}
        </Typography>
      ) : null}
      {meta ? (
        <Typography variant="caption" sx={{ display: "block", color: "#64748b", mt: 0.75 }}>
          {meta}
        </Typography>
      ) : null}
    </Paper>
  );
}

function OperationalSection({ title, items, emptyText, children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #dbe3ef",
        borderRadius: 2,
        p: 2,
        minHeight: 210,
        backgroundColor: "#ffffff",
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 900, color: "#0f172a", mb: 1.5 }}>
        {title}
      </Typography>
      <Stack spacing={1.2}>
        {items.length ? (
          children
        ) : (
          <Typography variant="body2" sx={{ color: "#64748b", py: 1 }}>
            {emptyText}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

function Dashboard() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        api.get("/preventivi"),
        api.get("/cantieri"),
        api.get("/sal"),
        api.get("/tecnici/ufficio/chiamate"),
        api.get("/tecnici/ufficio/squadre"),
      ]);

      if (!active) return;

      const [preventivi, cantieri, sal, chiamate, squadre] = results.map((result) =>
        result.status === "fulfilled" ? toArray(result.value) : [],
      );

      const failed = results.some((result) => result.status === "rejected");
      setData({ preventivi, cantieri, sal, chiamate, squadre });
      setError(failed ? "Alcuni dati non sono disponibili in questo momento." : "");
      setLoading(false);
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const sections = useMemo(() => {
    const urgenze = data.chiamate
      .filter((chiamata) => {
        const testo = [
          chiamata.priorita,
          chiamata.descrizionePriorita,
          chiamata.stato,
          chiamata.descrizione,
          chiamata.descrizione_lavori,
        ].join(" ");
        return !isClosed(chiamata.stato) && includesAny(testo, ["urgente", "alta", "critica"]);
      })
      .slice(0, 5);

    const nuoveRichieste = data.chiamate
      .filter((chiamata) => {
        const stato = [chiamata.stato, chiamata.stato_assegnazione, chiamata.statoAssegnazione].join(" ");
        return !isClosed(stato) && includesAny(stato, ["nuova", "aperta", "da assegnare", "da verificare"]);
      })
      .slice(0, 5);

    const preventiviDaPreparare = data.preventivi
      .filter((preventivo) => includesAny(preventivo.stato || "Bozza", ["bozza", "da preparare", "da verificare"]))
      .slice(0, 5);

    const sopralluoghi = data.cantieri
      .filter((cantiere) => {
        const tipo = [cantiere.tipo, cantiere.note, cantiere.descrizione, cantiere.nome].join(" ");
        const dataEvento = cantiere.data_sopralluogo || cantiere.dataSopralluogo || cantiere.data;
        return sameDay(dataEvento, today) && includesAny(tipo, ["sopralluogo"]);
      })
      .slice(0, 5);

    const squadreOperative = data.squadre.filter((squadra) => squadra.attiva !== false).slice(0, 5);

    const ticketDistributori = data.chiamate
      .filter((chiamata) => {
        const testo = [
          chiamata.cliente,
          chiamata.id_cliente,
          chiamata.idCliente,
          chiamata.categoria,
          chiamata.descrizione,
        ].join(" ");
        return !isClosed(chiamata.stato) && includesAny(testo, ["ip", "q8", "distribut", "carburant"]);
      })
      .slice(0, 5);

    const salDaPreparare = data.sal
      .filter((item) => !isClosed(item.stato) && !includesAny(item.stato, ["emesso", "pagato"]))
      .slice(0, 5);

    return {
      urgenze,
      nuoveRichieste,
      preventiviDaPreparare,
      sopralluoghi,
      squadreOperative,
      ticketDistributori,
      salDaPreparare,
    };
  }, [data, today]);

  const actionButtons = [
    { label: "Nuova Richiesta", icon: "➕", href: "/inbox-lavori" },
    { label: "Nuovo Preventivo", icon: "➕", href: "/preventivi" },
    { label: "Nuovo Ticket", icon: "➕", href: "/chiamate-tecnici" },
    { label: "Calendario", icon: "📅", href: "/cronoprogramma" },
  ];

  const todayLabel = today.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, backgroundColor: "#f4f7fb", minHeight: "100vh" }}>
      <Stack spacing={3}>
        <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 2, border: "1px solid #dbe3ef" }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="h3" sx={{ fontWeight: 900, color: "#0f172a", fontSize: { xs: 30, md: 42 } }}>
                ☀️ Buongiorno Salvatore
              </Typography>
              <Typography variant="body1" sx={{ color: "#64748b", textTransform: "capitalize", mt: 0.5 }}>
                {todayLabel}
              </Typography>
            </Box>
            <Chip
              label="Centro operativo"
              color="primary"
              sx={{ alignSelf: { xs: "flex-start", md: "center" }, fontWeight: 800 }}
            />
          </Stack>
        </Paper>

        {error ? <Alert severity="warning">{error}</Alert> : null}

        {loading ? (
          <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: 2 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2, color: "#64748b" }}>Caricamento lavoro della giornata...</Typography>
          </Paper>
        ) : (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(3, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              <OperationalSection title="🔴 Urgenze" items={sections.urgenze} emptyText="Nessuna urgenza">
                {sections.urgenze.map((item) => (
                  <SectionItem
                    key={item.id || item.numero || item.numero_chiamata}
                    tone="urgent"
                    title={item.numero_chiamata || item.numero || "Chiamata"}
                    subtitle={item.descrizione || item.descrizione_lavori}
                    meta={item.cliente || item.indirizzo}
                  />
                ))}
              </OperationalSection>

              <OperationalSection
                title="📧 Nuove richieste"
                items={sections.nuoveRichieste}
                emptyText="Nessuna richiesta"
              >
                {sections.nuoveRichieste.map((item) => (
                  <SectionItem
                    key={item.id || item.numero || item.numero_chiamata}
                    title={item.numero_chiamata || item.numero || "Richiesta"}
                    subtitle={item.descrizione || item.descrizione_lavori}
                    meta={item.cliente || "Cliente da associare"}
                  />
                ))}
              </OperationalSection>

              <OperationalSection
                title="📄 Preventivi da preparare"
                items={sections.preventiviDaPreparare}
                emptyText="Nessun preventivo"
              >
                {sections.preventiviDaPreparare.map((item) => (
                  <SectionItem
                    key={item.id || item.numero}
                    title={item.numero || "Preventivo"}
                    subtitle={item.oggetto || item.descrizione}
                    meta={item.cliente}
                  />
                ))}
              </OperationalSection>

              <OperationalSection
                title="📅 Sopralluoghi di oggi"
                items={sections.sopralluoghi}
                emptyText="Nessun sopralluogo"
              >
                {sections.sopralluoghi.map((item) => (
                  <SectionItem
                    key={item.id || item.nome}
                    title={item.nome || item.cliente || "Sopralluogo"}
                    subtitle={item.indirizzo}
                    meta={item.note}
                  />
                ))}
              </OperationalSection>

              <OperationalSection
                title="👷 Squadre operative"
                items={sections.squadreOperative}
                emptyText="Nessuna squadra operativa"
              >
                {sections.squadreOperative.map((item) => (
                  <Paper key={item.id || item.nome_squadra || item.nomeSquadra} variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ color: "#0f172a", fontWeight: 800 }}>
                      {item.nome_squadra || item.nomeSquadra || item.nome || "Squadra"}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <FieldLine label="Mezzo" value={item.mezzo_assegnato || item.mezzoAssegnato} />
                    <FieldLine label="Stato" value={item.stato || "Operativa"} />
                  </Paper>
                ))}
              </OperationalSection>

              <OperationalSection
                title="⛽ Ticket distributori aperti"
                items={sections.ticketDistributori}
                emptyText="Nessun ticket"
              >
                {sections.ticketDistributori.map((item) => (
                  <SectionItem
                    key={item.id || item.numero || item.numero_chiamata}
                    title={item.numero_chiamata || item.numero || "Ticket"}
                    subtitle={item.descrizione || item.descrizione_lavori}
                    meta={item.indirizzo}
                  />
                ))}
              </OperationalSection>

              <OperationalSection title="💰 SAL da preparare" items={sections.salDaPreparare} emptyText="Nessun SAL">
                {sections.salDaPreparare.map((item) => (
                  <SectionItem
                    key={item.id || item.numero}
                    title={item.numero || item.cantiere || "SAL"}
                    subtitle={item.descrizione || item.nome}
                    meta={item.stato}
                  />
                ))}
              </OperationalSection>
            </Box>

            <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: "1px solid #dbe3ef" }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
                  gap: 1.5,
                }}
              >
                {actionButtons.map((button) => (
                  <Button
                    key={button.label}
                    size="large"
                    variant="contained"
                    startIcon={<Box component="span">{button.icon}</Box>}
                    onClick={() => {
                      window.location.href = button.href;
                    }}
                    sx={{ py: 1.6, fontWeight: 900, justifyContent: "center" }}
                  >
                    {button.label}
                  </Button>
                ))}
              </Box>
            </Paper>
          </>
        )}
      </Stack>
    </Box>
  );
}

export default Dashboard;
