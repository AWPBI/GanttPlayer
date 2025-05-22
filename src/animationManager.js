export default class AnimationManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.$animatedHighlight = null;
        this.$animatedBallHighlight = null;
        this.scrollAnimationFrame = null;
        this.playerInterval = null;
    }

    initialize() {
        if (!this.gantt.options.custom_marker) return;
        const { config, gantt_start } = this.gantt;
        config.custom_marker_date = new Date(
            config.custom_marker_date || gantt_start,
        );
        this.playAnimatedHighlight();
    }

    playAnimatedHighlight() {
        const { gantt } = this;
        const { config, options, $container, $header, grid_height } = gantt;
        const left =
            (date_utils.diff(
                config.custom_marker_date,
                gantt.gantt_start,
                config.unit,
            ) /
                config.step) *
            config.column_width;

        if (!this.$animatedHighlight) {
            this.$animatedHighlight = gantt.createElement({
                top: config.header_height,
                left,
                width: 2,
                height: grid_height - config.header_height,
                classes: 'animated-highlight',
                append_to: $container,
                style: 'background: var(--g-custom-highlight); z-index: 999;',
            });
            this.$animatedBallHighlight = gantt.createElement({
                top: config.header_height - 6,
                left: left - 2,
                width: 6,
                height: 6,
                classes: 'animated-ball-highlight',
                append_to: $header,
                style: 'background: var(--g-custom-highlight); border-radius: 50%; z-index: 1001;',
            });
        } else {
            this.$animatedHighlight.style.left = `${left}px`;
            this.$animatedBallHighlight.style.left = `${left - 2}px`;
        }

        if (options.player_state) {
            const animationDuration = (options.player_interval || 1000) / 1000;
            const moveDistance = config.column_width;
            [this.$animatedHighlight, this.$animatedBallHighlight].forEach(
                (el) => {
                    el.style.setProperty(
                        '--animation-duration',
                        `${animationDuration}s`,
                    );
                    el.style.setProperty(
                        '--move-distance',
                        `${moveDistance}px`,
                    );
                    el.style.animation = `none`;
                    el.offsetHeight; // Trigger reflow
                    el.style.animation = `moveRight ${animationDuration}s linear forwards`;
                    el.style.animationPlayState = 'running';
                },
            );
        }
    }

    playerUpdate() {
        const { gantt } = this;
        const { config, options, eventQueueManager } = gantt;

        if (!options.player_state) return;

        const playerEndDate = config.player_end_date
            ? date_utils.parse(config.player_end_date, 'YYYY-MM-DD')
            : null;
        if (playerEndDate && config.custom_marker_date >= playerEndDate) {
            this.stop();
            return;
        }

        const previousDate = new Date(config.custom_marker_date);
        config.custom_marker_date = date_utils.add(
            config.custom_marker_date,
            config.step,
            config.unit,
        );
        const newLeft =
            (date_utils.diff(
                config.custom_marker_date,
                gantt.gantt_start,
                config.unit,
            ) /
                config.step) *
            config.column_width;

        this.playAnimatedHighlight();
        this.startScrollAnimation(newLeft);

        if (options.custom_marker) {
            const tasksInStep = gantt.taskManager.tasks.filter(
                (task) =>
                    (task._start >= previousDate &&
                        task._start < config.custom_marker_date) ||
                    (task._end > previousDate &&
                        task._end <= config.custom_marker_date) ||
                    (task._start <= config.custom_marker_date &&
                        config.custom_marker_date < task._end),
            );

            tasksInStep.forEach((task) => {
                if (!eventQueueManager.overlappingTasks.has(task.id)) {
                    eventQueueManager.addEvent('bar_enter', task);
                }
            });

            const newOverlapping = new Set(
                gantt.taskManager.tasks
                    .filter(
                        (task) =>
                            task._start <= config.custom_marker_date &&
                            config.custom_marker_date < task._end,
                    )
                    .map((task) => task.id),
            );

            const enteredTasks = [...newOverlapping].filter(
                (id) => !eventQueueManager.overlappingTasks.has(id),
            );
            const exitedTasks = [...eventQueueManager.overlappingTasks].filter(
                (id) => !newOverlapping.has(id),
            );

            enteredTasks.forEach((id) =>
                eventQueueManager.addEvent(
                    'bar_enter',
                    gantt.taskManager.getTask(id),
                ),
            );
            exitedTasks.forEach((id) =>
                eventQueueManager.addEvent(
                    'bar_exit',
                    gantt.taskManager.getTask(id),
                ),
            );

            eventQueueManager.overlappingTasks = newOverlapping;
        }
    }

    startScrollAnimation(startLeft) {
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
        }

        if (!this.gantt.options.player_state) return;

        const animationDuration =
            (this.gantt.options.player_interval || 1000) / 1000;
        const startTime = performance.now();
        const container = this.gantt.$container;
        const viewportWidth = container.clientWidth;
        const maxScroll = container.scrollWidth - viewportWidth;
        const offset = viewportWidth / 6;

        const animateScroll = (currentTime) => {
            if (!this.gantt.options.player_state) return;

            const progress = Math.min(
                (currentTime - startTime) / 1000 / animationDuration,
                1,
            );
            const currentLeft =
                startLeft + this.gantt.config.column_width * progress;
            container.scrollLeft = Math.max(
                0,
                Math.min(currentLeft - offset, maxScroll),
            );

            if (progress < 1) {
                this.scrollAnimationFrame =
                    requestAnimationFrame(animateScroll);
            } else {
                this.scrollAnimationFrame = null;
                if (
                    this.gantt.config.player_end_date &&
                    this.gantt.config.custom_marker_date >=
                        this.gantt.config.player_end_date
                ) {
                    this.stop();
                }
            }
        };

        this.scrollAnimationFrame = requestAnimationFrame(animateScroll);
    }

    stop() {
        const { gantt } = this;
        clearInterval(this.playerInterval);
        this.playerInterval = null;
        this.stopAnimations();
        gantt.options.player_state = false;
        gantt.eventQueueManager.overlappingTasks.clear();
        gantt.eventQueueManager.eventQueue = [];

        if (gantt.$playerButton) {
            if (gantt.options.player_use_fa) {
                gantt.$playerButton.classList.remove('fa-pause');
                gantt.$playerButton.classList.add('fa-play');
            } else {
                gantt.$playerButton.textContent = 'Play';
            }
        }

        gantt.triggerEvent('finish', []);
    }

    stopAnimations() {
        if (this.$animatedHighlight) {
            this.$animatedHighlight.style.animationPlayState = 'paused';
        }
        if (this.$animatedBallHighlight) {
            this.$animatedBallHighlight.style.animationPlayState = 'paused';
        }
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }
    }

    togglePlay() {
        const { gantt } = this;
        gantt.options.player_state = !gantt.options.player_state;

        if (gantt.options.player_state) {
            gantt.eventQueueManager.initialize();
            this.playerInterval = setInterval(
                () => this.playerUpdate(),
                gantt.options.player_interval || 1000,
            );
            gantt.triggerEvent('start', []);

            if (gantt.$playerButton) {
                if (gantt.options.player_use_fa) {
                    gantt.$playerButton.classList.remove('fa-play');
                    gantt.$playerButton.classList.add('fa-pause');
                } else {
                    gantt.$playerButton.textContent = 'Pause';
                }
            }
            this.playAnimatedHighlight();
        } else {
            this.stop();
        }
    }

    reset() {
        const { gantt } = this;
        gantt.config.custom_marker_date = new Date(
            gantt.options.custom_marker_init_date || gantt.gantt_start,
        );
        this.stop();
        gantt.render();
        this.playAnimatedHighlight();
        gantt.triggerEvent('reset', []);
    }
}
