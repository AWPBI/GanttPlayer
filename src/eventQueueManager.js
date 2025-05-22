import date_utils from './date_utils';

export class EventQueueManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.eventQueue = [];
        this.overlapping_tasks = new Set();
        this.lastTaskY = null;
    }

    initializeEventQueue() {
        this.eventQueue = [];
        this.overlapping_tasks.clear();
        this.lastTaskY = null;

        const tasks = this.gantt.tasks;
        for (let task of tasks) {
            this.eventQueue.push({
                date: task._start,
                task: task,
                type: 'start',
            });
            this.eventQueue.push({
                date: task._end,
                task: task,
                type: 'end',
            });
        }

        this.eventQueue.sort((a, b) => a.date - b.date);
    }

    player_update() {
        if (!this.gantt.options.player_state) return;

        let current_date = new Date(this.gantt.config.custom_marker_date);
        current_date = date_utils.add(
            current_date,
            this.gantt.config.step,
            this.gantt.config.unit,
        );

        this.gantt.config.custom_marker_date = current_date;

        const diff = date_utils.diff(
            current_date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const left =
            (diff / this.gantt.config.step) * this.gantt.config.column_width;

        this.gantt.animationManager.playAnimatedHighlight(left, current_date);
        this.gantt.animationManager.startScrollAnimation(left);

        this.processEventQueue();
    }

    processEventQueue(play = false) {
        if (!this.eventQueue.length) return;

        const current_date = this.gantt.config.custom_marker_date;

        while (
            this.eventQueue.length &&
            this.eventQueue[0].date <= current_date
        ) {
            const event = this.eventQueue.shift();
            const bar = this.gantt.get_bar(event.task.id);

            if (event.type === 'start') {
                bar.$bar.classList.add('active-task');
                this.overlapping_tasks.add(event.task.id);
            } else if (event.type === 'end') {
                bar.$bar.classList.remove('active-task');
                this.overlapping_tasks.delete(event.task.id);
            }
        }

        if (play && this.gantt.options.player_state) {
            this.gantt.scroll_to_latest_task();
        }
    }

    handle_animation_end() {
        this.gantt.options.player_state = false;
        this.gantt.animationManager.stopAnimation();
        clearInterval(this.gantt.player_interval);
        this.gantt.player_interval = null;

        if (this.gantt.options.player_use_fa) {
            this.gantt.$player_button.classList.remove('fa-pause');
            this.gantt.$player_button.classList.add('fa-play');
        } else {
            this.gantt.$player_button.textContent = 'Play';
        }

        this.gantt.trigger_event('end', []);
    }
}
