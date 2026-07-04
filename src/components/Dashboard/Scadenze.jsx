import { Card, CardContent, Typography, List, ListItem, ListItemText } from "@mui/material";

const scadenze = [
  "SAL Residence Verona",
  "Ordine materiale",
  "Fattura Cliente Rossi",
  "Sopralluogo Q8 Padova",
];

export default function Scadenze() {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Scadenze
        </Typography>

        <List>
          {scadenze.map((voce) => (
            <ListItem key={voce} disablePadding>
              <ListItemText primary={voce} />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}