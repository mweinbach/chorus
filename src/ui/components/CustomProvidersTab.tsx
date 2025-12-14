import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "./ui/collapsible";
import {
    ChevronDown,
    Plus,
    Trash2,
    Pencil,
    Server,
    Loader2,
    RefreshCcw,
} from "lucide-react";
import {
    useCustomProviders,
    useCreateCustomProvider,
    useUpdateCustomProvider,
    useDeleteCustomProvider,
    useAddCustomProviderModel,
    useDeleteCustomProviderModel,
    useCustomProviderModels,
    useRefreshCustomProviderModels,
    useToggleCustomProviderModel,
} from "@core/chorus/api/CustomProvidersAPI";
import { ICustomProvider } from "@core/chorus/types/CustomProvider";
import { Model } from "@core/chorus/Models";
import { Switch } from "./ui/switch";
import { toast } from "sonner";
import { SettingsManager } from "@core/utilities/Settings";

interface ProviderFormProps {
    provider?: ICustomProvider;
    onSubmit: (data: {
        displayName: string;
        baseUrl: string;
        apiKey: string;
    }) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

function ProviderForm({
    provider,
    onSubmit,
    onCancel,
    isLoading,
}: ProviderFormProps) {
    const [displayName, setDisplayName] = useState(provider?.displayName ?? "");
    const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
    const [apiKey, setApiKey] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!displayName.trim()) {
            newErrors.displayName = "Name is required";
        }
        if (!baseUrl.trim()) {
            newErrors.baseUrl = "Base URL is required";
        } else {
            try {
                new URL(baseUrl);
            } catch {
                newErrors.baseUrl = "Invalid URL format";
            }
        }
        if (!provider && !apiKey.trim()) {
            newErrors.apiKey = "API key is required for new providers";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSubmit({ displayName, baseUrl, apiKey });
        }
    };

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-2">
                <Label htmlFor="displayName">Provider Name</Label>
                <Input
                    id="displayName"
                    placeholder="My Custom Provider"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                />
                {errors.displayName && (
                    <p className="text-sm text-destructive">
                        {errors.displayName}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                    id="baseUrl"
                    placeholder="https://api.example.com/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                />
                {errors.baseUrl && (
                    <p className="text-sm text-destructive">{errors.baseUrl}</p>
                )}
                <p className="text-sm text-muted-foreground">
                    The OpenAI-compatible API endpoint (e.g.,
                    http://localhost:8000/v1 for vLLM)
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="apiKey">
                    API Key{provider ? " (leave empty to keep current)" : ""}
                </Label>
                <Input
                    id="apiKey"
                    type="password"
                    placeholder={provider ? "••••••••" : "Enter API key"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                />
                {errors.apiKey && (
                    <p className="text-sm text-destructive">{errors.apiKey}</p>
                )}
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isLoading}>
                    {isLoading && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {provider ? "Update" : "Add Provider"}
                </Button>
            </div>
        </div>
    );
}

interface ModelFormProps {
    onSubmit: (data: { modelName: string; displayName: string }) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

function ModelForm({ onSubmit, onCancel, isLoading }: ModelFormProps) {
    const [modelName, setModelName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!modelName.trim()) {
            newErrors.modelName = "Model name is required";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = () => {
        if (validate()) {
            onSubmit({
                modelName,
                displayName: displayName || modelName,
            });
        }
    };

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50 mt-4">
            <div className="space-y-2">
                <Label htmlFor="modelName">Model Name</Label>
                <Input
                    id="modelName"
                    placeholder="llama-3-70b"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                />
                {errors.modelName && (
                    <p className="text-sm text-destructive">
                        {errors.modelName}
                    </p>
                )}
                <p className="text-sm text-muted-foreground">
                    The model identifier used by the API
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="displayName">Display Name (optional)</Label>
                <Input
                    id="displayName"
                    placeholder="Llama 3 70B"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                    The name shown in the UI (defaults to model name)
                </p>
            </div>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isLoading}>
                    {isLoading && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Add Model
                </Button>
            </div>
        </div>
    );
}

interface ProviderCardProps {
    provider: ICustomProvider;
    onEdit: () => void;
    onDelete: () => void;
}

function ProviderCard({ provider, onEdit, onDelete }: ProviderCardProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showModelForm, setShowModelForm] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { data: models = [], isLoading: modelsLoading } =
        useCustomProviderModels(provider.id);
    const addModel = useAddCustomProviderModel();
    const deleteModel = useDeleteCustomProviderModel();
    const refreshModels = useRefreshCustomProviderModels();
    const toggleModel = useToggleCustomProviderModel();

    const handleAddModel = (data: {
        modelName: string;
        displayName: string;
    }) => {
        addModel.mutate(
            {
                providerId: provider.id,
                modelName: data.modelName,
                displayName: data.displayName,
            },
            {
                onSuccess: () => {
                    setShowModelForm(false);
                },
            },
        );
    };

    const handleDeleteModel = (modelId: string) => {
        deleteModel.mutate(modelId);
    };

    const handleRefreshModels = async () => {
        const settings = await SettingsManager.getInstance().get();
        const apiKey = settings.customProviderApiKeys?.[provider.id];
        if (!apiKey) {
            toast.error("API key not configured for this provider");
            return;
        }

        setIsRefreshing(true);
        try {
            const result = await refreshModels.mutateAsync({
                providerId: provider.id,
                baseUrl: provider.baseUrl,
                apiKey,
            });
            if (result.success) {
                toast.success(`Found ${result.modelCount} models`);
            } else {
                toast.error(`Failed to fetch models: ${result.error}`);
            }
        } catch (error) {
            toast.error("Failed to refresh models");
        } finally {
            setTimeout(() => setIsRefreshing(false), 600);
        }
    };

    const handleToggleModel = (modelId: string, isEnabled: boolean) => {
        toggleModel.mutate({ modelId, isEnabled });
    };

    return (
        <Card className="p-4">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-3 hover:opacity-80">
                        <Server className="w-5 h-5 text-muted-foreground" />
                        <div className="text-left">
                            <h3 className="font-medium">{provider.displayName}</h3>
                            <p className="text-sm text-muted-foreground truncate max-w-xs">
                                {provider.baseUrl}
                            </p>
                        </div>
                        <ChevronDown
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                        >
                            <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                </div>

                <CollapsibleContent className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Models</h4>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRefreshModels()}
                                disabled={isRefreshing}
                            >
                                <RefreshCcw
                                    className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                                />
                                Refresh
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowModelForm(true)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add
                            </Button>
                        </div>
                    </div>

                    {modelsLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                    ) : models.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No models yet. Click Refresh to discover models from
                            /v1/models, or Add to manually add one.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {models.map((model: Model) => (
                                <div
                                    key={model.id}
                                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={model.isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleToggleModel(
                                                    model.id,
                                                    checked,
                                                )
                                            }
                                        />
                                        <span
                                            className={`text-sm ${!model.isEnabled ? "text-muted-foreground" : ""}`}
                                        >
                                            {model.displayName}
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                            handleDeleteModel(model.id)
                                        }
                                    >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {showModelForm && (
                        <ModelForm
                            onSubmit={handleAddModel}
                            onCancel={() => setShowModelForm(false)}
                            isLoading={addModel.isPending}
                        />
                    )}
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

export function CustomProvidersTab() {
    const [showForm, setShowForm] = useState(false);
    const [editingProvider, setEditingProvider] =
        useState<ICustomProvider | undefined>();
    const { data: providers = [], isLoading } = useCustomProviders();
    const createProvider = useCreateCustomProvider();
    const updateProvider = useUpdateCustomProvider();
    const deleteProvider = useDeleteCustomProvider();

    const handleCreate = (data: {
        displayName: string;
        baseUrl: string;
        apiKey: string;
    }) => {
        createProvider.mutate(data, {
            onSuccess: () => {
                setShowForm(false);
            },
        });
    };

    const handleUpdate = (data: {
        displayName: string;
        baseUrl: string;
        apiKey: string;
    }) => {
        if (!editingProvider) return;
        updateProvider.mutate(
            {
                id: editingProvider.id,
                displayName: data.displayName,
                baseUrl: data.baseUrl,
                apiKey: data.apiKey || undefined,
            },
            {
                onSuccess: () => {
                    setEditingProvider(undefined);
                },
            },
        );
    };

    const handleDelete = (id: string) => {
        deleteProvider.mutate(id);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold mb-2">Custom Providers</h2>
                <p className="text-sm text-muted-foreground">
                    Add your own OpenAI-compatible API endpoints to use with
                    Chorus. Great for self-hosted models (vLLM, TGI, LocalAI) or
                    alternative providers.
                </p>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={() => setShowForm(true)}
                    disabled={showForm || !!editingProvider}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Provider
                </Button>
            </div>

            {showForm && (
                <ProviderForm
                    onSubmit={handleCreate}
                    onCancel={() => setShowForm(false)}
                    isLoading={createProvider.isPending}
                />
            )}

            {editingProvider && (
                <ProviderForm
                    provider={editingProvider}
                    onSubmit={handleUpdate}
                    onCancel={() => setEditingProvider(undefined)}
                    isLoading={updateProvider.isPending}
                />
            )}

            {providers.length === 0 && !showForm ? (
                <Card className="p-8 text-center">
                    <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">
                        No Custom Providers
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Add a custom provider to use your own OpenAI-compatible
                        API endpoints.
                    </p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {providers.map((provider) => (
                        <ProviderCard
                            key={provider.id}
                            provider={provider}
                            onEdit={() => setEditingProvider(provider)}
                            onDelete={() => handleDelete(provider.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
