import date_utils from './date_utils';
import { $, createSVG } from './svg_utils';
import { EventQueueManager } from './eventQueueManager';
import Popup from './popup';
import { DEFAULT_OPTIONS, DEFAULT_VIEW_MODES } from './defaults';
import './styles/gantt.css';
import GanttRenderer from './ganttRenderer';
import EventHandler from './eventHandler';
import TaskManager from './taskManager';
import {
    generate_id,
    sanitize,
    create_el,
    isViewMode,
    getOldestStartingDate,
} from './utils';

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.setup_wrapper(wrapper);
        this.setup_options(options);
        this.eventQueueManager = new EventQueueManager(this);
        this.eventHandler = new EventHandler(this);
        this.taskManager = new TaskManager(this);
        this.setup_tasks(tasks);
        this.renderer = new GanttRenderer(this);
        this.change_view_mode();
        this.eventHandler.bind_events();
        this.scrollAnimationFrame = null;
    }

    setup_wrapper(element) {
        let svg_element, wrapper_element;

        if (typeof element === 'string') {
            let el = document.querySelector(element);
            if (!el) {
                throw new ReferenceError(
                    `CSS selector "${element}" could not be found in DOM`,
                );
            }
            element = el;
        }

        if (element instanceof HTMLElement) {
            wrapper_element = element;
            svg_element = element.querySelector('svg');
        } else if (element instanceof SVGElement) {
            svg_element = element;
        } else {
            throw new TypeError(
                'Frappe Gantt only supports usage of a string CSS selector,' +
                    " HTML DOM element or SVG DOM element for the 'element' parameter",
            );
        }

        if (!svg_element) {
            this.$svg = createSVG('svg', {
                append_to: wrapper_element,
                class: 'gantt',
            });
        } else {
            this.$svg = svg_element;
            this.$svg.classList.add('gantt');
        }

        this.$container = create_el({
            classes: 'gantt-container',
            append_to: this.$svg.parentElement,
        });

        this.$container.appendChild(this.$svg);
        this.$popup_wrapper = create_el({
            classes: 'popup-wrapper',
            append_to: this.$container,
        });
    }

    setup_options(options) {
        this.original_options = options;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        const CSS_VARIABLES = {
            'grid-height': 'container_height',
            'bar-height': 'bar_height',
            'lower-header-height': 'lower_header_height',
            'upper-header-height': 'upper_header_height',
        };
        for (let name in CSS_VARIABLES) {
            let setting = this.options[CSS_VARIABLES[name]];
            if (setting !== 'auto') {
                this.$container.style.setProperty(
                    '--gv-' + name,
                    setting + 'px',
                );
            }
        }

        this.config = {
            ignored_dates: [],
            ignored_positions: [],
            extend_by_units: 10,
        };

        if (this.options.player_button) {
            this.options.player_state = false;
        }
        if (this.options.custom_marker) {
            this.config.custom_marker_date = new Date(
                this.options.custom_marker_init_date,
            );
        }
        if (this.options.player_end_date) {
            this.config.player_end_date = new Date(
                this.options.player_end_date,
            );
        }
        if (typeof this.options.ignore !== 'function') {
            if (typeof this.options.ignore === 'string') {
                this.options.ignore = [this.options.ignore];
            }
            for (let option of this.options.ignore) {
                if (typeof option === 'function') {
                    this.config.ignored_function = option;
                    continue;
                }
                if (typeof option === 'string') {
                    if (option === 'weekend') {
                        this.config.ignored_function = (d) =>
                            d.getDay() === 6 || d.getDay() === 0;
                    } else {
                        this.config.ignored_dates.push(new Date(option));
                    }
                }
            }
        } else {
            this.config.ignored_function = this.options.ignore;
        }
    }

    update_options(options) {
        this.setup_options({ ...this.original_options, ...options });
        this.change_view_mode(undefined, true);
        clearInterval(this.player_interval);
    }

    setup_tasks(tasks) {
        this.tasks = tasks
            .map((task, i) => {
                if (!task.start) {
                    console.error(
                        `task "${task.id}" doesn't have a start date`,
                    );
                    return false;
                }

                task._start = date_utils.parse(task.start);
                if (task.end === undefined && task.duration !== undefined) {
                    task.end = task._start;
                    let durations = task.duration.split(' ');

                    durations.forEach((tmpDuration) => {
                        let { duration, scale } =
                            date_utils.parse_duration(tmpDuration);
                        task.end = date_utils.add(task.end, duration, scale);
                    });
                }
                if (!task.end) {
                    console.error(`task "${task.id}" doesn't have an end date`);
                    return false;
                }
                task._end = date_utils.parse(task.end);

                let diff = date_utils.diff(task._end, task._start, 'year');
                if (diff < 0) {
                    console.error(
                        `start of task can't be after end of task: in task "${task.id}"`,
                    );
                    return false;
                }

                if (date_utils.diff(task._end, task._start, 'year') > 10) {
                    console.error(
                        `the duration of task "${task.id}" is too long (above ten years)`,
                    );
                    return false;
                }

                task._index = i;

                const task_end_values = date_utils.get_date_values(task._end);
                if (task_end_values.slice(3).every((d) => d === 0)) {
                    task._end = date_utils.add(task._end, 24, 'hour');
                }

                if (
                    typeof task.dependencies === 'string' ||
                    !task.dependencies
                ) {
                    let deps = [];
                    if (task.dependencies) {
                        deps = task.dependencies
                            .split(',')
                            .map((d) => d.trim().replaceAll(' ', '_'))
                            .filter((d) => d);
                    }
                    task.dependencies = deps;
                }

                if (!task.id) {
                    task.id = generate_id(task);
                } else if (typeof task.id === 'string') {
                    task.id = task.id.replaceAll(' ', '_');
                } else {
                    task.id = `${task.id}`;
                }

                return task;
            })
            .filter((t) => t);
        this.taskManager.setup_dependencies();
        this.scroll_to_latest_task();
    }

    refresh(tasks) {
        this.setup_tasks(tasks);
        this.change_view_mode();
        this.scroll_to_latest_task();
    }

    update_task(id, new_details) {
        let task = this.tasks.find((t) => t.id === id);
        let bar = this.bars.find((bar) => bar.task.id === id);
        Object.assign(task, new_details);
        bar.refresh();
        this.taskManager.setup_dependencies();
    }

    change_view_mode(mode = this.options.view_mode, maintain_pos = false) {
        if (typeof mode === 'string') {
            mode = this.options.view_modes.find((d) => d.name === mode);
        }
        let old_pos, old_scroll_op;
        if (maintain_pos) {
            old_pos = this.$container.scrollLeft;
            old_scroll_op = this.options.scroll_to;
            this.options.scroll_to = null;
        }
        this.options.view_mode = mode.name;
        this.config.view_mode = mode;
        this.update_view_scale(mode);
        this.setup_dates(maintain_pos);
        this.render();
        if (maintain_pos) {
            this.$container.scrollLeft = old_pos;
            this.options.scroll_to = old_scroll_op;
        }
        this.trigger_event('view_change', [mode]);
    }

    update_view_scale(mode) {
        let { duration, scale } = date_utils.parse_duration(mode.step);
        this.config.step = duration;
        this.config.unit = scale;
        this.config.column_width =
            this.options.column_width || mode.column_width || 45;
        this.$container.style.setProperty(
            '--gv-column-width',
            this.config.column_width + 'px',
        );
        this.config.header_height =
            this.options.lower_header_height +
            this.options.upper_header_height +
            10;
    }

    setup_dates(refresh = false) {
        this.setup_gantt_dates(refresh);
        this.setup_date_values();
    }

    setup_gantt_dates(refresh) {
        let gantt_start, gantt_end;
        if (!this.tasks.length) {
            gantt_start = new Date();
            gantt_end = new Date();
        } else {
            gantt_start = this.tasks[0]._start;
            gantt_end = this.tasks[0]._end;
            for (let task of this.tasks) {
                if (task._start < gantt_start) {
                    gantt_start = task._start;
                }
                if (task._end > gantt_end) {
                    gantt_end = task._end;
                }
            }
        }

        gantt_start = date_utils.start_of(gantt_start, this.config.unit);
        gantt_end = date_utils.start_of(gantt_end, this.config.unit);

        if (!refresh) {
            if (!this.options.infinite_padding) {
                if (typeof this.config.view_mode.padding === 'string') {
                    this.config.view_mode.padding = [
                        this.config.view_mode.padding,
                        this.config.view_mode.padding,
                    ];
                }

                let [padding_start, padding_end] =
                    this.config.view_mode.padding.map(
                        date_utils.parse_duration,
                    );
                this.gantt_start = date_utils.add(
                    gantt_start,
                    -padding_start.duration,
                    padding_start.scale,
                );
                this.gantt_end = date_utils.add(
                    gantt_end,
                    padding_end.duration,
                    padding_end.scale,
                );
            } else {
                this.gantt_start = date_utils.add(
                    gantt_start,
                    -this.config.extend_by_units * 3,
                    this.config.unit,
                );
                this.gantt_end = date_utils.add(
                    gantt_end,
                    this.config.extend_by_units * 3,
                    this.config.unit,
                );
            }
        }
        this.config.date_format =
            this.config.view_mode.date_format || this.options.date_format;
        this.gantt_start.setHours(0, 0, 0, 0);
    }

    setup_date_values() {
        let cur_date = new Date(this.gantt_start);
        this.dates = [cur_date];

        while (cur_date < this.gantt_end) {
            cur_date = date_utils.add(
                cur_date,
                this.config.step,
                this.config.unit,
            );
            this.dates.push(new Date(cur_date));
        }
    }

    render() {
        try {
            if (!this.gantt_start || !this.gantt_end) {
                console.error('Invalid gantt_start or gantt_end', {
                    gantt_start: this.gantt_start,
                    gantt_end: this.gantt_end,
                });
                return;
            }
            if (!this.config.custom_marker_date) {
                this.config.custom_marker_date = new Date(
                    this.options.custom_marker_init_date || this.gantt_start,
                );
            }
            if (
                this.config.custom_marker_date < this.gantt_start ||
                this.config.custom_marker_date > this.gantt_end
            ) {
                this.config.custom_marker_date = new Date(this.gantt_start);
            }

            this.clear();
            this.renderer.setup_layers();
            this.renderer.make_grid();
            this.renderer.make_dates();
            this.renderer.make_grid_extras();
            this.renderer.make_bars();
            this.renderer.make_arrows();
            this.map_arrows_on_bars();
            this.renderer.set_dimensions();
            this.set_scroll_position(this.options.scroll_to);
        } catch (error) {
            console.error('Error during render:', error);
        }
    }

    highlight_custom(date) {
        console.warn(
            'highlight_custom is deprecated; using animated-highlight instead',
        );
        return this.play_animated_highlight(0, date);
    }

    play_animated_highlight(left, dateObj) {
        const { left: adjustedLeft, dateObj: adjustedDateObj } =
            this.renderer.render_animated_highlight(left, dateObj);

        if (this.options.player_state) {
            let animationDuration =
                (this.options.player_interval || 1000) / 1000;
            let moveDistance = this.config.column_width;

            if (
                this.config.player_end_date &&
                adjustedDateObj >= this.config.player_end_date
            ) {
                return {
                    left: adjustedLeft,
                    dateObj: adjustedDateObj,
                };
            } else if (
                this.config.player_end_date &&
                date_utils.add(
                    adjustedDateObj,
                    this.config.step,
                    this.config.unit,
                ) > this.config.player_end_date
            ) {
                const remainingTime = date_utils.diff(
                    this.config.player_end_date,
                    adjustedDateObj,
                    'millisecond',
                );
                animationDuration =
                    remainingTime / (this.options.player_interval || 1000);
                const totalUnits = date_utils.diff(
                    this.config.player_end_date,
                    this.gantt_start,
                    this.config.unit,
                );
                const endLeft =
                    (totalUnits / this.config.step) * this.config.column_width;
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

    toggle_play() {
        if (!this.config.custom_marker_date) {
            this.config.custom_marker_date =
                this.options.custom_marker_init_date || new Date();
        }
        console.log(
            'toggle_play: custom_marker_date=',
            this.config.custom_marker_date,
        );

        this.options.player_state = !this.options.player_state;
        if (this.options.player_state) {
            if (this.options.custom_marker) {
                this.eventQueueManager.initializeEventQueue();
            }

            this.player_interval = setInterval(
                this.eventQueueManager.player_update.bind(
                    this.eventQueueManager,
                ),
                this.options.player_interval || 1000,
            );
            this.trigger_event('start', []);

            if (this.eventQueueManager.eventQueue.length > 0) {
                this.eventQueueManager.processEventQueue(true);
            }

            if (this.options.player_use_fa) {
                this.$player_button.classList.remove('fa-play');
                this.$player_button.classList.add('fa-pause');
            } else {
                this.$player_button.textContent = 'Pause';
            }

            const diff = date_utils.diff(
                this.config.custom_marker_date,
                this.gantt_start,
                this.config.unit,
            );
            const left = (diff / this.config.step) * this.config.column_width;
            this.play_animated_highlight(left, this.config.custom_marker_date);
        } else {
            clearInterval(this.player_interval);
            this.player_interval = null;
            if (this.scrollAnimationFrame) {
                cancelAnimationFrame(this.scrollAnimationFrame);
                this.scrollAnimationFrame = null;
            }
            this.trigger_event('pause', []);

            if (this.options.player_use_fa) {
                this.$player_button.classList.remove('fa-pause');
                this.$player_button.classList.add('fa-play');
            } else {
                this.$player_button.textContent = 'Play';
            }

            if (this.$animated_highlight) {
                this.$animated_highlight.style.animationPlayState = 'paused';
            }
            if (this.$animated_ball_highlight) {
                this.$animated_ball_highlight.style.animationPlayState =
                    'paused';
            }
        }
    }

    reset_play() {
        this.config.custom_marker_date = new Date(
            this.options.custom_marker_init_date || this.gantt_start,
        );
        console.log(
            'reset_play: custom_marker_date=',
            this.config.custom_marker_date,
        );

        this.options.player_state = false;
        this.eventQueueManager.overlapping_tasks.clear();
        this.eventQueueManager.lastTaskY = null;
        this.eventQueueManager.eventQueue = [];
        clearInterval(this.player_interval);
        this.player_interval = null;
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }

        if (this.options.player_use_fa) {
            this.$player_button.classList.remove('fa-pause');
            this.$player_button.classList.add('fa-play');
        } else {
            this.$player_button.textContent = 'Play';
        }

        this.render();
        const diff = date_utils.diff(
            this.config.custom_marker_date,
            this.gantt_start,
            this.config.unit,
        );
        const left = (diff / this.config.step) * this.config.column_width;
        this.play_animated_highlight(left, this.config.custom_marker_date);

        this.trigger_event('reset', []);
    }

    map_arrows_on_bars() {
        for (let bar of this.bars) {
            bar.arrows = this.arrows.filter((arrow) => {
                return (
                    arrow.from_task.task.id === bar.task.id ||
                    arrow.to_task.task.id === bar.task.id
                );
            });
        }
    }

    set_scroll_position(date) {
        if (this.options.infinite_padding && (!date || date === 'start')) {
            let [min_start] = this.get_start_end_positions();
            this.$container.scrollLeft = min_start;
            return;
        }
        if (!date || date === 'start') {
            date = this.gantt_start;
        } else if (date === 'end') {
            date = this.gantt_end;
        } else if (date === 'today') {
            return this.scroll_current();
        } else if (date === 'custom') {
            return this.scroll_custom_marker();
        } else if (typeof date === 'string') {
            date = date_utils.parse(date);
        }

        const units_since_first_task = date_utils.diff(
            date,
            this.gantt_start,
            this.config.unit,
        );
        const scroll_pos =
            (units_since_first_task / this.config.step) *
            this.config.column_width;

        this.$container.scrollTo({
            left: scroll_pos - this.config.column_width / 6,
            behavior: 'smooth',
        });

        if (this.$current) {
            this.$current.classList.remove('current-upper');
        }

        this.current_date = date_utils.add(
            this.gantt_start,
            this.$container.scrollLeft / this.config.column_width,
            this.config.unit,
        );

        let current_upper = this.config.view_mode.upper_text(
            this.current_date,
            null,
            this.options.language,
        );
        let $el = this.upperTexts.find(
            (el) => el.textContent === current_upper,
        );

        this.current_date = date_utils.add(
            this.gantt_start,
            (this.$container.scrollLeft + ($el ? $el.clientWidth : 0)) /
                this.config.column_width,
            this.config.unit,
        );
        current_upper = this.config.view_mode.upper_text(
            this.current_date,
            null,
            this.options.language,
        );
        $el = this.upperTexts.find((el) => el.textContent === current_upper);
        if ($el) {
            $el.classList.add('current-upper');
            this.$current = $el;
        }
    }

    scroll_current() {
        let res = this.get_closest_date();
        if (res) this.set_scroll_position(res[0]);
    }

    scroll_custom_marker() {
        const res = this.get_closest_date_to(this.config.custom_marker_date);
        if (!res) return;

        if (
            this.config.player_end_date &&
            res[0] >= this.config.player_end_date
        ) {
            this.eventQueueManager.handle_animation_end();
        }
    }

    scroll_to_latest_task() {
        if (!this.tasks.length) return;

        const currentDate = this.config.custom_marker_date || this.gantt_start;
        const activeTasks = this.tasks.filter(
            (task) => task._start <= currentDate && currentDate <= task._end,
        );

        const targetTask = activeTasks.length
            ? activeTasks.reduce(
                  (min, task) => (task._index < min._index ? task : min),
                  activeTasks[0],
              )
            : this.tasks.reduce(
                  (earliest, task) =>
                      task._start < earliest._start ? task : earliest,
                  this.tasks[0],
              );

        const barWrapper = this.$svg.querySelector(
            `.bar-wrapper[data-id="${targetTask.id}"]`,
        );

        let taskY;
        if (barWrapper) {
            taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
            if (taskY === 0) {
                taskY =
                    this.config.header_height +
                    targetTask._index *
                        (this.options.bar_height + this.options.padding);
            }
        } else {
            taskY =
                this.config.header_height +
                targetTask._index *
                    (this.options.bar_height + this.options.padding);
        }

        if (this.eventQueueManager) {
            this.eventQueueManager.lastTaskY = taskY;
        }

        const adjustedY = taskY - this.config.header_height;

        const viewportHeight = this.$container.clientHeight;
        const offset = this.options.padding;
        let targetScrollTop = adjustedY - offset;

        const maxScrollTop = this.$container.scrollHeight - viewportHeight;
        const clampedScrollTop = Math.max(
            0,
            Math.min(targetScrollTop, maxScrollTop),
        );

        this.$container.scrollTo({
            top: clampedScrollTop,
            behavior: 'smooth',
        });
    }

    start_scroll_animation(startLeft) {
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }

        if (!this.options.player_state) {
            console.log('start_scroll_animation exited: player_state is false');
            return;
        }

        const animationDuration = (this.options.player_interval || 1000) / 1000;
        const moveDistance = this.config.column_width;
        const startTime = performance.now();
        const container = this.$container;
        const viewportWidth = container.clientWidth;
        const maxScroll = container.scrollWidth - viewportWidth;

        const offset = viewportWidth / 6;

        const animateScroll = (currentTime) => {
            if (!this.options.player_state) {
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

            if (this.tasks.length) {
                const currentDate = this.config.custom_marker_date;
                const activeTasks = this.tasks.filter(
                    (task) =>
                        task._start <= currentDate && currentDate <= task._end,
                );

                let taskY;
                if (activeTasks.length) {
                    const targetTask = activeTasks.reduce(
                        (min, task) => (task._index < min._index ? task : min),
                        activeTasks[0],
                    );

                    const barWrapper = this.$svg.querySelector(
                        `.bar-wrapper[data-id="${targetTask.id}"]`,
                    );

                    if (barWrapper) {
                        taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
                        if (taskY === 0) {
                            taskY =
                                this.config.header_height +
                                targetTask._index *
                                    (this.options.bar_height +
                                        this.options.padding);
                        }
                    } else {
                        taskY =
                            this.config.header_height +
                            targetTask._index *
                                (this.options.bar_height +
                                    this.options.padding);
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
                    const targetTask = this.tasks.reduce(
                        (earliest, task) =>
                            task._start < earliest._start ? task : earliest,
                        this.tasks[0],
                    );

                    const barWrapper = this.$svg.querySelector(
                        `.bar-wrapper[data-id="${targetTask.id}"]`,
                    );

                    if (barWrapper) {
                        taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
                        if (taskY === 0) {
                            taskY =
                                this.config.header_height +
                                targetTask._index *
                                    (this.options.bar_height +
                                        this.options.padding);
                        }
                    } else {
                        taskY =
                            this.config.header_height +
                            targetTask._index *
                                (this.options.bar_height +
                                    this.options.padding);
                    }

                    if (this.eventQueueManager) {
                        this.eventQueueManager.lastTaskY = taskY;
                    }
                }

                const adjustedY = taskY - this.config.header_height;

                const viewportHeight = container.clientHeight;
                const verticalOffset = this.options.padding;
                let targetScrollTop = adjustedY - verticalOffset;

                const maxScrollTop = container.scrollHeight - viewportHeight;
                const clampedScrollTop = Math.max(
                    0,
                    Math.min(targetScrollTop, maxScrollTop),
                );

                container.scrollTop = clampedScrollTop;
            }

            const res = this.get_closest_date_to(
                this.config.custom_marker_date,
            );
            const isBeyondEnd =
                res && this.config.player_end_date
                    ? res[0] >= this.config.player_end_date
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

    get_closest_date_to(date) {
        let newDate = date;
        if (newDate < this.gantt_start || newDate > this.gantt_end) return null;

        let current = date;
        let el = this.$container.querySelector(
            '.date_' +
                sanitize(
                    date_utils.format(
                        current,
                        this.config.date_format,
                        this.options.language,
                    ),
                ),
        );

        let c = 0;
        while (!el && c < this.config.step) {
            current = date_utils.add(current, -1, this.config.unit);
            el = this.$container.querySelector(
                '.date_' +
                    sanitize(
                        date_utils.format(
                            current,
                            this.config.date_format,
                            this.options.language,
                        ),
                    ),
            );
            c++;
        }
        return [
            new Date(
                date_utils.format(
                    current,
                    this.config.date_format,
                    this.options.language,
                ),
            ),
            el,
        ];
    }

    get_closest_date() {
        let now = new Date();
        if (now < this.gantt_start || now > this.gantt_end) return null;

        let current = new Date();
        let el = this.$container.querySelector(
            '.date_' +
                sanitize(
                    date_utils.format(
                        current,
                        this.config.date_format,
                        this.options.language,
                    ),
                ),
        );

        let c = 0;
        while (!el && c < this.config.step) {
            current = date_utils.add(current, -1, this.config.unit);
            el = this.$container.querySelector(
                '.date_' +
                    sanitize(
                        date_utils.format(
                            current,
                            this.config.date_format,
                            this.options.language,
                        ),
                    ),
            );
            c++;
        }
        return [
            new Date(
                date_utils.format(
                    current,
                    this.config.date_format,
                    this.options.language,
                ),
            ),
            el,
        ];
    }

    bind_bar_events() {
        let is_dragging = false;
        let x_on_start = 0;
        let x_on_scroll_start = 0;
        let y_on_start = 0;
        let is_resizing_left = false;
        let is_resizing_right = false;
        let parent_bar_id = null;
        let bars = [];
        this.bar_being_dragged = null;
        let pos = 0;

        const action_in_progress = () =>
            is_dragging || is_resizing_left || is_resizing_right;

        $.on(this.$svg, 'click', '.grid-row', () => {
            this.unselect_all();
        });

        $.on(this.$svg, 'mousemove', '.bar-wrapper, .handle', (e) => {
            if (
                this.bar_being_dragged === false &&
                Math.abs((e.offsetX || e.layerX) - pos) > 10
            ) {
                this.bar_being_dragged = true;
            }
        });

        $.on(this.$svg, 'mousedown', '.bar-wrapper, .handle', (e, element) => {
            const bar_wrapper = $.closest('.bar-wrapper', element);
            if (element.classList.contains('left')) {
                is_resizing_left = true;
                element.classList.add('visible');
            } else if (element.classList.contains('right')) {
                is_resizing_right = true;
                element.classList.add('visible');
            } else if (element.classList.contains('bar-wrapper')) {
                is_dragging = true;
            }

            if (this.popup) this.popup.hide();

            x_on_start = e.offsetX || e.layerX;
            y_on_start = e.offsetY || e.layerY;

            parent_bar_id = bar_wrapper.getAttribute('data-id');
            let ids;
            if (this.options.move_dependencies) {
                ids = [
                    parent_bar_id,
                    ...this.taskManager.get_all_dependent_tasks(parent_bar_id),
                ];
            } else {
                ids = [parent_bar_id];
            }
            bars = ids.map((id) => this.get_bar(id));

            this.bar_being_dragged = false;
            pos = x_on_start;

            bars.forEach((bar) => {
                const $bar = bar.$bar;
                $bar.ox = $bar.getX();
                $bar.oy = $bar.getY();
                $bar.owidth = $bar.getWidth();
                $bar.finaldx = 0;
            });
        });

        if (this.options.infinite_padding) {
            let extended = false;
            $.on(this.$container, 'wheel', (e) => {
                let trigger = this.$container.scrollWidth / 2;
                if (!extended && e.currentTarget.scrollLeft <= trigger) {
                    let old_scroll_left = e.currentTarget.scrollLeft;
                    extended = true;

                    this.gantt_start = date_utils.add(
                        this.gantt_start,
                        -this.config.extend_by_units,
                        this.config.unit,
                    );
                    this.setup_date_values();
                    this.render();
                    e.currentTarget.scrollLeft =
                        old_scroll_left +
                        this.config.column_width * this.config.extend_by_units;
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
                    this.gantt_end = date_utils.add(
                        this.gantt_end,
                        this.config.extend_by_units,
                        this.config.unit,
                    );
                    this.setup_date_values();
                    this.render();
                    e.currentTarget.scrollLeft = old_scroll_left;
                    setTimeout(() => (extended = false), 300);
                }
            });
        }

        $.on(this.$container, 'scroll', (e) => {
            const ids = this.bars.map(({ group }) =>
                group.getAttribute('data-id'),
            );
            let dx;
            if (x_on_scroll_start) {
                dx = e.currentTarget.scrollLeft - x_on_scroll_start;
            }

            this.current_date = date_utils.add(
                this.gantt_start,
                (e.currentTarget.scrollLeft / this.config.column_width) *
                    this.config.step,
                this.config.unit,
            );

            let current_upper = this.config.view_mode.upper_text(
                this.current_date,
                null,
                this.options.language,
            );
            let $el = this.upperTexts.find(
                (el) => el.textContent === current_upper,
            );

            this.current_date = date_utils.add(
                this.gantt_start,
                ((e.currentTarget.scrollLeft + ($el ? $el.clientWidth : 0)) /
                    this.config.column_width) *
                    this.config.step,
                this.config.unit,
            );
            current_upper = this.config.view_mode.upper_text(
                this.current_date,
                null,
                this.options.language,
            );
            $el = this.upperTexts.find(
                (el) => el.textContent === current_upper,
            );

            if ($el !== this.$current) {
                if (this.$current) {
                    this.$current.classList.remove('current-upper');
                }

                if ($el) {
                    $el.classList.add('current-upper');
                    this.$current = $el;
                }
            }

            x_on_scroll_start = e.currentTarget.scrollLeft;
            let [min_start, max_start, max_end] =
                this.get_start_end_positions();

            if (x_on_scroll_start > max_end + 100) {
                this.$adjust.innerHTML = '←';
                this.$adjust.classList.remove('hide');
                this.$adjust.onclick = () => {
                    this.$container.scrollTo({
                        left: max_start,
                        behavior: 'smooth',
                    });
                };
            } else if (
                x_on_scroll_start + e.currentTarget.offsetWidth <
                min_start - 100
            ) {
                this.$adjust.innerHTML = '→';
                this.$adjust.classList.remove('hide');
                this.$adjust.onclick = () => {
                    this.$container.scrollTo({
                        left: min_start,
                        behavior: 'smooth',
                    });
                };
            } else {
                this.$adjust.classList.add('hide');
            }

            if (dx) {
                const localBars = ids.map((id) => this.get_bar(id));
                if (this.options.auto_move_label) {
                    localBars.forEach((bar) => {
                        bar.update_label_position_on_horizontal_scroll({
                            x: dx,
                            sx: e.currentTarget.scrollLeft,
                        });
                    });
                }
            }
        });

        $.on(this.$svg, 'mousemove', (e) => {
            if (!action_in_progress()) return;
            const dx = (e.offsetX || e.layerX) - x_on_start;

            bars.forEach((bar) => {
                const $bar = bar.$bar;
                $bar.finaldx = this.eventHandler.get_snap_position(dx, $bar.ox);
                this.hide_popup();
                if (is_resizing_left) {
                    if (parent_bar_id === bar.task.id) {
                        bar.update_bar_position({
                            x: $bar.ox + $bar.finaldx,
                            width: $bar.owidth - $bar.finaldx,
                        });
                    } else {
                        bar.update_bar_position({
                            x: $bar.ox + $bar.finaldx,
                        });
                    }
                } else if (is_resizing_right) {
                    if (parent_bar_id === bar.task.id) {
                        bar.update_bar_position({
                            width: $bar.owidth + $bar.finaldx,
                        });
                    }
                } else if (
                    is_dragging &&
                    !this.options.readonly &&
                    !this.options.readonly_dates
                ) {
                    bar.update_bar_position({ x: $bar.ox + $bar.finaldx });
                }
            });
        });

        document.addEventListener('mouseup', () => {
            is_dragging = false;
            is_resizing_left = false;
            is_resizing_right = false;
            const visible = this.$container.querySelector('.visible');
            if (visible) {
                visible.classList.remove('visible');
            }
        });

        $.on(this.$svg, 'mouseup', () => {
            this.bar_being_dragged = null;
            bars.forEach((bar) => {
                const $bar = bar.$bar;
                if (!$bar.finaldx) return;
                bar.date_changed();
                bar.compute_progress();
                bar.set_action_completed();
            });
        });
    }

    get_start_end_positions() {
        if (!this.bars.length) return [0, 0, 0];
        let { x, width } = this.bars[0].group.getBBox();
        let min_start = x;
        let max_start = x;
        let max_end = x + width;
        for (let { group } of this.bars) {
            let { x, width } = group.getBBox();
            if (x < min_start) min_start = x;
            if (x > max_start) max_start = x;
            if (x + width > max_end) max_end = x + width;
        }
        return [min_start, max_start, max_end];
    }

    unselect_all() {
        if (this.popup) this.popup.parent.classList.add('hide');
        this.$container
            .querySelectorAll('.date-range-highlight')
            .forEach((k) => k.classList.add('hide'));
    }

    view_is(modes) {
        return isViewMode(this.config.view_mode.name, modes);
    }

    get_task(id) {
        return this.tasks.find((task) => task.id === id);
    }

    get_bar(id) {
        return this.bars.find((bar) => bar.task.id === id);
    }

    show_popup(opts) {
        if (this.options.popup === false) return;
        if (!this.popup) {
            this.popup = new Popup(
                this.$popup_wrapper,
                this.options.popup,
                this,
            );
        }
        this.popup.show(opts);
    }

    hide_popup() {
        if (this.popup) this.popup.hide();
    }

    trigger_event(event, args) {
        if (this.options['on_' + event]) {
            this.options['on_' + event].apply(this, args);
        }
    }

    get_oldest_starting_date() {
        return getOldestStartingDate(this.tasks);
    }

    clear() {
        this.$svg.innerHTML = '';
        if (this.$header) this.$header.remove();
        if (this.$side_header) this.$side_header.remove();
        if (this.$current_highlight) this.$current_highlight.remove();
        if (this.$current_ball_highlight) {
            this.$current_ball_highlight.remove();
        }
        if (this.$extras) this.$extras.remove();
        if (this.popup) this.popup.hide();
        if (this.$animated_highlight) {
            this.$animated_highlight.remove();
            this.$animated_highlight = null;
        }
        if (this.$animated_ball_highlight) {
            this.$animated_ball_highlight.remove();
            this.$animated_ball_highlight = null;
        }
    }
}

Gantt.VIEW_MODE = {
    HOUR: DEFAULT_VIEW_MODES[0],
    QUARTER_DAY: DEFAULT_VIEW_MODES[1],
    HALF_DAY: DEFAULT_VIEW_MODES[2],
    DAY: DEFAULT_VIEW_MODES[3],
    WEEK: DEFAULT_VIEW_MODES[4],
    MONTH: DEFAULT_VIEW_MODES[5],
    YEAR: DEFAULT_VIEW_MODES[6],
};
