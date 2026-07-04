import { TextField } from "@mui/material";

export default function SearchBar({
  value,
  onChange,
  placeholder = "Cerca...",
}) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      sx={{ width: 350 }}
    />
  );
}