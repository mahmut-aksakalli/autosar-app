import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { AutosarApp } from "./components/AutosarApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AutosarApp />
  </React.StrictMode>
);
