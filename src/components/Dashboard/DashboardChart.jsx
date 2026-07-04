import { Card, CardContent, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";

export default function DashboardChart() {
  return (
    <Card
      sx={{
        borderRadius: 3,
        boxShadow: 3,
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Andamento Fatturato
        </Typography>

        <LineChart
          xAxis={[
            {
              data: [
                "Gen",
                "Feb",
                "Mar",
                "Apr",
                "Mag",
                "Giu",
                "Lug",
                "Ago",
                "Set",
                "Ott",
                "Nov",
                "Dic",
              ],
              scaleType: "point",
            },
          ]}
          series={[
            {
              data: [
                12000,
                18000,
                15000,
                24000,
                26000,
                30000,
                28000,
                35000,
                42000,
                46000,
                52000,
                61000,
              ],
              label: "Fatturato (€)",
            },
          ]}
          height={300}
        />
      </CardContent>
    </Card>
  );
}