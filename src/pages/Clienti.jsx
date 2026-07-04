import { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";

import PageContainer from "../components/common/PageContainer";
import PageHeader from "../components/common/PageHeader";

import ClienteToolbar from "../components/Clienti/ClienteToolbar";
import ClientiTable from "../components/Clienti/ClientiTable";
import ClienteDialog from "../components/Clienti/ClienteDialog";

import {
  getClienti,
  addCliente,
} from "../services/clientiService";

export default function Clienti() {
  const [clienti, setClienti] = useState([]);
  const [ricerca, setRicerca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    aggiornaClienti();
  }, []);

  function aggiornaClienti() {
    setClienti(getClienti());
  }

  function salvaCliente(cliente) {
    addCliente(cliente);
    aggiornaClienti();
    setDialogOpen(false);
  }

  const clientiFiltrati = useMemo(() => {
    return clienti.filter((c) =>
      (
        (c.ragioneSociale || "") +
        (c.partitaIva || "") +
        (c.comune || "") +
        (c.telefono || "") +
        (c.email || "")
      )
        .toLowerCase()
        .includes(ricerca.toLowerCase())
    );
  }, [clienti, ricerca]);

  const colonne = [
    {
      field: "ragioneSociale",
      headerName: "Ragione Sociale",
      flex: 2,
    },
    {
      field: "partitaIva",
      headerName: "P. IVA",
      flex: 1,
    },
    {
      field: "comune",
      headerName: "Comune",
      flex: 1,
    },
    {
      field: "telefono",
      headerName: "Telefono",
      flex: 1,
    },
    {
      field: "email",
      headerName: "Email",
      flex: 2,
    },
  ];

  return (
    <PageContainer>

      <PageHeader
        title="Clienti"
        subtitle="Gestione anagrafica clienti"
      />

      <Box mt={2}>

        <ClienteToolbar
          ricerca={ricerca}
          setRicerca={setRicerca}
          onNuovo={() => setDialogOpen(true)}
        />

      </Box>

      <Box mt={3}>

        <ClientiTable
          clienti={clientiFiltrati}
          colonne={colonne}
        />

      </Box>

      <ClienteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={salvaCliente}
      />

    </PageContainer>
  );
}