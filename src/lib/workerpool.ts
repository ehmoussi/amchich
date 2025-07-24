import Worker from "./worker?worker";
import { createMessage, deleteStreamingMessage, updateStreamingMessage, type ConversationID } from "./db";
import { handleAsyncError } from "./utils";
import type { WorkerStreamingMessage } from "./worker";

interface WorkerState {
    worker: Worker;
    lastActivity: Date;
    conversationId?: ConversationID;
    isActive: boolean;
}


export class WorkerPool {
    private workers: WorkerState[] = [];
    private waitingConversations = new Map<ConversationID, Date>();
    private capacity = 3;
    private maxIdleWorkerTime = 10 * 60 * 1000;
    private cleanupInterval: NodeJS.Timeout | undefined;
    private maxTokens = 2000;
    private apiKey: string | undefined;

    public constructor(capacity: number) {
        this.capacity = capacity;
    }

    public setApiKey(apiKey: string) {
        this.apiKey = apiKey;
    }

    public setMaxTokens(maxTokens: number) {
        this.maxTokens = maxTokens;
    }

    private startCleanupInterval(): void {
        this.cleanupInterval = setInterval(() => {
            const maxIdleWorker = this.waitingConversations.size;
            const idleWorkers = this.workers.filter((w) => !w.isActive);
            if (idleWorkers.length > maxIdleWorker) {
                let countIdleWorker = 0;
                const now = (new Date()).getTime();
                // Oldest first to remove them first
                this.workers.sort((w1, w2) => (w1.lastActivity.getTime() - w2.lastActivity.getTime()));
                this.workers = this.workers.filter((workerState) => {
                    if (!workerState.isActive && ((now - workerState.lastActivity.getTime()) > this.maxIdleWorkerTime)) {
                        countIdleWorker += 1;
                        if (countIdleWorker > maxIdleWorker) {
                            workerState.worker.terminate();
                            return false;
                        }
                    }
                    return true;
                });
            }
        }, this.maxIdleWorkerTime);
    }

    public async startStreaming(conversationId: ConversationID): Promise<void> {
        if (!this.cleanupInterval) this.startCleanupInterval();
        // 1. Find an available worker or create a new one 
        let workerState = this.workers.find((w) => !w.isActive);
        if (workerState === undefined && this.workers.length < this.capacity) {
            workerState = this.createWorkerState();
        }
        // 2. Start the streaming using the worker or Add a waiting message
        if (workerState !== undefined) {
            // Set active true here to avoid race conditions
            workerState.isActive = true;
            await this.initStreaming(workerState, conversationId);
        } else if (!this.waitingConversations.has(conversationId)) {
            await this.addWaitingMessage(conversationId);
        }
    }

    public async abortStreaming(conversationId: ConversationID): Promise<void> {
        if (this.waitingConversations.delete(conversationId)) {
            // console.log("Delete waiting streaming message of conversation", conversationId);
            await deleteStreamingMessage(conversationId);
        } else {
            const workerState = this.workers.find((w) => w.conversationId === conversationId);
            // abort will send a finished message so no need of processing waiting conversations
            if (workerState) {
                workerState.worker.postMessage({ type: "abort" });
                // console.log("Send abort message to the worker of", conversationId);
            }
        }
    }

    private async processWaitingConversations(workerState: WorkerState): Promise<void> {
        if (this.waitingConversations.size === 0) return;
        const conversationId = this.findOldestWaitingConversation();
        if (conversationId) {
            await this.initStreaming(workerState, conversationId);
        }
    }

    private async initStreaming(workerState: WorkerState, conversationId: ConversationID): Promise<void> {
        this.waitingConversations.delete(conversationId);
        workerState.isActive = true;
        workerState.conversationId = conversationId;
        workerState.lastActivity = new Date();
        await deleteStreamingMessage(conversationId);
        workerState.worker.postMessage({
            type: "init",
            payload: {
                conversationId,
                maxTokens: this.maxTokens,
                apiKey: this.apiKey
            }
        });
    }

    private async addWaitingMessage(conversationId: ConversationID): Promise<void> {
        this.waitingConversations.set(conversationId, new Date());
        // Create a waiting message
        const message = createMessage(conversationId, "assistant", "Busy: can't process the message yet", [], true);
        await updateStreamingMessage(message);
    }

    private findOldestWaitingConversation(): ConversationID | undefined {
        let conversationId: ConversationID | undefined;
        let oldestDate: Date | undefined;
        for (const [cid, date] of this.waitingConversations.entries()) {
            if (oldestDate === undefined || date < oldestDate) {
                conversationId = cid;
                oldestDate = date;
            }
        }
        return conversationId;
    }

    private createWorkerState(): WorkerState {
        const workerState = { worker: new Worker(), lastActivity: new Date(), isActive: false };
        this.addEventListeners(workerState);
        this.workers.push(workerState);
        return workerState;
    }

    private addEventListeners(workerState: WorkerState): void {
        workerState.worker.addEventListener(
            "message", (event: MessageEvent<WorkerStreamingMessage>) => { this.handleMessage(workerState, event); }
        );
        workerState.worker.addEventListener(
            "error", (error: unknown) => { this.handleError(workerState, error); }
        );
    }

    private recreateWorker(workerState: WorkerState): void {
        workerState.worker.terminate();
        workerState.worker = new Worker();
        this.addEventListeners(workerState);
    }

    private handleMessage(workerState: WorkerState, event: MessageEvent<WorkerStreamingMessage>) {
        if (event.data.type === "finished") {
            this.cleanWorkerState(workerState);
            this.processWaitingConversations(workerState).catch((error: unknown) => {
                handleAsyncError(error, "Failed to process a waiting conversation");
            });
        }
    }

    private handleError(workerState: WorkerState, error: unknown) {
        this.recreateWorker(workerState);
        this.cleanWorkerState(workerState);
        handleAsyncError(error, "Worker failed to stream the answer");
        this.processWaitingConversations(workerState).catch((error: unknown) => {
            handleAsyncError(error, "Failed to process a waiting conversation");
        });
    }

    private cleanWorkerState(workerState: WorkerState) {
        workerState.conversationId = undefined;
        workerState.lastActivity = new Date();
        workerState.isActive = false;
    }
}
