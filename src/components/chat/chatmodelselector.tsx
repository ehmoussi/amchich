import { useLiveQuery } from "dexie-react-hooks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { setActiveLLMModel, getLLMModels, getActiveLLMModel, type LLMID } from "../../lib/db";
import React from "react";
import { toast } from "sonner";


const ChatModelSelectContent = React.memo(() => {
    const models = useLiveQuery(async () => await getLLMModels(), []);
    return (
        <SelectContent>
            {
                models?.map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                        {model.name}
                    </SelectItem>
                ))
            }
        </SelectContent>
    );
});


export function ChatModelSelector() {
    const currentLLMModel = useLiveQuery(async () => await getActiveLLMModel(), []);
    const currentModel: LLMID = currentLLMModel ? currentLLMModel.name : "";

    const changeCurrentModel = React.useCallback((modelName: LLMID) => {
        setActiveLLMModel(modelName).catch((error: unknown) => {
            const msg = "Failed to update the current model";
            console.error(`${msg}:`, error);
            toast.error(msg);
        });
    }, []);


    return (
        <Select
            value={currentModel}
            onValueChange={changeCurrentModel}
        >
            <SelectTrigger>
                <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <ChatModelSelectContent />
        </Select>
    );
}