import { cn } from "../../lib/utils";
import React from "react";


interface ChatTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
    value: string
    onChange: (value: string) => void
}

export function ChatTextarea({ className, value, onChange, rows, ...props }: ChatTextareaProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const resizeTextarea = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${textarea.scrollHeight.toString()}px`;
        }
    }, [textareaRef]);

    React.useEffect(() => {
        resizeTextarea();
    }, [value, resizeTextarea]);

    return (
        <textarea
            {...props}
            value={value}
            ref={textareaRef}
            rows={rows}
            onChange={(e) => {
                onChange(e.target.value);
                resizeTextarea();
            }}
            className={cn("resize-none min-h-4 max-h-80", className)}
        ></textarea>
    );
}