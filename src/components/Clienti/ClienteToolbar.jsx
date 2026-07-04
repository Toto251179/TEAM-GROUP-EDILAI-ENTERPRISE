import { Box, Button, TextField } from "@mui/material";
import { Add } from "@mui/icons-material";

export default function ClienteToolbar({
  ricerca,
  setRicerca,
  onNuovo,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        mb: 2,
      }}
    >
      <TextField
        label="Cerca Cliente..."
        size="small"
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        sx={{ width: 350 }}
      />

      <Button
        variant="contained"
        startIcon={<Add />}
        onClick={onNuovo}
      >
        Nuovo Cliente
      </Button>
    </Box>
  );
}