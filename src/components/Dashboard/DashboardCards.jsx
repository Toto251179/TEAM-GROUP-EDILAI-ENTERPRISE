import { Card, CardContent, Typography } from "@mui/material";
import {
  FaBuilding,
  FaFileInvoiceDollar,
  FaUsers,
  FaEuroSign,
} from "react-icons/fa";

const cards = [
  {
    titolo: "Cantieri Attivi",
    valore: 18,
    icona: <FaBuilding size={35} color="#1976d2" />,
  },
  {
    titolo: "Preventivi",
    valore: 34,
    icona: <FaFileInvoiceDollar size={35} color="#43a047" />,
  },
  {
    titolo: "Clienti",
    valore: 127,
    icona: <FaUsers size={35} color="#fb8c00" />,
  },
  {
    titolo: "Fatturato",
    valore: "€ 248.650",
    icona: <FaEuroSign size={35} color="#d81b60" />,
  },
];

export default function DashboardCards() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "20px",
      }}
    >
      {cards.map((card) => (
        <Card
          key={card.titolo}
          sx={{
            borderRadius: 3,
            boxShadow: 3,
          }}
        >
          <CardContent
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <Typography variant="subtitle2" color="text.secondary">
                {card.titolo}
              </Typography>

              <Typography variant="h4" fontWeight="bold">
                {card.valore}
              </Typography>
            </div>

            {card.icona}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}