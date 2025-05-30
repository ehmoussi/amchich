import type { UserMessage as UMessage } from "../../lib/db";

export function UserMessage({ message }: { message: UMessage }) {
    return (
        <div className="group flex flex-col">
            <div
                className="max-w-[95%] rounded-lg px-3 py-2 text-lg whitespace-pre-line self-end border border-neutral-500 bg-neutral-50 text-black"
            >
                {message.content.text}
            </div>
        </div>
    );
}