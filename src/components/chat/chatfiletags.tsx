import { Paperclip } from "lucide-react";

interface ChatFileTagsProps {
    selectedFiles: File[];
    setSelectedFiles?: (selectedFiles: File[]) => void;
}

export function ChatFileTags({ selectedFiles, setSelectedFiles }: ChatFileTagsProps) {
    return (
        <div className="mt-2 flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
                <div
                    key={`${file.name}-${index.toString()}`}
                    className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 text-sm"
                >
                    <Paperclip size={14} className="text-muted-foreground" />
                    <span className="text-foreground">{file.name}</span>
                    {setSelectedFiles &&
                        <button
                            type="button"
                            onClick={() => {
                                const newFiles = selectedFiles.filter((_, i) => i !== index);
                                setSelectedFiles(newFiles);
                            }}
                            className="text-muted-foreground hover:text-foreground ml-1"
                        >
                            ×
                        </button>
                    }
                </div>
            )
            )}
        </div>
    );
}