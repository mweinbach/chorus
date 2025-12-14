import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "../DB";
import { ICustomProvider } from "../types/CustomProvider";
import * as Models from "../Models";
import { SettingsManager } from "@core/utilities/Settings";

interface CustomProviderDBRow {
    id: string;
    display_name: string;
    base_url: string;
    created_at: string;
    updated_at: string;
}

const customProviderKeys = {
    all: () => ["customProviders"] as const,
    list: () => [...customProviderKeys.all(), "list"] as const,
    detail: (id: string) => [...customProviderKeys.all(), "detail", id] as const,
};

function readCustomProvider(row: CustomProviderDBRow): ICustomProvider {
    return {
        id: row.id,
        displayName: row.display_name,
        baseUrl: row.base_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function fetchCustomProviders(): Promise<ICustomProvider[]> {
    const rows = await db.select<CustomProviderDBRow[]>(
        "SELECT * FROM custom_providers ORDER BY display_name",
    );
    return rows.map(readCustomProvider);
}

export function useCustomProviders() {
    return useQuery({
        queryKey: customProviderKeys.list(),
        queryFn: fetchCustomProviders,
    });
}

export function useCreateCustomProvider() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (provider: {
            displayName: string;
            baseUrl: string;
            apiKey: string;
        }) => {
            const id = crypto.randomUUID();
            await db.execute(
                "INSERT INTO custom_providers (id, display_name, base_url) VALUES (?, ?, ?)",
                [id, provider.displayName, provider.baseUrl],
            );

            // Store API key
            const settingsManager = SettingsManager.getInstance();
            const settings = await settingsManager.get();
            await settingsManager.set({
                ...settings,
                customProviderApiKeys: {
                    ...settings.customProviderApiKeys,
                    [id]: provider.apiKey,
                },
            });

            return id;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: customProviderKeys.all(),
            });
        },
    });
}

export function useUpdateCustomProvider() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: {
            id: string;
            displayName: string;
            baseUrl: string;
            apiKey?: string;
        }) => {
            await db.execute(
                "UPDATE custom_providers SET display_name = ?, base_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [params.displayName, params.baseUrl, params.id],
            );

            if (params.apiKey !== undefined) {
                const settingsManager = SettingsManager.getInstance();
                const settings = await settingsManager.get();
                await settingsManager.set({
                    ...settings,
                    customProviderApiKeys: {
                        ...settings.customProviderApiKeys,
                        [params.id]: params.apiKey,
                    },
                });
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: customProviderKeys.all(),
            });
        },
    });
}

export function useDeleteCustomProvider() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            // Delete all models for this provider
            await db.execute("DELETE FROM model_configs WHERE model_id LIKE ?", [
                `custom-${id}::%`,
            ]);
            await db.execute("DELETE FROM models WHERE id LIKE ?", [
                `custom-${id}::%`,
            ]);

            // Delete the provider
            await db.execute("DELETE FROM custom_providers WHERE id = ?", [id]);

            // Remove API key
            const settingsManager = SettingsManager.getInstance();
            const settings = await settingsManager.get();
            const updatedKeys = { ...settings.customProviderApiKeys };
            delete updatedKeys[id];
            await settingsManager.set({
                ...settings,
                customProviderApiKeys: updatedKeys,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: customProviderKeys.all(),
            });
            await queryClient.invalidateQueries({ queryKey: ["modelConfigs"] });
            await queryClient.invalidateQueries({ queryKey: ["models"] });
        },
    });
}

// Model management for custom providers
export function useAddCustomProviderModel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: {
            providerId: string;
            modelName: string;
            displayName?: string;
        }) => {
            const modelId = `custom-${params.providerId}::${params.modelName}`;
            const displayName = params.displayName || params.modelName;

            await Models.saveModelAndDefaultConfig(
                db,
                {
                    id: modelId,
                    displayName: displayName,
                    supportedAttachmentTypes: ["text", "image", "webpage"],
                    isEnabled: true,
                    isInternal: false,
                },
                displayName,
            );

            return modelId;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["modelConfigs"] });
            await queryClient.invalidateQueries({ queryKey: ["models"] });
        },
    });
}

export function useDeleteCustomProviderModel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (modelId: string) => {
            await db.execute("DELETE FROM model_configs WHERE model_id = ?", [
                modelId,
            ]);
            await db.execute("DELETE FROM models WHERE id = ?", [modelId]);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["modelConfigs"] });
            await queryClient.invalidateQueries({ queryKey: ["models"] });
        },
    });
}

// Fetch models for a specific custom provider
export async function fetchCustomProviderModels(
    providerId: string,
): Promise<Models.Model[]> {
    const pattern = `custom-${providerId}::%`;
    const rows = await db.select<
        {
            id: string;
            display_name: string;
            is_enabled: boolean;
            supported_attachment_types: string;
            is_internal: boolean;
        }[]
    >("SELECT * FROM models WHERE id LIKE ?", [pattern]);

    return rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        isEnabled: row.is_enabled,
        supportedAttachmentTypes: JSON.parse(
            row.supported_attachment_types,
        ) as Models.AttachmentType[],
        isInternal: row.is_internal,
    }));
}

export function useCustomProviderModels(providerId: string) {
    return useQuery({
        queryKey: [...customProviderKeys.detail(providerId), "models"] as const,
        queryFn: () => fetchCustomProviderModels(providerId),
    });
}

// Refresh models from provider's /v1/models endpoint
export function useRefreshCustomProviderModels() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: {
            providerId: string;
            baseUrl: string;
            apiKey: string;
        }) => {
            return await Models.downloadCustomProviderModels(
                db,
                params.providerId,
                params.baseUrl,
                params.apiKey,
            );
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["modelConfigs"] });
            await queryClient.invalidateQueries({ queryKey: ["models"] });
            await queryClient.invalidateQueries({
                queryKey: customProviderKeys.all(),
            });
        },
    });
}

// Toggle model enabled/disabled state
export function useToggleCustomProviderModel() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (params: { modelId: string; isEnabled: boolean }) => {
            await db.execute("UPDATE models SET is_enabled = ? WHERE id = ?", [
                params.isEnabled ? 1 : 0,
                params.modelId,
            ]);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["modelConfigs"] });
            await queryClient.invalidateQueries({ queryKey: ["models"] });
            await queryClient.invalidateQueries({
                queryKey: customProviderKeys.all(),
            });
        },
    });
}
