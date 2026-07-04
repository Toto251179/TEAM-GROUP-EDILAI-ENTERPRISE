import { Box, Paper } from "@mui/material";

export default function PageContainer({ children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        minHeight: "calc(100vh - 160px)",
        backgroundColor: "#fff",
      }}
    >
      {children}
    </Paper>
  );
}