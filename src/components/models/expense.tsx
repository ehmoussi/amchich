import { getOpenAIExpense, getOpenRouterExpense } from "@/lib/llmmodels";
import { cn, handleAsyncError } from "../../lib/utils";
import React from "react";

const _MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface OpenRouterSpent {
    usage: number;
    total: number;
}

export function Expense({ className }: { className?: string }) {
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
        <div className={cn("flex flex-col", className)}>
            <span className="mx-5">OpenAI ({_MONTHS[now.getMonth()]}): {openAISpent ? `${openAISpent.toPrecision(1)} $` : "Loading..."}</span>
            <span className="mx-5">OpenRouter:
                &nbsp;{openRouterSpent ? `${(openRouterSpent.usage / openRouterSpent.total).toPrecision(1)} $
                    (${(openRouterSpent.usage / openRouterSpent.total * 100).toPrecision(1)}%)` : "Loading..."}
            </span>
        </div>
    );
}

