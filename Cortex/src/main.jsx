import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayPopover } from "@/components/tray/TrayPopover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./styles/globals.css";

function Root() {
  const [isTray, setIsTray] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") === "tray") return true;
    }
    try {
      const appWindow = getCurrentWebviewWindow();
      if (appWindow?.label === "tray_popover") return true;
    } catch {
      // Non-Tauri context
    }
    return false;
  });

  useEffect(() => {
    try {
      const appWindow = getCurrentWebviewWindow();
      if (appWindow?.label === "tray_popover") {
        setIsTray(true);
      }
    } catch {
      // Non-Tauri context
    }
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      {isTray ? <TrayPopover /> : <App />}
    </TooltipProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
