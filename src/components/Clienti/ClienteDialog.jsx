import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";

export default function ClienteDialog({ open, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Nuovo Cliente</DialogTitle>

      <DialogContent>
        <p>Il modulo cliente verrà completato nel prossimo passaggio.</p>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>

        <Button
          variant="contained"
          onClick={() => onSave({})}
        >
          Salva
        </Button>
      </DialogActions>
    </Dialog>
  );
}