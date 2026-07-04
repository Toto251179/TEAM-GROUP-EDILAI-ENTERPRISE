import { Button } from "@mui/material";

export default function PrimaryButton({
  children,
  icon,
  onClick,
  color = "primary",
}) {
  return (
    <Button
      variant="contained"
      color={color}
      startIcon={icon}
      onClick={onClick}
      sx={{
        borderRadius: 2,
        px: 3,
        py: 1,
        fontWeight: 600,
        textTransform: "none",
      }}
    >
      {children}
    </Button>
  );
}