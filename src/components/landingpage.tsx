
export function LandingPage() {
    return (
        <div className="flex-1 content-center overflow-y-auto pt-6 px-6">
            <header className="m-auto flex max-w-96 flex-col gap-5 text-center">
                <h1 className="text-2xl font-semibold leading-none tracking-tight">
                    Amchich
                </h1>
                <p className="text-muted-foreground ">
                    Select an LLM model and send a message to start a new conversation.
                </p>
            </header>
        </div >
    );
}
