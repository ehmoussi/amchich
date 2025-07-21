import { getOpenRouterExpense } from "@/lib/llmmodels";
import { cn, handleAsyncError } from "../../lib/utils";
import React from "react";


interface OpenRouterSpent {
    usage: number;
    total: number;
}

export function Expense({ className }: { className?: string }) {
    const [openRouterSpent, setOpenRouterSpent] = React.useState<OpenRouterSpent | undefined>(undefined);

    React.useEffect(() => {
        let isMounted = true;

        getOpenRouterExpense()
            .then((value) => {
                if (isMounted)
                    setOpenRouterSpent(value);
            })
            .catch((error: unknown) => {
                handleAsyncError(error, "Can't retrieve the amount spent in the OpenRouter provider");
            });

        return () => { isMounted = false; }
    }, []);

    return (
        <div className={cn("flex flex-col", className)}>
            <span className="mx-5">OpenRouter:
                &nbsp;{openRouterSpent ? `${(openRouterSpent.usage).toPrecision(3)} / ${(openRouterSpent.total.toPrecision(3))} $
                (${(openRouterSpent.usage / openRouterSpent.total * 100).toPrecision(1)}%)` : "Loading..."}
            </span>
        </div>
    );
}

