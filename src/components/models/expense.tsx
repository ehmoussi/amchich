import { getOpenAIExpense, getOpenRouterExpense } from "@/lib/llmmodels";
import { handleAsyncError } from "@/lib/utils";
import React from "react";

const _MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface OpenRouterSpent {
    usage: number;
    total: number;
}

export function Expense() {
    const [openAISpent, setOpenAISpent] = React.useState<number | undefined>(undefined);
    const [openRouterSpent, setOpenRouterSpent] = React.useState<OpenRouterSpent | undefined>(undefined);
    const now = new Date();

    React.useEffect(() => {
        let isMounted = true;

        getOpenAIExpense()
            .then((value) => {
                if (isMounted)
                    setOpenAISpent(value);
            }).catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenAI provider");
            });
        getOpenRouterExpense()
            .then((value) => {
                setOpenRouterSpent(value);
            })
            .catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenRouter provider");
            });

        return () => { isMounted = false; }
    }, []);

    return (
        <div className="flex flex-col">
            {openAISpent && <span>OpenAI ({_MONTHS[now.getMonth()]}): {openAISpent.toPrecision(2)} $</span>}
            {openRouterSpent &&
                <span>OpenRouter:
                    &nbsp;{openRouterSpent.usage.toPrecision(2)} / {openRouterSpent.total.toPrecision(2)} $
                    ({(openRouterSpent.usage / openRouterSpent.total * 100).toPrecision(2)}%)</span>}
        </div>
    );
}

