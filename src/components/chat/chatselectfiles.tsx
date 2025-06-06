import React from "react";
import { Button } from "../ui/button";
import { Paperclip } from "lucide-react";

export function ChatSelectFiles({ setSelectedFiles }: { setSelectedFiles: (selectedFiles: File[]) => void }) {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);

    return (

        <div className="flex items-end pb-1">
            <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setSelectedFiles(files);
                }}
                hidden
                multiple
            />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-12 h-12 rounded-full p-0 hover:bg-muted border-neutral-500 bg-neutral-200"
                onClick={() => fileInputRef.current?.click()}
            >
                <Paperclip size={28} />
            </Button>
        </div>
    );
}