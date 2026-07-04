import { Card, CardContent, Typography, List, ListItem, ListItemText } from "@mui/material";

const cantieri = [
  "Residence Verona",
  "Condominio Vicenza",
  "Q8 Padova",
  "IP Mestre",
];

export default function RecentCantieri() {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Ultimi Cantieri
        </Typography>

        <List>
          {cantieri.map((cantiere) => (
            <ListItem key={cantiere} disablePadding>
              <ListItemText primary={cantiere} />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}