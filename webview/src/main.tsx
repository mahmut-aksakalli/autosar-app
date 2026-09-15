import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import "./tabs/tabs.css";
import { ModelWebviewApp } from "./ModelWebviewApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ModelWebviewApp />
  </React.StrictMode>
);
