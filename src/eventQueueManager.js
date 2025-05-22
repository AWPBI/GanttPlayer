export default class EventQueueManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.eventQueue = [];
        this.overlappingTasks = new Set();
        this.isProcessingQueue = false;
    }

    async processQueue(force = false) {
        if (this.isProcessingQueue && !force) return;
        this.isProcessingQueue = true;

        const queue = [...this.eventQueue];
        this.eventQueue = [];

        for (const { event, task } of queue) {
            try {
                await this.gantt.options[`on_${event}`](task);
            } catch (error) {
                console.error(
                    `Error processing ${event} for task ${task.id}:`,
                    error,
                );
            }
        }

        this.isProcessingQueue = false;
    }

    addEvent(event, task) {
        this.eventQueue.push({ event, task });
        this.overlappingTasks.add(task.id);
        this.processQueue();
    }

    initialize() {
        if (!this.gantt.options.custom_marker) return;
        const currentDate = this.gantt.config.custom_marker_date;
        const initialOverlapping = this.gantt.taskManager.tasks
            .filter(
                (task) => task._start <= currentDate && currentDate < task._end,
            )
            .map((task) => task.id);

        initialOverlapping.forEach((id) => {
            if (!this.overlappingTasks.has(id)) {
                this.addEvent('bar_enter', this.gantt.taskManager.getTask(id));
            }
        });

        this.overlappingTasks = new Set(initialOverlapping);
        this.processQueue();
    }
}
