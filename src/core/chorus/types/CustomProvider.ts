export type CustomProviderApiFormat =
    | "openai_chat_completions" // default - OpenAI Chat Completions API
    | "openai_responses" // OpenAI Responses API
    | "google_interactions" // Google Interactions API
    | "anthropic_messages"; // Anthropic Messages API

export interface ICustomProvider {
    id: string;
    displayName: string;
    baseUrl: string;
    apiFormat: CustomProviderApiFormat;
    createdAt?: string;
    updatedAt?: string;
}
