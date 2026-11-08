import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Accounts } from "./accounts";
import "./styles.css";
import "./responsive.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Accounts><App /></Accounts>
  </React.StrictMode>,
);
