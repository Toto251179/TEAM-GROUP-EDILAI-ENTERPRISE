import { DataGrid } from "@mui/x-data-grid";
import { Paper } from "@mui/material";

export default function ClientiTable({
  clienti,
  colonne,
}) {
  return (
    <Paper sx={{ height: 600 }}>
      <DataGrid
        rows={clienti}
        columns={colonne}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: {
            paginationModel: {
              pageSize: 10,
            },
          },
        }}
      />
    </Paper>
  );
}