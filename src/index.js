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
import ScrollManager from './scrollManager';
import ViewManager from './viewManager';

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.setup_wrapper(wrapper);
        this.setup_options(options);
        this.eventQueueManager = new EventQueueManager(this);
        this.eventHandler = new EventHandler(this);
        this.taskManager = new TaskManager(this);
        this.scrollManager = new ScrollManager(this);
        this.viewManager = new ViewManager(this);
        this.setup_tasks(tasks);
        this.renderer = new GanttRenderer(this);
        this.viewManager.change_view_mode();
        this.eventHandler.bind_events();
        this.scrollManager.bind_scroll_events();
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
        this.viewManager.change_view_mode(undefined, true);
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
        this.scrollManager.scroll_to_latest_task();
    }

    refresh(tasks) {
        this.setup_tasks(tasks);
        this.viewManager.change_view_mode();
        this.scrollManager.scroll_to_latest_task();
    }

    update_task(id, new_details) {
        let task = this.tasks.find((t) => t.id === id);
        let bar = this.bars.find((bar) => bar.task.id === id);
        Object.assign(task, new_details);
        bar.refresh();
        this.taskManager.setup_dependencies();
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
            console.log(
                'render: custom_marker_date=',
                this.config.custom_marker_date,
                'gantt_start=',
                this.gantt_start,
                'gantt_end=',
                this.gantt_end,
                'dates.length=',
                this.dates.length,
                'column_width=',
                this.config.column_width,
            );

            this.clear();
            this.renderer.setup_layers();
            this.renderer.make_grid();
            this.renderer.make_dates();
            this.renderer.make_grid_extras();
            this.renderer.make_bars();
            this.renderer.make_arrows();
            this.map_arrows_on_bars();
            this.renderer.set_dimensions();
            this.scrollManager.set_scroll_position(this.options.scroll_to);
            this.scrollManager.setUpperTexts(this.upperTexts);

            // Reapply highlight to ensure correct position
            if (this.options.custom_marker && this.config.custom_marker_date) {
                const diff = date_utils.diff(
                    this.config.custom_marker_date,
                    this.gantt_start,
                    this.config.unit,
                );
                const left =
                    (diff / this.config.step) * this.config.column_width;
                console.log('render: reapplying highlight with left=', left);
                this.renderer.render_animated_highlight(
                    left,
                    this.config.custom_marker_date,
                );
            }
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
        this.scrollManager.set_scroll_position('start');
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
