import date_utils from './date_utils';

export class AnimationManager {
    constructor(gantt, eventQueueManager) {
        this.gantt = gantt;
        this.eventQueueManager = eventQueueManager;
        this.$animated_highlight = null;
        this.$animated_ball_highlight = null;
        this.scrollAnimationFrame = null;
    }

    initialize() {
        const diff = date_utils.diff(
            this.gantt.config.custom_marker_date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const left =
            (diff / this.gantt.config.step) * this.gantt.config.column_width;
        this.playAnimatedHighlight(left, this.gantt.config.custom_marker_date);
    }

    playAnimatedHighlight(left, dateObj) {
        let adjustedLeft = left;
        let adjustedDateObj = dateObj;
        if (!dateObj || isNaN(left) || left === 0) {
            adjustedDateObj =
                this.gantt.config.custom_marker_date ||
                new Date(this.gantt.gantt_start);
            adjustedLeft =
                (date_utils.diff(
                    adjustedDateObj,
                    this.gantt.gantt_start,
                    this.gantt.config.unit,
                ) /
                    this.gantt.config.step) *
                this.gantt.config.column_width;
        }

        let gridHeight = this.gantt.grid_height || 1152;
        const gridElement = this.gantt.$svg.querySelector('.grid-background');
        if (gridElement) {
            gridHeight =
                parseFloat(gridElement.getAttribute('height')) || gridHeight;
        } else {
            console.warn(
                'Grid element not found, using default height:',
                gridHeight,
            );
        }

        if (!this.$animated_highlight) {
            this.$animated_highlight = this.gantt.create_el({
                top: this.gantt.config.header_height,
                left: adjustedLeft,
                width: 2,
                height: gridHeight - this.gantt.config.header_height,
                classes: 'animated-highlight',
                append_to: this.gantt.$container,
                style: 'background: var(--g-custom-highlight); z-index: 999;',
            });
        } else {
            this.$animated_highlight.style.left = `${adjustedLeft}px`;
            this.$animated_highlight.style.height = `${
                gridHeight - this.gantt.config.header_height
            }px`;
        }

        if (!this.$animated_ball_highlight) {
            this.$animated_ball_highlight = this.gantt.create_el({
                top: this.gantt.config.header_height - 6,
                left: adjustedLeft - 2,
                width: 6,
                height: 6,
                classes: 'animated-ball-highlight',
                append_to: this.gantt.$header,
                style: 'background: var(--g-custom-highlight); border-radius: 50%; z-index: 1001;',
            });
        } else {
            this.$animated_ball_highlight.style.left = `${adjustedLeft - 2}px`;
        }

        if (this.gantt.options.player_state) {
            let animationDuration =
                (this.gantt.options.player_interval || 1000) / 1000;
            let moveDistance = this.gantt.config.column_width;

            if (
                this.gantt.config.player_end_date &&
                adjustedDateObj >= this.gantt.config.player_end_date
            ) {
                return {
                    left: adjustedLeft,
                    dateObj: adjustedDateObj,
                };
            } else if (
                this.gantt.config.player_end_date &&
                date_utils.add(
                    adjustedDateObj,
                    this.gantt.config.step,
                    this.gantt.config.unit,
                ) > this.gantt.config.player_end_date
            ) {
                const remainingTime = date_utils.diff(
                    this.gantt.config.player_end_date,
                    adjustedDateObj,
                    'millisecond',
                );
                animationDuration =
                    remainingTime /
                    (this.gantt.options.player_interval || 1000);
                const totalUnits = date_utils.diff(
                    this.gantt.config.player_end_date,
                    this.gantt.gantt_start,
                    this.gantt.config.unit,
                );
                const endLeft =
                    (totalUnits / this.gantt.config.step) *
                    this.gantt.config.column_width;
                moveDistance = endLeft - adjustedLeft;
            }

            [this.$animated_highlight, this.$animated_ball_highlight].forEach(
                (el) => {
                    el.style.setProperty(
                        '--animation-duration',
                        `${animationDuration}s`,
                    );
                    el.style.setProperty(
                        '--move-distance',
                        `${moveDistance}px`,
                    );
                    el.style.animation = 'none';
                    el.offsetHeight;
                    el.style.animation = `moveRight ${animationDuration}s linear forwards`;
                    el.style.animationPlayState = 'running';
                },
            );
        } else {
            [this.$animated_highlight, this.$animated_ball_highlight].forEach(
                (el) => {
                    el.style.animation = 'none';
                    el.style.animationPlayState = 'paused';
                },
            );
        }

        return {
            left: adjustedLeft,
            dateObj: adjustedDateObj,
        };
    }

    startAnimation() {
        const diff = date_utils.diff(
            this.gantt.config.custom_marker_date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const left =
            (diff / this.gantt.config.step) * this.gantt.config.column_width;
        this.playAnimatedHighlight(left, this.gantt.config.custom_marker_date);
        this.startScrollAnimation(left);
    }

    stopAnimation() {
        if (this.$animated_highlight) {
            this.$animated_highlight.style.animationPlayState = 'paused';
        }
        if (this.$animated_ball_highlight) {
            this.$animated_ball_highlight.style.animationPlayState = 'paused';
        }
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }
    }

    resetAnimation() {
        this.stopAnimation();
        this.clearElements();
        const diff = date_utils.diff(
            this.gantt.config.custom_marker_date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const left =
            (diff / this.gantt.config.step) * this.gantt.config.column_width;
        this.playAnimatedHighlight(left, this.gantt.config.custom_marker_date);
    }

    clearElements() {
        if (this.$animated_highlight) {
            this.$animated_highlight.remove();
            this.$animated_highlight = null;
        }
        if (this.$animated_ball_highlight) {
            this.$animated_ball_highlight.remove();
            this.$animated_ball_highlight = null;
        }
    }

    startScrollAnimation(startLeft) {
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }

        if (!this.gantt.options.player_state) {
            console.log('start_scroll_animation exited: player_state is false');
            return;
        }

        const animationDuration =
            (this.gantt.options.player_interval || 1000) / 1000;
        const moveDistance = this.gantt.config.column_width;
        const startTime = performance.now();
        const container = this.gantt.$container;
        const viewportWidth = container.clientWidth;
        const maxScroll = container.scrollWidth - viewportWidth;

        const offset = viewportWidth / 6;

        const animateScroll = (currentTime) => {
            if (!this.gantt.options.player_state) {
                console.log('animateScroll exited: player_state is false');
                this.scrollAnimationFrame = null;
                return;
            }

            const elapsed = (currentTime - startTime) / 1000;
            const progress = Math.min(elapsed / animationDuration, 1);
            const currentLeft = startLeft + moveDistance * progress;

            let targetScroll = currentLeft - offset;
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

            container.scrollLeft = targetScroll;

            if (this.gantt.tasks.length) {
                const currentDate = this.gantt.config.custom_marker_date;
                const activeTasks = this.gantt.tasks.filter(
                    (task) =>
                        task._start <= currentDate && currentDate <= task._end,
                );

                let taskY;
                if (activeTasks.length) {
                    const targetTask = activeTasks.reduce(
                        (min, task) => (task._index < min._index ? task : min),
                        activeTasks[0],
                    );

                    const barWrapper = this.gantt.$svg.querySelector(
                        `.bar-wrapper[data-id="${targetTask.id}"]`,
                    );

                    if (barWrapper) {
                        taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
                        if (taskY === 0) {
                            taskY =
                                this.gantt.config.header_height +
                                targetTask._index *
                                    (this.gantt.options.bar_height +
                                        this.gantt.options.padding);
                        }
                    } else {
                        taskY =
                            this.gantt.config.header_height +
                            targetTask._index *
                                (this.gantt.options.bar_height +
                                    this.gantt.options.padding);
                    }

                    if (this.eventQueueManager) {
                        this.eventQueueManager.lastTaskY = taskY;
                    }
                } else if (
                    this.eventQueueManager &&
                    this.eventQueueManager.lastTaskY !== null
                ) {
                    taskY = this.eventQueueManager.lastTaskY;
                } else {
                    const targetTask = this.gantt.tasks.reduce(
                        (earliest, task) =>
                            task._start < earliest._start ? task : earliest,
                        this.gantt.tasks[0],
                    );

                    const barWrapper = this.gantt.$svg.querySelector(
                        `.bar-wrapper[data-id="${targetTask.id}"]`,
                    );

                    if (barWrapper) {
                        taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
                        if (taskY === 0) {
                            taskY =
                                this.gantt.config.header_height +
                                targetTask._index *
                                    (this.gantt.options.bar_height +
                                        this.gantt.options.padding);
                        }
                    } else {
                        taskY =
                            this.gantt.config.header_height +
                            targetTask._index *
                                (this.gantt.options.bar_height +
                                    this.gantt.options.padding);
                    }

                    if (this.eventQueueManager) {
                        this.eventQueueManager.lastTaskY = taskY;
                    }
                }

                const adjustedY = taskY - this.gantt.config.header_height;

                const viewportHeight = container.clientHeight;
                const verticalOffset = this.gantt.options.padding;
                let targetScrollTop = adjustedY - verticalOffset;

                const maxScrollTop = container.scrollHeight - viewportHeight;
                const clampedScrollTop = Math.max(
                    0,
                    Math.min(targetScrollTop, maxScrollTop),
                );

                container.scrollTop = clampedScrollTop;
            }

            const res = this.gantt.get_closest_date_to(
                this.gantt.config.custom_marker_date,
            );
            const isBeyondEnd =
                res && this.gantt.config.player_end_date
                    ? res[0] >= this.gantt.config.player_end_date
                    : false;

            if (progress < 1 && !isBeyondEnd) {
                this.scrollAnimationFrame =
                    requestAnimationFrame(animateScroll);
            } else {
                this.scrollAnimationFrame = null;
                if (isBeyondEnd) {
                    this.eventQueueManager.handle_animation_end();
                }
            }
        };

        this.scrollAnimationFrame = requestAnimationFrame(animateScroll);
    }
}
