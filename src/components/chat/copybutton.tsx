import React from "react";
import { Check, Copy } from "lucide-react";
import { handleAsyncError } from "@/lib/utils";


export const CopyButton = React.memo(function ({ text }: { text: string }) {
    const [isFinishedCopying, setIsFinishedCopying] = React.useState(false);

    // Clear the Finished copying after 1s
    React.useEffect(() => {
        let timeout: NodeJS.Timeout | undefined = undefined;
        if (isFinishedCopying)
            timeout = setTimeout(() => {
                setIsFinishedCopying(false);
            }, 1000);
        return () => { if (timeout) clearTimeout(timeout) }
    }, [isFinishedCopying]);

    return (
        <button
            type="button"
            onClick={() => {
                navigator.clipboard.writeText(text)
                    .then(() => { setIsFinishedCopying(true); })
                    .catch((error: unknown) => {
                        handleAsyncError(error, "Failed to copy in the clipboard");
                    })
            }}
            className="p-1 rounded hover:bg-black/10"
            aria-label="Copy message"
        >
            {
                isFinishedCopying ?
                    <Check size={16} /> :
                    <Copy size={16} />
            }
        </button>
    );
});
