import { useLiveQuery } from "dexie-react-hooks";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select";
import { setActiveLLMModel, getActiveLLMModel, type LLMID, type LLMModel, areModelsObsolete, type LLMProvider, getLLMModelsByProvider, getMostUsedLLMModels } from "../../lib/db";
import { updateAvailableModels } from "../../lib/llmmodels";
import React from "react";
import { Button } from "../ui/button";
import { Check, Loader2, RefreshCcw } from "lucide-react";
import { handleAsyncError } from "../../lib/utils";
import { useMounted } from "../../hooks/usemounted";

const _SHOW_SUCCESS_DELAY = 1200; // How many ms the updated success message is displayed
const _MAX_MOST_USED_MODELS = 5; // How many most used models are displayed


function ChatModelsUpdater({ showInitialSuccess }: { showInitialSuccess: boolean }) {
    const [showSuccess, setShowSuccess] = React.useState<boolean>(showInitialSuccess);
    const [isLoading, setIsLoading] = React.useState<boolean>(false);
    const isMounted = useMounted();

    React.useEffect(() => {
        if (!showSuccess) return;
        const timer = setTimeout(() => { setShowSuccess(false) }, _SHOW_SUCCESS_DELAY);
        return () => { clearTimeout(timer) }
    }, [showSuccess]);

    const updateAvailableModelsClicked = React.useCallback(() => {
        if (!isMounted()) return;
        setIsLoading(true);

        const controller = new AbortController();

        updateAvailableModels(controller.signal)
            .then(() => {
                if (isMounted())
                    setShowSuccess(true);
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    handleAsyncError(error, "Failed to fetch available models");
                }
            })
            .finally(() => {
                if (isMounted()) {
                    setIsLoading(false);
                }
            });
    }, [isMounted]);

    if (isLoading) {
        return (
            <Button disabled variant="ghost">
                <Loader2 className="animate-spin" />
            </Button>
        );
    }

    return (
        <div className="relative">
            <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={updateAvailableModelsClicked} aria-label="Refresh models">
                    <RefreshCcw />
                </Button>
                {showSuccess &&
                    <>
                        <Check className="w-4 h-4 text-green-600"
                            aria-label="Models updated successfully" />
                        <span className="text-xs text-green-600">Updated</span>
                    </>
                }
            </div>
        </div>
    );
}

interface ModelsInfo {
    modelsByProvider: Map<LLMProvider, LLMModel[]>;
    mostUsedModels: LLMModel[];
}

export function ChatModelSelector() {
    const [showAutoUpdateSuccess, setShowAutoUpdateSuccess] = React.useState<boolean>(false);
    const modelsInfo = useLiveQuery(async (): Promise<ModelsInfo> => {
        try {
            const mostUsedModels = await getMostUsedLLMModels(_MAX_MOST_USED_MODELS);
            const modelsByProvider = await getLLMModelsByProvider(mostUsedModels);
            return { modelsByProvider, mostUsedModels };
        } catch (error) {
            handleAsyncError(error, "Failed to get available models");
            return { modelsByProvider: new Map(), mostUsedModels: [] };
        }
    }, []);

    const currentLLMModel = useLiveQuery(async (): Promise<LLMModel | undefined> => {
        try {
            return await getActiveLLMModel();
        } catch (error) {
            handleAsyncError(error, "Failed to get the current model");
            return undefined;
        }
    }, []);

    const currentModelId = currentLLMModel?.name;

    const changeCurrentModelId = React.useCallback((modelId: LLMID) => {
        setActiveLLMModel(modelId).catch((error: unknown) => {
            handleAsyncError(error, "Failed to update the current model");
        });
    }, []);

    React.useEffect(() => {
        const controller = new AbortController();

        const fetchModels = async (): Promise<boolean> => {
            if (await areModelsObsolete()) {
                await updateAvailableModels(controller.signal);
                return true;
            }
            return false;
        }

        fetchModels()
            .then((isUpdated) => {
                if (isUpdated)
                    setShowAutoUpdateSuccess(true);
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted)
                    handleAsyncError(error, "Failed to fetch available models");
            });

        return () => { controller.abort(); }
    }, []);

    if (modelsInfo === undefined) {
        return (
            <Select disabled>
                <SelectTrigger>
                    <SelectValue placeholder="Loading models..." />
                </SelectTrigger>
            </Select>
        );
    }

    const { modelsByProvider, mostUsedModels } = modelsInfo;

    if (modelsByProvider.size === 0) {
        return (
            <Select disabled>
                <SelectTrigger>
                    <SelectValue placeholder="No models available" />
                </SelectTrigger>
            </Select>
        );
    }

    return (
        <div className="flex gap-1">
            <Select
                value={currentModelId}
                onValueChange={changeCurrentModelId}
                aria-label="Select a model"
            >
                <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectLabel>{`Most Used (${mostUsedModels.length.toString()})`}</SelectLabel>
                        {
                            mostUsedModels.map((model) => {
                                return (
                                    <SelectItem key={model.name} value={model.name}>
                                        {model.name}
                                    </SelectItem>
                                );
                            })
                        }
                    </SelectGroup>
                    {
                        Array.from(modelsByProvider.keys()).sort().map((provider) => {
                            const models = modelsByProvider.get(provider);
                            const nbModels = models?.length ?? 0;
                            return (
                                <SelectGroup key={provider}>
                                    <SelectLabel>{`${provider} (${nbModels.toString()})`}</SelectLabel>
                                    {
                                        models?.map((model) => (
                                            <SelectItem key={model.name} value={model.name}>
                                                {model.name}
                                            </SelectItem>
                                        ))
                                    }
                                </SelectGroup>
                            );
                        })
                    }
                </SelectContent>
            </Select>
            <ChatModelsUpdater showInitialSuccess={showAutoUpdateSuccess} />
        </div>
    );
}