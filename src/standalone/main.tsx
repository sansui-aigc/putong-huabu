import "antd/dist/reset.css";
import "@/app/globals.css";
import { createRoot } from "react-dom/client";
import { StandaloneApp } from "./app";
import { installStaticRuntime } from "./static-runtime";

installStaticRuntime();

const root = document.getElementById("root");
if (!root) throw new Error("Standalone app root is missing");
createRoot(root).render(<StandaloneApp />);
