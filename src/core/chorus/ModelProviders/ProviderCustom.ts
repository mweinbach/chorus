import { IProvider } from "./IProvider";
import {
    StreamResponseParams,
    LLMMessage,
    readImageAttachment,
    readPdfAttachment,
    encodeTextAttachment,
    encodeWebpageAttachment,
    attachmentMissingFlag,
} from "../Models";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../DB";
import { SettingsManager } from "@core/utilities/Settings";
import OpenAICompletionsAPIUtils from "../OpenAICompletionsAPIUtils";
import { CustomProviderApiFormat } from "../types/CustomProvider";
import { getUserToolNamespacedName, UserToolCall } from "@core/chorus/Toolsets";

interface CustomProviderRow {
    id: string;
    display_name: string;
    base_url: string;
    api_format: string;
}

async function getCustomProviderConfig(
    providerId: string,
): Promise<CustomProviderRow | undefined> {
    const rows = await db.select<CustomProviderRow[]>(
        "SELECT id, display_name, base_url, api_format FROM custom_providers WHERE id = ?",
        [providerId],
    );
    return rows[0];
}

async function getCustomProviderApiKey(
    providerId: string,
): Promise<string | undefined> {
    const settingsManager = SettingsManager.getInstance();
    const settings = await settingsManager.get();
    return settings.customProviderApiKeys?.[providerId];
}

export function getCustomProviderId(modelId: string): string | undefined {
    const providerName = modelId.split("::")[0];
    if (providerName?.startsWith("custom-")) {
        return providerName.replace("custom-", "");
    }
    return undefined;
}

// Helper function to get MIME type from file extension
function getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        default:
            return "image/jpeg"; // Default fallback
    }
}

export class ProviderCustom implements IProvider {
    async streamResponse(params: StreamResponseParams): Promise<void> {
        const { modelConfig, onError } = params;

        const providerId = getCustomProviderId(modelConfig.modelId);
        if (!providerId) {
            onError("Invalid custom provider model ID");
            return;
        }

        const providerConfig = await getCustomProviderConfig(providerId);
        if (!providerConfig) {
            onError(`Custom provider not found: ${providerId}`);
            return;
        }

        const apiKey = await getCustomProviderApiKey(providerId);
        if (!apiKey) {
            onError(
                `API key not configured for custom provider: ${providerConfig.display_name}`,
            );
            return;
        }

        const apiFormat = (providerConfig.api_format ??
            "openai_chat_completions") as CustomProviderApiFormat;

        // Dispatch to appropriate format handler
        switch (apiFormat) {
            case "openai_chat_completions":
                await this.streamOpenAIChatCompletions(
                    params,
                    providerConfig,
                    apiKey,
                );
                break;
            case "openai_responses":
                await this.streamOpenAIResponses(params, providerConfig, apiKey);
                break;
            case "google_interactions":
                await this.streamGoogleInteractions(
                    params,
                    providerConfig,
                    apiKey,
                );
                break;
            case "anthropic_messages":
                await this.streamAnthropicMessages(
                    params,
                    providerConfig,
                    apiKey,
                );
                break;
            default: {
                const exhaustiveCheck: never = apiFormat;
                onError(`Unknown API format: ${exhaustiveCheck}`);
            }
        }
    }

    // --- OpenAI Chat Completions format ---
    private async streamOpenAIChatCompletions(
        params: StreamResponseParams,
        providerConfig: CustomProviderRow,
        apiKey: string,
    ): Promise<void> {
        const { llmConversation, modelConfig, tools, onChunk, onComplete } =
            params;

        const client = new OpenAI({
            baseURL: providerConfig.base_url,
            apiKey: apiKey,
            dangerouslyAllowBrowser: true,
        });

        const messages = await OpenAICompletionsAPIUtils.convertConversation(
            llmConversation,
            { imageSupport: true, functionSupport: true },
        );

        const modelName = modelConfig.modelId.split("::")[1];

        const toolDefinitions = tools
            ? OpenAICompletionsAPIUtils.convertToolDefinitions(tools)
            : undefined;

        const stream = await client.chat.completions.create({
            model: modelName,
            messages,
            stream: true,
            ...(toolDefinitions &&
                toolDefinitions.length > 0 && { tools: toolDefinitions }),
        });

        const chunks: OpenAI.ChatCompletionChunk[] = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
            if (chunk.choices[0]?.delta?.content) {
                onChunk(chunk.choices[0].delta.content);
            }
        }

        const toolCalls = tools
            ? OpenAICompletionsAPIUtils.convertToolCalls(chunks, tools)
            : undefined;
        await onComplete(undefined, toolCalls);
    }

    // --- OpenAI Responses API format ---
    private async streamOpenAIResponses(
        params: StreamResponseParams,
        providerConfig: CustomProviderRow,
        apiKey: string,
    ): Promise<void> {
        const { llmConversation, modelConfig, tools, onChunk, onComplete } =
            params;

        const client = new OpenAI({
            baseURL: providerConfig.base_url,
            apiKey: apiKey,
            dangerouslyAllowBrowser: true,
        });

        const modelName = modelConfig.modelId.split("::")[1];

        // Convert conversation to OpenAI Responses API format
        const messages = await this.convertToOpenAIResponsesInput(
            llmConversation,
        );

        // Convert tools to OpenAI Responses format
        const openaiTools: Array<OpenAI.Responses.FunctionTool> | undefined =
            tools?.map((tool) => ({
                type: "function" as const,
                name: getUserToolNamespacedName(tool),
                description: tool.description,
                parameters: tool.inputSchema as Record<string, unknown>,
                strict: false,
            }));

        const createParams: OpenAI.Responses.ResponseCreateParamsStreaming = {
            model: modelName,
            input: messages,
            stream: true,
            ...(openaiTools &&
                openaiTools.length > 0 && {
                    tools: openaiTools,
                    tool_choice: "auto",
                }),
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        const stream = await client.responses.create(createParams as any);

        // OpenAI Responses API streaming event types
        type OpenAIStreamEvent =
            | { type: "response.output_text.delta"; delta: string }
            | {
                  type: "response.output_item.added";
                  item: {
                      type: "function_call";
                      id: string;
                      call_id: string;
                      name: string;
                      arguments: string;
                  };
              }
            | {
                  type: "response.function_call_arguments.delta";
                  item_id: string;
                  delta: string;
              }
            | {
                  type: "response.function_call_arguments.done";
                  item_id: string;
                  arguments: string;
              }
            | {
                  type: "response.output_item.done";
                  item: {
                      type: "function_call";
                      id: string;
                      call_id: string;
                      name: string;
                      arguments: string;
                  };
              }
            | { type: "response.done" };

        const toolCalls: UserToolCall[] = [];
        const accumulatedToolCalls: Record<
            string,
            { id: string; call_id: string; name: string; arguments: string }
        > = {};

        for await (const event of stream as unknown as AsyncIterable<OpenAIStreamEvent>) {
            if (event.type === "response.output_text.delta") {
                onChunk(event.delta);
            } else if (
                event.type === "response.output_item.added" &&
                event.item.type === "function_call"
            ) {
                accumulatedToolCalls[event.item.id] = {
                    id: event.item.id,
                    call_id: event.item.call_id,
                    name: event.item.name,
                    arguments: event.item.arguments || "",
                };
            } else if (event.type === "response.function_call_arguments.delta") {
                if (accumulatedToolCalls[event.item_id]) {
                    accumulatedToolCalls[event.item_id].arguments += event.delta;
                }
            } else if (event.type === "response.function_call_arguments.done") {
                if (accumulatedToolCalls[event.item_id]) {
                    accumulatedToolCalls[event.item_id].arguments =
                        event.arguments;
                }
            } else if (
                event.type === "response.output_item.done" &&
                event.item.type === "function_call"
            ) {
                const namespacedToolName = event.item.name;
                const calledTool = tools?.find(
                    (t) => getUserToolNamespacedName(t) === namespacedToolName,
                );

                toolCalls.push({
                    id: event.item.call_id,
                    namespacedToolName,
                    args: JSON.parse(event.item.arguments),
                    toolMetadata: {
                        description: calledTool?.description,
                        inputSchema: calledTool?.inputSchema,
                    },
                });
            }
        }

        await onComplete(undefined, toolCalls.length > 0 ? toolCalls : undefined);
    }

    // --- Google Interactions API format ---
    private async streamGoogleInteractions(
        params: StreamResponseParams,
        providerConfig: CustomProviderRow,
        apiKey: string,
    ): Promise<void> {
        const { llmConversation, modelConfig, tools, onChunk, onComplete, onError } =
            params;

        const modelName = modelConfig.modelId.split("::")[1];

        // Convert conversation to Google Interactions API format
        const input = await this.convertToGoogleInteractionsInput(llmConversation);

        // Convert tools to Google format
        const googleTools = tools?.map((tool) => ({
            type: "function" as const,
            name: getUserToolNamespacedName(tool),
            description: tool.description,
            parameters: tool.inputSchema,
        }));

        // Build request body
        const requestBody: Record<string, unknown> = {
            model: modelName,
            input,
            stream: true,
        };

        if (googleTools && googleTools.length > 0) {
            requestBody.tools = googleTools;
        }

        // Make streaming request with SSE
        const response = await fetch(
            `${providerConfig.base_url}/interactions?alt=sse`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                },
                body: JSON.stringify(requestBody),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            onError(`Google Interactions API error: ${response.status} - ${errorText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            onError("Failed to get response stream reader");
            return;
        }

        const decoder = new TextDecoder();
        const toolCalls: UserToolCall[] = [];
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process SSE events line by line
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const eventData = JSON.parse(line.slice(6));

                        // Handle text streaming
                        if (
                            eventData.event_type === "content.delta" &&
                            eventData.delta?.type === "text"
                        ) {
                            onChunk(eventData.delta.text);
                        }
                        // Handle function call in outputs
                        else if (eventData.event_type === "interaction.complete") {
                            // Extract tool calls from final interaction outputs
                            const outputs = eventData.interaction?.outputs || [];
                            for (const output of outputs) {
                                if (output.type === "function_call") {
                                    const calledTool = tools?.find(
                                        (t) =>
                                            getUserToolNamespacedName(t) ===
                                            output.name,
                                    );
                                    toolCalls.push({
                                        id: output.id || output.call_id,
                                        namespacedToolName: output.name,
                                        args:
                                            typeof output.arguments === "string"
                                                ? JSON.parse(output.arguments)
                                                : output.arguments,
                                        toolMetadata: {
                                            description: calledTool?.description,
                                            inputSchema: calledTool?.inputSchema,
                                        },
                                    });
                                }
                            }
                        }
                    } catch {
                        // Ignore parse errors for incomplete JSON
                    }
                }
            }
        }

        await onComplete(undefined, toolCalls.length > 0 ? toolCalls : undefined);
    }

    // --- Anthropic Messages API format ---
    private async streamAnthropicMessages(
        params: StreamResponseParams,
        providerConfig: CustomProviderRow,
        apiKey: string,
    ): Promise<void> {
        const { llmConversation, modelConfig, tools, onChunk, onComplete, onError } =
            params;

        const modelName = modelConfig.modelId.split("::")[1];

        const client = new Anthropic({
            apiKey: apiKey,
            baseURL: providerConfig.base_url,
            dangerouslyAllowBrowser: true,
        });

        // Convert conversation to Anthropic format
        const messages = await this.convertToAnthropicMessages(llmConversation);

        // Map tools to Anthropic format
        const anthropicTools: Anthropic.Messages.Tool[] | undefined = tools
            ?.map((tool) => {
                if (tool.inputSchema.type !== "object") {
                    console.warn(
                        `Unsupported input schema type on tool ${JSON.stringify(tool)}`,
                    );
                    return undefined;
                }
                return {
                    name: getUserToolNamespacedName(tool),
                    description: tool.description,
                    input_schema: tool.inputSchema as { type: "object" },
                };
            })
            .filter((t) => t !== undefined) as Anthropic.Messages.Tool[] | undefined;

        const createParams: Anthropic.Messages.MessageCreateParamsStreaming = {
            model: modelName,
            messages,
            system: modelConfig.systemPrompt,
            stream: true,
            max_tokens: 8192,
            ...(anthropicTools &&
                anthropicTools.length > 0 && { tools: anthropicTools }),
        };

        const stream = client.messages.stream(createParams);

        stream.on("error", (error) => {
            console.error("Error streaming Anthropic response", error);
            onError(error.message);
        });

        stream.on("text", (text: string) => {
            onChunk(text);
        });

        const finalMessage = await stream.finalMessage();

        const toolCalls: UserToolCall[] = (finalMessage.content as Anthropic.Messages.ContentBlock[])
            .filter(
                (item: Anthropic.Messages.ContentBlock): item is Anthropic.Messages.ToolUseBlock =>
                    item.type === "tool_use",
            )
            .map((tool: Anthropic.Messages.ToolUseBlock) => {
                const calledTool = tools?.find(
                    (t) => getUserToolNamespacedName(t) === tool.name,
                );
                return {
                    id: tool.id,
                    namespacedToolName: tool.name,
                    args: tool.input as Record<string, unknown>,
                    toolMetadata: {
                        description: calledTool?.description,
                        inputSchema: calledTool?.inputSchema,
                    },
                };
            });

        await onComplete(undefined, toolCalls.length > 0 ? toolCalls : undefined);
    }

    // --- Conversion helpers ---

    private async convertToOpenAIResponsesInput(
        messages: LLMMessage[],
    ): Promise<OpenAI.Responses.ResponseInputItem[]> {
        const input: OpenAI.Responses.ResponseInputItem[] = [];

        for (const msg of messages) {
            if (msg.role === "user") {
                const content: Array<
                    | OpenAI.Responses.ResponseInputText
                    | OpenAI.Responses.ResponseInputImage
                > = [];

                // Add text content
                if (msg.content) {
                    content.push({ type: "input_text", text: msg.content });
                }

                // Handle attachments
                for (const attachment of msg.attachments ?? []) {
                    if (attachment.type === "image") {
                        const imageData = await readImageAttachment(attachment);
                        const mimeType = getMimeTypeFromFileName(attachment.originalName);
                        content.push({
                            type: "input_image",
                            image_url: `data:${mimeType};base64,${imageData}`,
                            detail: "auto",
                        });
                    } else if (attachment.type === "text") {
                        const textData = await encodeTextAttachment(attachment);
                        content.push({
                            type: "input_text",
                            text: `[File: ${attachment.originalName}]\n${textData}`,
                        });
                    } else if (attachment.type === "webpage") {
                        const webpageData =
                            await encodeWebpageAttachment(attachment);
                        content.push({
                            type: "input_text",
                            text: `[Webpage: ${attachment.originalName}]\n${webpageData}`,
                        });
                    } else if (attachment.type === "pdf") {
                        const pdfData = await readPdfAttachment(attachment);
                        content.push({
                            type: "input_text",
                            text: `[PDF: ${attachment.originalName}]\n${attachmentMissingFlag(attachment)} (base64 data available)`,
                        });
                        // Note: OpenAI Responses API may not support PDFs directly
                        // Could convert to images if needed
                        void pdfData;
                    }
                }

                input.push({
                    role: "user",
                    content: content.length === 1 ? content[0] : content,
                } as OpenAI.Responses.ResponseInputItem);
            } else if (msg.role === "assistant") {
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    // Add function calls as separate items
                    for (const tc of msg.toolCalls) {
                        input.push({
                            type: "function_call",
                            call_id: tc.id,
                            name: tc.namespacedToolName,
                            arguments: JSON.stringify(tc.args),
                        } as OpenAI.Responses.ResponseInputItem);
                    }
                } else {
                    input.push({
                        role: "assistant",
                        content: msg.content,
                    } as OpenAI.Responses.ResponseInputItem);
                }
            } else if (msg.role === "tool_results") {
                for (const result of msg.toolResults) {
                    input.push({
                        type: "function_call_output",
                        call_id: result.id,
                        output: result.content,
                    } as OpenAI.Responses.ResponseInputItem);
                }
            }
        }

        return input;
    }

    private async convertToGoogleInteractionsInput(
        messages: LLMMessage[],
    ): Promise<unknown[]> {
        const input: unknown[] = [];

        for (const msg of messages) {
            if (msg.role === "user") {
                const content: unknown[] = [];

                // Add text content
                if (msg.content) {
                    content.push({ type: "text", text: msg.content });
                }

                // Handle attachments
                for (const attachment of msg.attachments ?? []) {
                    if (attachment.type === "image") {
                        const imageData = await readImageAttachment(attachment);
                        const mimeType = getMimeTypeFromFileName(attachment.originalName);
                        content.push({
                            type: "image",
                            data: imageData,
                            mime_type: mimeType,
                        });
                    } else if (attachment.type === "pdf") {
                        const pdfData = await readPdfAttachment(attachment);
                        content.push({
                            type: "document",
                            data: pdfData,
                            mime_type: "application/pdf",
                        });
                    } else if (attachment.type === "text") {
                        const textData = await encodeTextAttachment(attachment);
                        content.push({
                            type: "text",
                            text: `[File: ${attachment.originalName}]\n${textData}`,
                        });
                    } else if (attachment.type === "webpage") {
                        const webpageData =
                            await encodeWebpageAttachment(attachment);
                        content.push({
                            type: "text",
                            text: `[Webpage: ${attachment.originalName}]\n${webpageData}`,
                        });
                    }
                }

                input.push({ role: "user", content });
            } else if (msg.role === "assistant") {
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    // Add function calls as separate items
                    for (const tc of msg.toolCalls) {
                        input.push({
                            type: "function_call",
                            name: tc.namespacedToolName,
                            call_id: tc.id,
                            arguments: tc.args,
                        });
                    }
                } else {
                    input.push({ role: "model", content: msg.content });
                }
            } else if (msg.role === "tool_results") {
                for (const result of msg.toolResults) {
                    input.push({
                        type: "function_result",
                        name: result.namespacedToolName,
                        call_id: result.id,
                        result: result.content,
                    });
                }
            }
        }

        return input;
    }

    private async convertToAnthropicMessages(
        messages: LLMMessage[],
    ): Promise<Anthropic.Messages.MessageParam[]> {
        const result: Anthropic.Messages.MessageParam[] = [];

        for (const msg of messages) {
            if (msg.role === "user") {
                const content: Anthropic.Messages.ContentBlockParam[] = [];

                // Add text content
                if (msg.content) {
                    content.push({ type: "text", text: msg.content });
                }

                // Handle attachments
                for (const attachment of msg.attachments ?? []) {
                    if (attachment.type === "image") {
                        const imageData = await readImageAttachment(attachment);
                        const mediaType = getMimeTypeFromFileName(attachment.originalName) as
                            | "image/jpeg"
                            | "image/png"
                            | "image/gif"
                            | "image/webp";
                        content.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: mediaType,
                                data: imageData,
                            },
                        });
                    } else if (attachment.type === "pdf") {
                        const pdfData = await readPdfAttachment(attachment);
                        content.push({
                            type: "document",
                            source: {
                                type: "base64",
                                media_type: "application/pdf",
                                data: pdfData,
                            },
                        } as Anthropic.Messages.ContentBlockParam);
                    } else if (attachment.type === "text") {
                        const textData = await encodeTextAttachment(attachment);
                        content.push({
                            type: "text",
                            text: `[File: ${attachment.originalName}]\n${textData}`,
                        });
                    } else if (attachment.type === "webpage") {
                        const webpageData =
                            await encodeWebpageAttachment(attachment);
                        content.push({
                            type: "text",
                            text: `[Webpage: ${attachment.originalName}]\n${webpageData}`,
                        });
                    }
                }

                result.push({ role: "user", content });
            } else if (msg.role === "assistant") {
                const content: Anthropic.Messages.ContentBlockParam[] = [];

                if (msg.content) {
                    content.push({ type: "text", text: msg.content });
                }

                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    for (const tc of msg.toolCalls) {
                        content.push({
                            type: "tool_use",
                            id: tc.id,
                            name: tc.namespacedToolName,
                            input: tc.args,
                        });
                    }
                }

                result.push({ role: "assistant", content });
            } else if (msg.role === "tool_results") {
                const content: Anthropic.Messages.ToolResultBlockParam[] =
                    msg.toolResults.map((tr) => ({
                        type: "tool_result" as const,
                        tool_use_id: tr.id,
                        content: tr.content,
                    }));

                result.push({ role: "user", content });
            }
        }

        return result;
    }
}
