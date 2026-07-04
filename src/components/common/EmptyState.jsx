import { Box, Typography } from "@mui/material";

export default function EmptyState({ title, subtitle }) {
  return (
    <Box
      sx={{
        height: 350,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "#777",
      }}
    >
      <Typography variant="h5">{title}</Typography>

      <Typography>{subtitle}</Typography>
    </Box>
  );
}