// Import polyfills first
import "../polyfills";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PostHogProvider } from "posthog-js/react";
import {
    MutationCache,
    QueryClient,
    QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const options = {
    api_host: "https://us.i.posthog.com",
};

const mutationCache = new MutationCache({
    onError: (error, variables, context) => {
        console.error("Mutation error:", error, variables, context);
    },
});

const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
        queries: {
            retry: false,
            networkMode: "always",
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        },
    },
});

// suggested by Chorus
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <PostHogProvider
            apiKey="phc_CZDlvSwRIls38T9qDCmTsRq24Q6lfrsUYHSR2baHb1"
            options={options}
        >
            <QueryClientProvider client={queryClient}>
                <App />
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </PostHogProvider>
    </React.StrictMode>,
);
