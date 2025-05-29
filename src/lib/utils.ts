import { clsx, type ClassValue } from "clsx"
import { toast } from "sonner";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function handleAsyncError(error: unknown, message: string): void {
    console.log(`${message}:`, error);
    toast.error(message);
}
