import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { registerWorker } from "./notifications.js";

// Register immediately; do not depend on a window load event that may have passed.
registerWorker().catch((error) => console.error("SW registration failed:", error));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);
