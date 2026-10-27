import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ApiError } from "./api";
import "./styles.css";

// A 4xx means the request itself was wrong, so retrying will not help.
const client = new QueryClient({
  defaultOptions: { queries: { retry: (n, err) => n < 1 && !(err instanceof ApiError && err.status < 500) } },
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
