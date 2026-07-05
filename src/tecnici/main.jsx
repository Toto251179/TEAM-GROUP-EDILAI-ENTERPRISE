import React from "react";
import { createRoot } from "react-dom/client";
import TecniciApp from "./TecniciApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TecniciApp />
  </React.StrictMode>,
);
