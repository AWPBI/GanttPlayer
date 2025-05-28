import date_utils from './date_utils';

export class EventQueueManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.overlapping_tasks = new Set();
        this.lastTaskY = null;
        this.eventQueue = [];
        this.isProcessingQueue = false;
    }

    async processEventQueue(force = false) {
        if (this.isProcessingQueue && !force) return;
        this.isProcessingQueue = true;

        console.log('Processing eventQueue:', this.eventQueue);

        const queue = [...this.eventQueue];
        this.eventQueue = [];

        for (const { event, task } of queue) {
            try {
                console.log(`Executing ${event} for task ${task.id}`);
                await this.gantt.options['on_' + event](task);
            } catch (error) {
                console.error(
                    `Error processing ${event} for task ${task.id}:`,
                    error,
                );
            }
        }

        this.isProcessingQueue = false;
    }

    player_update() {
        if (!this.gantt.options.player_state) {
            console.log('player_update exited: player_state is false');
            return;
        }
        const player_end_date = this.gantt.config.player_end_date
            ? date_utils.parse(this.gantt.config.player_end_date, 'YYYY-MM-DD')
            : null;

        console.log(
            'player_update: custom_marker_date=',
            this.gantt.config.custom_marker_date,
            'player_end_date=',
            player_end_date,
        );

        if (
            player_end_date &&
            this.gantt.config.custom_marker_date >= player_end_date
        ) {
            console.log('player_update: reached player_end_date, stopping');
            this.handle_animation_end();
            return;
        }

        const previous_date = new Date(this.gantt.config.custom_marker_date);
        this.gantt.config.custom_marker_date = date_utils.add(
            this.gantt.config.custom_marker_date,
            this.gantt.config.step,
            this.gantt.config.unit,
        );

        console.log(
            'player_update: advanced to custom_marker_date=',
            this.gantt.config.custom_marker_date,
        );

        const diff_in_units = date_utils.diff(
            this.gantt.config.custom_marker_date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const newLeft =
            (diff_in_units / this.gantt.config.step) *
            this.gantt.config.column_width;

        if (
            this.gantt.$animated_highlight &&
            this.gantt.$animated_ball_highlight
        ) {
            this.gantt.$animated_highlight.style.left = `${newLeft}px`;
            this.gantt.$animated_ball_highlight.style.left = `${newLeft - 2}px`;

            const animationDuration =
                (this.gantt.options.player_interval || 1000) / 1000;
            const moveDistance = this.gantt.config.column_width;

            [
                this.gantt.$animated_highlight,
                this.gantt.$animated_ball_highlight,
            ].forEach((el) => {
                el.style.setProperty(
                    '--animation-duration',
                    `${animationDuration}s`,
                );
                el.style.setProperty('--move-distance', `${moveDistance}px`);
                el.style.animation = `none`;
                el.offsetHeight;
                el.style.animation = `moveRight ${animationDuration}s linear forwards`;
                el.style.animationPlayState = 'running';
            });
        }

        if (this.gantt.options.custom_marker) {
            const current_date = this.gantt.config.custom_marker_date;
            // Check tasks starting or ending within [previous_date, current_date)
            const tasks_in_step = this.gantt.tasks.filter(
                (task) =>
                    (task._start >= previous_date &&
                        task._start < current_date) ||
                    (task._end > previous_date && task._end <= current_date) ||
                    (task._start <= current_date && current_date < task._end),
            );

            tasks_in_step.forEach((task) => {
                if (!this.overlapping_tasks.has(task.id)) {
                    console.log(
                        `player_update: Queuing bar_enter for task ${task.id}`,
                    );
                    this.eventQueue.push({ event: 'bar_enter', task });
                    this.overlapping_tasks.add(task.id);
                }
            });

            const new_overlapping = new Set(
                this.gantt.tasks
                    .filter(
                        (task) =>
                            task._start <= current_date &&
                            current_date < task._end,
                    )
                    .map((task) => task.id),
            );

            const entered_tasks = [...new_overlapping].filter(
                (id) => !this.overlapping_tasks.has(id),
            );
            const exited_tasks = [...this.overlapping_tasks].filter(
                (id) => !new_overlapping.has(id),
            );

            entered_tasks.forEach((id) => {
                const task = this.gantt.get_task(id);
                console.log(`player_update: Queuing bar_enter for task ${id}`);
                this.eventQueue.push({ event: 'bar_enter', task });
            });

            exited_tasks.forEach((id) => {
                const task = this.gantt.get_task(id);
                console.log(`player_update: Queuing bar_exit for task ${id}`);
                this.eventQueue.push({ event: 'bar_exit', task });
            });

            this.overlapping_tasks = new_overlapping;
            console.log('player_update: eventQueue=', this.eventQueue);
            this.processEventQueue();
        }

        this.gantt.scrollManager.start_scroll_animation(newLeft);
    }

    initializeEventQueue() {
        if (!this.gantt.options.custom_marker) return;

        const current_date = this.gantt.config.custom_marker_date;
        // Find tasks overlapping with the current custom_marker_date
        const initial_overlapping = new Set(
            this.gantt.tasks
                .filter(
                    (task) =>
                        task._start <= current_date && current_date < task._end,
                )
                .map((task) => task.id),
        );

        // Queue bar_enter events for tasks that are already active
        initial_overlapping.forEach((id) => {
            if (!this.overlapping_tasks.has(id)) {
                const task = this.gantt.get_task(id);
                this.eventQueue.push({ event: 'bar_enter', task });
            }
        });

        // Update overlapping_tasks to include initial overlaps
        this.overlapping_tasks = initial_overlapping;

        // Process the queue
        this.processEventQueue();
    }

    async handle_animation_end() {
        try {
            // Wait for the event queue to be fully processed
            await this.processEventQueue();

            if (this.gantt.player_interval) {
                clearInterval(this.gantt.player_interval);
                this.gantt.player_interval = null;
            }
            if (this.gantt.scrollAnimationFrame) {
                cancelAnimationFrame(this.gantt.scrollAnimationFrame);
                this.gantt.scrollAnimationFrame = null;
            }

            if (this.gantt.options.player_loop) {
                this.gantt.config.custom_marker_date = new Date(
                    this.gantt.options.custom_marker_init_date,
                );
                this.overlapping_tasks.clear();
                this.lastTaskY = null;
                this.eventQueue = [];
                this.gantt.render();
                this.gantt.reset_play();
                this.gantt.toggle_play();
            } else {
                this.gantt.options.player_state = false;
                this.overlapping_tasks.clear();
                this.lastTaskY = null;
                this.eventQueue = [];

                if (this.gantt.$player_button) {
                    if (this.gantt.options.player_use_fa) {
                        this.gantt.$player_button.classList.remove('fa-pause');
                        this.gantt.$player_button.classList.add('fa-play');
                        this.gantt.$player_button.onclick = () => {
                            this.gantt.reset_play();
                            this.gantt.toggle_play();
                        };
                    } else {
                        this.gantt.$player_button.textContent = 'Play';
                        this.gantt.$player_button.onclick = () => {
                            this.gantt.reset_play();
                            this.gantt.toggle_play();
                        };
                    }
                }

                if (this.gantt.$animated_highlight) {
                    this.gantt.$animated_highlight.style.animation = 'none';
                    this.gantt.$animated_highlight.style.animationPlayState =
                        'paused';
                }
                if (this.gantt.$animated_ball_highlight) {
                    this.gantt.$animated_ball_highlight.style.animation =
                        'none';
                    this.gantt.$animated_ball_highlight.style.animationPlayState =
                        'paused';
                }

                this.gantt.trigger_event('finish', []);
            }
        } catch (error) {
            console.error('Error in handle_animation_end:', error);
        }
    }
}
