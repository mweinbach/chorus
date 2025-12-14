import { IProvider } from "./IProvider";
import { StreamResponseParams } from "../Models";
import OpenAI from "openai";
import { db } from "../DB";
import { SettingsManager } from "@core/utilities/Settings";
import OpenAICompletionsAPIUtils from "../OpenAICompletionsAPIUtils";

interface CustomProviderRow {
    id: string;
    display_name: string;
    base_url: string;
}

async function getCustomProviderConfig(
    providerId: string,
): Promise<CustomProviderRow | undefined> {
    const rows = await db.select<CustomProviderRow[]>(
        "SELECT id, display_name, base_url FROM custom_providers WHERE id = ?",
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

export class ProviderCustom implements IProvider {
    async streamResponse({
        llmConversation,
        modelConfig,
        tools,
        onChunk,
        onComplete,
        onError,
    }: StreamResponseParams): Promise<void> {
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
}
