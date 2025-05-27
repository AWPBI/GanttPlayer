import date_utils from './date_utils';
import { $ } from './svg_utils';
import { sanitize } from './utils';

export default class ScrollManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.x_on_scroll_start = 0;
        this.upperTexts = [];
        this.lowerTexts = []; // Add lower texts
    }

    setUpperTexts(upperTexts) {
        this.upperTexts = upperTexts;
    }

    setLowerTexts(lowerTexts) {
        this.lowerTexts = lowerTexts; // Store lower texts
    }

    bind_scroll_events() {
        let extended = false;
        if (this.gantt.options.infinite_padding) {
            $.on(this.gantt.$container, 'wheel', (e) => {
                let trigger = this.gantt.$container.scrollWidth / 2;
                if (!extended && e.currentTarget.scrollLeft <= trigger) {
                    let old_scroll_left = e.currentTarget.scrollLeft;
                    extended = true;
                    this.gantt.gantt_start = date_utils.add(
                        this.gantt.gantt_start,
                        -this.gantt.config.extend_by_units,
                        this.gantt.config.unit,
                    );
                    this.gantt.setup_date_values();
                    this.gantt.render();
                    e.currentTarget.scrollLeft =
                        old_scroll_left +
                        this.gantt.config.column_width *
                            this.gantt.config.extend_by_units;
                    setTimeout(() => (extended = false), 300);
                }
                if (
                    !extended &&
                    e.currentTarget.scrollWidth -
                        (e.currentTarget.scrollLeft +
                            e.currentTarget.clientWidth) <=
                        trigger
                ) {
                    let old_scroll_left = e.currentTarget.scrollLeft;
                    extended = true;
                    this.gantt.gantt_end = date_utils.add(
                        this.gantt.gantt_end,
                        this.gantt.config.extend_by_units,
                        this.gantt.config.unit,
                    );
                    this.gantt.setup_date_values();
                    this.gantt.render();
                    e.currentTarget.scrollLeft = old_scroll_left;
                    setTimeout(() => (extended = false), 300);
                }
            });
        }

        $.on(this.gantt.$container, 'scroll', (e) => {
            const scrollLeft = e.currentTarget.scrollLeft;
            const ids = this.gantt.bars.map(({ group }) =>
                group.getAttribute('data-id'),
            );
            let dx;
            if (this.x_on_scroll_start) {
                dx = scrollLeft - this.x_on_scroll_start;
            }

            // Update positions of upper-text and lower-text elements
            this.upperTexts.forEach((text) => {
                const initialLeft = parseFloat(
                    text.dataset.initialLeft || text.style.left || 0,
                );
                text.style.left = `${initialLeft - scrollLeft}px`;
                text.dataset.initialLeft = initialLeft; // Ensure initialLeft is preserved
            });
            this.lowerTexts.forEach((text) => {
                const initialLeft = parseFloat(
                    text.dataset.initialLeft || text.style.left || 0,
                );
                text.style.left = `${initialLeft - scrollLeft}px`;
                text.dataset.initialLeft = initialLeft; // Ensure initialLeft is preserved
            });

            this.gantt.current_date = date_utils.add(
                this.gantt.gantt_start,
                (scrollLeft / this.gantt.config.column_width) *
                    this.gantt.config.step,
                this.gantt.config.unit,
            );

            let current_upper = this.gantt.config.view_mode.upper_text(
                this.gantt.current_date,
                null,
                this.gantt.options.language,
            );
            let $el = this.upperTexts.find(
                (el) => el.textContent === current_upper,
            );

            this.gantt.current_date = date_utils.add(
                this.gantt.gantt_start,
                ((scrollLeft + ($el ? $el.clientWidth : 0)) /
                    this.gantt.config.column_width) *
                    this.gantt.config.step,
                this.gantt.config.unit,
            );
            current_upper = this.gantt.config.view_mode.upper_text(
                this.gantt.current_date,
                null,
                this.gantt.options.language,
            );
            $el = this.upperTexts.find(
                (el) => el.textContent === current_upper,
            );

            if ($el !== this.gantt.$current) {
                if (this.gantt.$current) {
                    this.gantt.$current.classList.remove('current-upper');
                }
                if ($el) {
                    $el.classList.add('current-upper');
                    this.gantt.$current = $el;
                }
            }

            this.x_on_scroll_start = scrollLeft;
            let [min_start, max_start, max_end] =
                this.gantt.get_start_end_positions();

            if (scrollLeft > max_end + 100) {
                this.gantt.$adjust.innerHTML = '←';
                this.gantt.$adjust.classList.remove('hide');
                this.gantt.$adjust.onclick = () => {
                    this.gantt.$container.scrollTo({
                        left: max_start,
                        behavior: 'smooth',
                    });
                };
            } else if (
                scrollLeft + e.currentTarget.offsetWidth <
                min_start - 100
            ) {
                this.gantt.$adjust.innerHTML = '→';
                this.gantt.$adjust.classList.remove('hide');
                this.gantt.$adjust.onclick = () => {
                    this.gantt.$container.scrollTo({
                        left: min_start,
                        behavior: 'smooth',
                    });
                };
            } else {
                this.gantt.$adjust.classList.add('hide');
            }

            if (dx && this.gantt.options.auto_move_label) {
                const localBars = ids.map((id) => this.gantt.get_bar(id));
                localBars.forEach((bar) => {
                    bar.update_label_position_on_horizontal_scroll({
                        x: dx,
                        sx: scrollLeft,
                    });
                });
            }
        });
    }

    // Rest of the methods remain unchanged
    set_scroll_position(date) {
        if (
            this.gantt.options.infinite_padding &&
            (!date || date === 'start')
        ) {
            let [min_start] = this.gantt.get_start_end_positions();
            this.gantt.$container.scrollLeft = min_start;
            return;
        }
        if (!date || date === 'start') {
            date = this.gantt.gantt_start;
        } else if (date === 'end') {
            date = this.gantt.gantt_end;
        } else if (date === 'today') {
            return this.scroll_current();
        } else if (date === 'custom') {
            return this.scroll_custom_marker();
        } else if (typeof date === 'string') {
            date = date_utils.parse(date);
        }

        const units_since_first_task = date_utils.diff(
            date,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );
        const scroll_pos =
            (units_since_first_task / this.gantt.config.step) *
            this.gantt.config.column_width;

        this.gantt.$container.scrollTo({
            left: scroll_pos - this.gantt.config.column_width / 6,
            behavior: 'smooth',
        });

        if (this.gantt.$current) {
            this.gantt.$current.classList.remove('current-upper');
        }

        this.gantt.current_date = date_utils.add(
            this.gantt.gantt_start,
            this.gantt.$container.scrollLeft / this.gantt.config.column_width,
            this.gantt.config.unit,
        );

        let current_upper = this.gantt.config.view_mode.upper_text(
            this.gantt.current_date,
            null,
            this.gantt.options.language,
        );
        let $el = this.upperTexts.find(
            (el) => el.textContent === current_upper,
        );

        this.gantt.current_date = date_utils.add(
            this.gantt.gantt_start,
            (this.gantt.$container.scrollLeft + ($el ? $el.clientWidth : 0)) /
                this.gantt.config.column_width,
            this.gantt.config.unit,
        );
        current_upper = this.gantt.config.view_mode.upper_text(
            this.gantt.current_date,
            null,
            this.gantt.options.language,
        );
        $el = this.upperTexts.find((el) => el.textContent === current_upper);
        if ($el) {
            $el.classList.add('current-upper');
            this.gantt.$current = $el;
        }
    }

    scroll_current() {
        let res = this.get_closest_date();
        if (res) this.set_scroll_position(res[0]);
    }

    scroll_custom_marker() {
        const res = this.get_closest_date_to(
            this.gantt.config.custom_marker_date,
        );
        if (!res) return;

        if (
            this.gantt.config.player_end_date &&
            res[0] >= this.gantt.config.player_end_date
        ) {
            this.gantt.eventQueueManager.handle_animation_end();
        }
    }

    scroll_to_latest_task() {
        if (!this.gantt.tasks.length) return;

        const currentDate =
            this.gantt.config.custom_marker_date || this.gantt.gantt_start;
        const activeTasks = this.gantt.tasks.filter(
            (task) => task._start <= currentDate && currentDate <= task._end,
        );

        const targetTask = activeTasks.length
            ? activeTasks.reduce(
                  (min, task) => (task._index < min._index ? task : min),
                  activeTasks[0],
              )
            : this.gantt.tasks.reduce(
                  (earliest, task) =>
                      task._start < earliest._start ? task : earliest,
                  this.gantt.tasks[0],
              );

        const barWrapper = this.gantt.$svg.querySelector(
            `.bar-wrapper[data-id="${targetTask.id}"]`,
        );

        let taskY;
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

        if (this.gantt.eventQueueManager) {
            this.gantt.eventQueueManager.lastTaskY = taskY;
        }

        const adjustedY = taskY - this.gantt.config.header_height;
        const viewportHeight = this.gantt.$container.clientHeight;
        const offset = this.gantt.options.padding;
        let targetScrollTop = adjustedY - offset;

        const maxScrollTop =
            this.gantt.$container.scrollHeight - viewportHeight;
        const clampedScrollTop = Math.max(
            0,
            Math.min(targetScrollTop, maxScrollTop),
        );

        this.gantt.$container.scrollTo({
            top: clampedScrollTop,
            behavior: 'smooth',
        });
    }

    start_scroll_animation(startLeft) {
        if (this.gantt.scrollAnimationFrame) {
            cancelAnimationFrame(this.gantt.scrollAnimationFrame);
            this.gantt.scrollAnimationFrame = null;
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
                this.gantt.scrollAnimationFrame = null;
                return;
            }

            const elapsed = (currentTime - startTime) / 1000;
            const progress = Math.min(elapsed / animationDuration, 1);
            const currentLeft = startLeft + moveDistance * progress;

            let targetScroll = currentLeft - offset;
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
            container.scrollLeft = targetScroll;

            // Update text positions during animation
            this.upperTexts.forEach((text) => {
                const initialLeft = parseFloat(
                    text.dataset.initialLeft || text.style.left || 0,
                );
                text.style.left = `${initialLeft - targetScroll}px`;
            });
            this.lowerTexts.forEach((text) => {
                const initialLeft = parseFloat(
                    text.dataset.initialLeft || text.style.left || 0,
                );
                text.style.left = `${initialLeft - targetScroll}px`;
            });

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

                    if (this.gantt.eventQueueManager) {
                        this.gantt.eventQueueManager.lastTaskY = taskY;
                    }
                } else if (
                    this.gantt.eventQueueManager &&
                    this.gantt.eventQueueManager.lastTaskY !== null
                ) {
                    taskY = this.gantt.eventQueueManager.lastTaskY;
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

                    if (this.gantt.eventQueueManager) {
                        this.gantt.eventQueueManager.lastTaskY = taskY;
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

            const res = this.get_closest_date_to(
                this.gantt.config.custom_marker_date,
            );
            const isBeyondEnd =
                res && this.gantt.config.player_end_date
                    ? res[0] >= this.gantt.config.player_end_date
                    : false;

            if (progress < 1 && !isBeyondEnd) {
                this.gantt.scrollAnimationFrame =
                    requestAnimationFrame(animateScroll);
            } else {
                this.gantt.scrollAnimationFrame = null;
                if (isBeyondEnd) {
                    this.gantt.eventQueueManager.handle_animation_end();
                }
            }
        };

        this.gantt.scrollAnimationFrame = requestAnimationFrame(animateScroll);
    }

    get_closest_date_to(date) {
        let newDate = date;
        if (newDate < this.gantt.gantt_start || newDate > this.gantt.gantt_end)
            return null;

        let current = date;
        let el = this.gantt.$container.querySelector(
            '.date_' +
                sanitize(
                    date_utils.format(
                        current,
                        this.gantt.config.date_format,
                        this.gantt.options.language,
                    ),
                ),
        );

        let c = 0;
        while (!el && c < this.gantt.config.step) {
            current = date_utils.add(current, -1, this.gantt.config.unit);
            el = this.gantt.$container.querySelector(
                '.date_' +
                    sanitize(
                        date_utils.format(
                            current,
                            this.gantt.config.date_format,
                            this.gantt.options.language,
                        ),
                    ),
            );
            c++;
        }
        return [
            new Date(
                date_utils.format(
                    current,
                    this.gantt.config.date_format,
                    this.gantt.options.language,
                ),
            ),
            el,
        ];
    }

    get_closest_date() {
        let now = new Date();
        if (now < this.gantt.gantt_start || now > this.gantt.gantt_end)
            return null;

        let current = new Date();
        let el = this.gantt.$container.querySelector(
            '.date_' +
                sanitize(
                    date_utils.format(
                        current,
                        this.gantt.config.date_format,
                        this.gantt.options.language,
                    ),
                ),
        );

        let c = 0;
        while (!el && c < this.gantt.config.step) {
            current = date_utils.add(current, -1, this.gantt.config.unit);
            el = this.gantt.$container.querySelector(
                '.date_' +
                    sanitize(
                        date_utils.format(
                            current,
                            this.gantt.config.date_format,
                            this.gantt.options.language,
                        ),
                    ),
            );
            c++;
        }
        return [
            new Date(
                date_utils.format(
                    current,
                    this.gantt.config.date_format,
                    this.gantt.options.language,
                ),
            ),
            el,
        ];
    }
}
