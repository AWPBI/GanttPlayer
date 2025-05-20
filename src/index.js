import date_utils from './date_utils';
import { $, createSVG } from './svg_utils';

import Arrow from './arrow';
import Bar from './bar';
import Popup from './popup';

import { DEFAULT_OPTIONS, DEFAULT_VIEW_MODES } from './defaults';

import './styles/gantt.css';

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.setup_wrapper(wrapper);
        this.setup_options(options);
        this.setup_tasks(tasks);
        this.overlapping_tasks = new Set();
        this.lastTaskY = null; // Track last known y position
        this.change_view_mode();
        this.bind_events();
        this.scrollAnimationFrame = null; // Track animation frame
        this.taskInterval = null;
        this.viewerUpdateQueue = new Map();
        this.lastViewerUpdate = 0;
        this.eventQueue = new Map();
        this.lastEventUpdate = 0;
        this.shadingNodeCache = new Map();
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

        this.$container = this.create_el({
            classes: 'gantt-container',
            append_to: this.$svg.parentElement,
        });

        this.$container.appendChild(this.$svg);
        this.$popup_wrapper = this.create_el({
            classes: 'popup-wrapper',
            append_to: this.$container,
        });
    }

    setup_options(options) {
        this.original_options = options;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            task_interval: options.task_interval || 30,
            viewer_debounce_interval: options.viewer_debounce_interval || 100,
            event_debounce_interval: options.event_debounce_interval || 20,
        };
        const CSS_VARIABLES = {
            'grid-height': 'container_height',
            'bar-height': 'bar_height',
            'lower-header-height': 'lower_header_height',
            'upper-header-height': 'upper_header_height',
        };
        for (let name in CSS_VARIABLES) {
            let setting = this.options[CSS_VARIABLES[name]];
            if (setting !== 'auto')
                this.$container.style.setProperty(
                    '--gv-' + name,
                    setting + 'px',
                );
        }

        this.config = {
            ignored_dates: [],
            ignored_positions: [],
            extend_by_units: 10,
        };

        if (this.options.player_button) {
            this.options.player_state = false;
        }

        const view_mode = this.options.view_mode || 'Day';
        let offsetUnit,
            offsetAmount = -2;
        switch (view_mode.toLowerCase()) {
            case 'hour':
                offsetUnit = 'hour';
                break;
            case 'quarter_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 6;
                break;
            case 'half_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 12;
                break;
            case 'day':
                offsetUnit = 'day';
                break;
            case 'week':
                offsetUnit = 'week';
                break;
            case 'month':
                offsetUnit = 'month';
                break;
            case 'year':
                offsetUnit = 'year';
                break;
            default:
                offsetUnit = 'day';
        }

        if (this.options.custom_marker) {
            const baseDate = this.options.custom_marker_init_date
                ? new Date(this.options.custom_marker_init_date)
                : new Date(this.tasks[0]?._start || Date.now());
            let newDate = new Date(baseDate);
            if (offsetUnit === 'week') {
                newDate.setDate(baseDate.getDate() + offsetAmount * 7);
            } else if (offsetUnit === 'month') {
                newDate.setMonth(baseDate.getMonth() + offsetAmount);
            } else if (offsetUnit === 'year') {
                newDate.setFullYear(baseDate.getFullYear() + offsetAmount);
            } else {
                newDate = date_utils.add(baseDate, offsetAmount, offsetUnit);
            }
            this.config.custom_marker_date = newDate;
            console.log(
                `setup_options: view_mode=${view_mode}, baseDate=${baseDate}, offset=${offsetAmount} ${offsetUnit}, custom_marker_date=${this.config.custom_marker_date}`,
            );
        }

        if (this.options.player_end_date) {
            this.config.player_end_date = new Date(
                this.options.player_end_date,
            );
        }
        if (typeof this.options.ignore !== 'function') {
            if (typeof this.options.ignore === 'string')
                this.options.ignore = [this.options.ignore];
            for (let option of this.options.ignore) {
                if (typeof option === 'function') {
                    this.config.ignored_function = option;
                    continue;
                }
                if (typeof option === 'string') {
                    if (option === 'weekend')
                        this.config.ignored_function = (d) =>
                            d.getDay() == 6 || d.getDay() == 0;
                    else this.config.ignored_dates.push(new Date(option + ' '));
                }
            }
        } else {
            this.config.ignored_function = this.options.ignore;
        }
    }

    setup_options(options) {
        this.original_options = options;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            task_interval: options.task_interval || 30,
            viewer_debounce_interval: options.viewer_debounce_interval || 100,
            event_debounce_interval: options.event_debounce_interval || 20,
        };
        const CSS_VARIABLES = {
            'grid-height': 'container_height',
            'bar-height': 'bar_height',
            'lower-header-height': 'lower_header_height',
            'upper-header-height': 'upper_header_height',
        };
        for (let name in CSS_VARIABLES) {
            let setting = this.options[CSS_VARIABLES[name]];
            if (setting !== 'auto')
                this.$container.style.setProperty(
                    '--gv-' + name,
                    setting + 'px',
                );
        }

        this.config = {
            ignored_dates: [],
            ignored_positions: [],
            extend_by_units: 10,
        };

        if (this.options.player_button) {
            this.options.player_state = false;
        }

        const view_mode = this.options.view_mode || 'Day';
        let offsetUnit,
            offsetAmount = -2;
        switch (view_mode.toLowerCase()) {
            case 'hour':
                offsetUnit = 'hour';
                break;
            case 'quarter_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 6;
                break;
            case 'half_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 12;
                break;
            case 'day':
                offsetUnit = 'day';
                break;
            case 'week':
                offsetUnit = 'week';
                break;
            case 'month':
                offsetUnit = 'month';
                break;
            case 'year':
                offsetUnit = 'year';
                break;
            default:
                offsetUnit = 'day';
        }

        if (this.options.custom_marker) {
            const baseDate = this.options.custom_marker_init_date
                ? new Date(this.options.custom_marker_init_date)
                : new Date(this.tasks[0]?._start || Date.now());
            let newDate = new Date(baseDate);
            if (offsetUnit === 'week') {
                newDate.setDate(baseDate.getDate() + offsetAmount * 7);
            } else if (offsetUnit === 'month') {
                newDate.setMonth(baseDate.getMonth() + offsetAmount);
            } else if (offsetUnit === 'year') {
                newDate.setFullYear(baseDate.getFullYear() + offsetAmount);
            } else {
                newDate = date_utils.add(baseDate, offsetAmount, offsetUnit);
            }
            this.config.custom_marker_date = newDate;
            console.log(
                `setup_options: view_mode=${view_mode}, baseDate=${baseDate}, offset=${offsetAmount} ${offsetUnit}, custom_marker_date=${this.config.custom_marker_date}`,
            );
        }

        if (this.options.player_end_date) {
            this.config.player_end_date = new Date(
                this.options.player_end_date,
            );
        }
        if (typeof this.options.ignore !== 'function') {
            if (typeof this.options.ignore === 'string')
                this.options.ignore = [this.options.ignore];
            for (let option of this.options.ignore) {
                if (typeof option === 'function') {
                    this.config.ignored_function = option;
                    continue;
                }
                if (typeof option === 'string') {
                    if (option === 'weekend')
                        this.config.ignored_function = (d) =>
                            d.getDay() == 6 || d.getDay() == 0;
                    else this.config.ignored_dates.push(new Date(option + ' '));
                }
            }
        } else {
            this.config.ignored_function = this.options.ignore;
        }
    }

    setup_tasks(tasks) {
        if (!tasks || !Array.isArray(tasks)) {
            console.error(
                'setup_tasks: Invalid tasks input, expected array:',
                tasks,
            );
            this.tasks = [];
            return;
        }
        this.tasks = tasks.map((task, i) => {
            task._start = date_utils.parse(task.start);
            task._end = date_utils.parse(task.end);

            if (!task.start && !task.end) {
                const today = new Date();
                task._start = today;
                task._end = date_utils.add(today, 1, 'day');
            }

            if (!task.end && task.start) {
                task._end = date_utils.add(
                    task._start,
                    task.duration || 1,
                    'day',
                );
            }

            task._index = i;

            if (!task.id) {
                task.id = generate_id(task);
            }

            if (!task.name) {
                task.name = task.id;
            }

            task.progress = parseFloat(task.progress) || 0;

            if (isNaN(task._start.getTime()) || isNaN(task._end.getTime())) {
                console.warn(
                    `Invalid task dates: id=${task.id}, start=${task.start}, end=${task.end}`,
                );
                task._start = new Date();
                task._end = date_utils.add(task._start, 1, 'day');
            }

            console.log(
                `setup_tasks: Task id=${task.id}, name=${task.name}, start=${task._start}, end=${task._end}`,
            );
            return task;
        });

        if (this.options.phasing_config?.objects) {
            console.log(
                'setup_tasks: phasing_config.objects:',
                this.options.phasing_config.objects,
            );
        } else {
            console.warn(
                'setup_tasks: phasing_config.objects is empty or undefined',
            );
        }
    }

    setup_dependencies() {
        this.dependency_map = {};
        for (let t of this.tasks) {
            for (let d of t.dependencies) {
                this.dependency_map[d] = this.dependency_map[d] || [];
                this.dependency_map[d].push(t.id);
            }
        }
    }

    refresh(tasks) {
        this.setup_tasks(tasks);
        this.change_view_mode();
        this.scroll_to_latest_task(); // Scroll to the latest task after refresh
    }

    update_task(id, new_details) {
        let task = this.tasks.find((t) => t.id === id);
        let bar = this.bars[task._index];
        Object.assign(task, new_details);
        bar.refresh();
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

    setup_gantt_dates() {
        this.gantt_start = this.gantt_end = null;

        for (let task of this.tasks) {
            if (!this.gantt_start || task._start < this.gantt_start) {
                this.gantt_start = task._start;
            }
            if (!this.gantt_end || task._end > this.gantt_end) {
                this.gantt_end = task._end;
            }
        }

        if (
            this.config.custom_marker_date &&
            this.config.custom_marker_date < this.gantt_start
        ) {
            this.gantt_start = date_utils.start_of(
                this.config.custom_marker_date,
                this.config.unit,
            );
            console.log(
                `setup_gantt_dates: Adjusted gantt_start to ${this.gantt_start} to include run-up`,
            );
        }

        this.gantt_start = date_utils.start_of(
            this.gantt_start,
            this.config.unit,
        );
        this.gantt_end = date_utils.start_of(this.gantt_end, this.config.unit);

        this.gantt_start = date_utils.add(
            this.gantt_start,
            -this.config.extend_by_units,
            this.config.unit,
        );
        this.gantt_end = date_utils.add(
            this.gantt_end,
            this.config.extend_by_units,
            this.config.unit,
        );

        console.log(
            `setup_gantt_dates: gantt_start=${this.gantt_start}, gantt_end=${this.gantt_end}`,
        );
    }

    setup_date_values() {
        let cur_date = this.gantt_start;
        this.dates = [cur_date];

        while (cur_date < this.gantt_end) {
            cur_date = date_utils.add(
                cur_date,
                this.config.step,
                this.config.unit,
            );
            this.dates.push(cur_date);
        }
    }

    bind_events() {
        this.bind_grid_click();
        this.bind_holiday_labels();
        this.bind_bar_events();
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
            this.setup_layers();
            this.make_grid();
            this.make_dates();
            this.make_grid_extras();
            this.make_bars();
            this.make_arrows();
            this.map_arrows_on_bars();
            this.set_dimensions();
            this.set_scroll_position(this.options.scroll_to);

            // Ensure animated highlights are correctly positioned after render
            if (this.options.custom_marker) {
                const diff = date_utils.diff(
                    this.config.custom_marker_date,
                    this.gantt_start,
                    this.config.unit,
                );
                const left =
                    (diff / this.config.step) * this.config.column_width;
                this.play_animated_highlight(
                    left,
                    this.config.custom_marker_date,
                );
            }
        } catch (error) {
            console.error('Error during render:', error);
        }
    }

    setup_layers() {
        this.layers = {};
        const layers = ['grid', 'arrow', 'progress', 'bar'];
        for (let layer of layers) {
            this.layers[layer] = createSVG('g', {
                class: layer,
                append_to: this.$svg,
            });
        }
        this.$extras = this.create_el({
            classes: 'extras',
            append_to: this.$container,
        });
        this.$adjust = this.create_el({
            classes: 'adjust hide',
            append_to: this.$extras,
            type: 'button',
        });
        this.$adjust.innerHTML = '←';
    }

    make_grid() {
        this.make_grid_background();
        this.make_grid_rows();
        this.make_grid_header();
        this.make_side_header();
    }

    make_grid_extras() {
        this.make_grid_highlights();
        this.make_grid_ticks();
    }

    make_grid_background() {
        const grid_width = this.dates.length * this.config.column_width;
        const grid_height = Math.max(
            this.config.header_height +
                this.options.padding +
                (this.options.bar_height + this.options.padding) *
                    this.tasks.length -
                10,
            this.options.container_height !== 'auto'
                ? this.options.container_height
                : 0,
        );

        createSVG('rect', {
            x: 0,
            y: 0,
            width: grid_width,
            height: grid_height,
            class: 'grid-background',
            append_to: this.$svg,
        });

        $.attr(this.$svg, {
            height: grid_height,
            width: '100%',
        });
        this.grid_height = grid_height;
        if (this.options.container_height === 'auto')
            this.$container.style.height = grid_height + 16 + 'px';
    }

    make_grid_rows() {
        const rows_layer = createSVG('g', { append_to: this.layers.grid });

        const row_width = this.dates.length * this.config.column_width;
        const row_height = this.options.bar_height + this.options.padding;

        let y = this.config.header_height;
        for (
            let y = this.config.header_height;
            y < this.grid_height;
            y += row_height
        ) {
            createSVG('rect', {
                x: 0,
                y,
                width: row_width,
                height: row_height,
                class: 'grid-row',
                append_to: rows_layer,
            });
        }
    }

    make_grid_header() {
        this.$header = this.create_el({
            width: this.dates.length * this.config.column_width,
            classes: 'grid-header',
            append_to: this.$container,
        });

        this.$upper_header = this.create_el({
            classes: 'upper-header',
            append_to: this.$header,
        });
        this.$lower_header = this.create_el({
            classes: 'lower-header',
            append_to: this.$header,
        });
    }

    make_side_header() {
        this.$side_header = this.create_el({ classes: 'side-header' });
        this.$upper_header.prepend(this.$side_header);

        if (this.options.view_mode_select) {
            const $select = document.createElement('select');
            $select.classList.add('viewmode-select');

            const $el = document.createElement('option');
            $el.selected = true;
            $el.disabled = true;
            $el.textContent = 'Mode';
            $select.appendChild($el);

            for (const mode of this.options.view_modes) {
                const $option = document.createElement('option');
                $option.value = mode.name;
                $option.textContent = mode.name;
                if (mode.name === this.config.view_mode.name)
                    $option.selected = true;
                $select.appendChild($option);
            }

            $select.addEventListener(
                'change',
                function () {
                    this.change_view_mode($select.value, true);
                }.bind(this),
            );
            this.$side_header.appendChild($select);
        }

        if (this.options.today_button) {
            let $today_button = document.createElement('button');
            $today_button.classList.add('today-button');
            $today_button.textContent = 'Today';
            $today_button.onclick = this.scroll_current.bind(this);
            this.$side_header.prepend($today_button);
            this.$today_button = $today_button;
        }

        if (this.options.player_button) {
            let player_reset_button = document.createElement('button');
            player_reset_button.classList.add('player-reset-button');
            if (this.options.player_use_fa) {
                player_reset_button.classList.add('fas', 'fa-redo');
            } else {
                player_reset_button.textContent = 'Reset';
            }
            player_reset_button.onclick = this.reset_play.bind(this);
            this.$side_header.prepend(player_reset_button);
            this.$player_reset_button = player_reset_button;
        }

        if (this.options.player_button) {
            let $player_button = document.createElement('button');
            $player_button.classList.add('player-button');
            if (this.options.player_use_fa) {
                $player_button.classList.add('fas');
                if (this.options.player_state)
                    $player_button.classList.add('fa-pause');
                else $player_button.classList.add('fa-play');
            } else {
                $player_button.textContent = 'Play';
            }
            $player_button.onclick = this.toggle_play.bind(this);
            this.$side_header.prepend($player_button);
            this.$player_button = $player_button;
        }
    }

    make_grid_ticks() {
        if (this.options.lines === 'none') return;
        let tick_x = 0;
        let tick_y = this.config.header_height;
        let tick_height = this.grid_height - this.config.header_height;

        let $lines_layer = createSVG('g', {
            class: 'lines_layer',
            append_to: this.layers.grid,
        });

        let row_y = this.config.header_height;

        const row_width = this.dates.length * this.config.column_width;
        const row_height = this.options.bar_height + this.options.padding;
        if (this.options.lines !== 'vertical') {
            for (
                let y = this.config.header_height;
                y < this.grid_height;
                y += row_height
            ) {
                createSVG('line', {
                    x1: 0,
                    y1: row_y + row_height,
                    x2: row_width,
                    y2: row_y + row_height,
                    class: 'row-line',
                    append_to: $lines_layer,
                });
                row_y += row_height;
            }
        }
        if (this.options.lines === 'horizontal') return;

        for (let date of this.dates) {
            let tick_class = 'tick';
            if (
                this.config.view_mode.thick_line &&
                this.config.view_mode.thick_line(date)
            ) {
                tick_class += ' thick';
            }

            createSVG('path', {
                d: `M ${tick_x} ${tick_y} v ${tick_height}`,
                class: tick_class,
                append_to: this.layers.grid,
            });

            if (this.view_is('month')) {
                tick_x +=
                    (date_utils.get_days_in_month(date) *
                        this.config.column_width) /
                    30;
            } else if (this.view_is('year')) {
                tick_x +=
                    (date_utils.get_days_in_year(date) *
                        this.config.column_width) /
                    365;
            } else {
                tick_x += this.config.column_width;
            }
        }
    }

    highlight_holidays() {
        let labels = {};
        if (!this.options.holidays) return;

        for (let color in this.options.holidays) {
            let check_highlight = this.options.holidays[color];
            if (check_highlight === 'weekend')
                check_highlight = (d) => d.getDay() === 0 || d.getDay() === 6;
            let extra_func;

            if (typeof check_highlight === 'object') {
                let f = check_highlight.find((k) => typeof k === 'function');
                if (f) {
                    extra_func = f;
                }
                if (this.options.holidays.name) {
                    let dateObj = new Date(check_highlight.date + ' ');
                    check_highlight = (d) => dateObj.getTime() === d.getTime();
                    labels[dateObj] = check_highlight.name;
                } else {
                    check_highlight = (d) =>
                        this.options.holidays[color]
                            .filter((k) => typeof k !== 'function')
                            .map((k) => {
                                if (k.name) {
                                    let dateObj = new Date(k.date + ' ');
                                    labels[dateObj] = k.name;
                                    return dateObj.getTime();
                                }
                                return new Date(k + ' ').getTime();
                            })
                            .includes(d.getTime());
                }
            }
            for (
                let d = new Date(this.gantt_start);
                d <= this.gantt_end;
                d.setDate(d.getDate() + 1)
            ) {
                if (
                    this.config.ignored_dates.find(
                        (k) => k.getTime() == d.getTime(),
                    ) ||
                    (this.config.ignored_function &&
                        this.config.ignored_function(d))
                )
                    continue;
                if (check_highlight(d) || (extra_func && extra_func(d))) {
                    const x =
                        (date_utils.diff(
                            d,
                            this.gantt_start,
                            this.config.unit,
                        ) /
                            this.config.step) *
                        this.config.column_width;
                    const height = this.grid_height - this.config.header_height;
                    const d_formatted = date_utils
                        .format(d, 'YYYY-MM-DD', this.options.language)
                        .replace(' ', '_');

                    if (labels[d]) {
                        let label = this.create_el({
                            classes: 'holiday-label ' + 'label_' + d_formatted,
                            append_to: this.$extras,
                        });
                        label.textContent = labels[d];
                    }
                    createSVG('rect', {
                        x: Math.round(x),
                        y: this.config.header_height,
                        width:
                            this.config.column_width /
                            date_utils.convert_scales(
                                this.config.view_mode.step,
                                'day',
                            ),
                        height,
                        class: 'holiday-highlight ' + d_formatted,
                        style: `fill: ${color};`,
                        append_to: this.layers.grid,
                    });
                }
            }
        }
    }

    highlight_current() {
        const highlight = document.querySelector('.grid-row .today-highlight');
        if (highlight) {
            highlight.classList.remove('today-highlight');
        }

        const date = this.config.custom_marker_date || new Date();
        let dateStr;
        switch (this.options.view_mode.toLowerCase()) {
            case 'year':
                dateStr = date_utils.format(date, 'YYYY');
                break;
            case 'month':
                dateStr = date_utils.format(date, 'YYYY-MM');
                break;
            case 'week':
                const weekStart = date_utils.start_of(date, 'week');
                dateStr = date_utils.format(weekStart, 'YYYY-MM-DD');
                break;
            default:
                dateStr = date_utils.format(date, 'YYYY-MM-DD');
        }

        const cell = document.querySelector(
            `.grid-row [data-date="${dateStr}"]`,
        );
        if (cell) {
            cell.classList.add('today-highlight');
        } else {
            console.warn(
                `highlight_current: No cell found for date=${dateStr}`,
            );
        }
    }

    highlight_custom(date) {
        // Deprecated: No longer used as we rely solely on animated-highlight
        console.warn(
            'highlight_custom is deprecated; using animated-highlight instead',
        );
        return this.play_animated_highlight(0, date);
    }

    make_grid_highlights() {
        this.highlight_holidays();
        this.config.ignored_positions = [];

        const height =
            (this.options.bar_height + this.options.padding) *
            this.tasks.length;
        this.layers.grid.innerHTML += `<pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
          <path d="M-1,1 l2,-2
                   M0,4 l4,-4
                   M3,5 l2,-2"
                style="stroke:grey; stroke-width:0.3" />
        </pattern>`;

        for (
            let d = new Date(this.gantt_start);
            d <= this.gantt_end;
            d.setDate(d.getDate() + 1)
        ) {
            if (
                !this.config.ignored_dates.find(
                    (k) => k.getTime() == d.getTime(),
                ) &&
                (!this.config.ignored_function ||
                    !this.config.ignored_function(d))
            )
                continue;
            let diff =
                date_utils.convert_scales(
                    date_utils.diff(d, this.gantt_start) + 'd',
                    this.config.unit,
                ) / this.config.step;

            this.config.ignored_positions.push(diff * this.config.column_width);
            createSVG('rect', {
                x: diff * this.config.column_width,
                y: this.config.header_height,
                width: this.config.column_width,
                height: height,
                class: 'ignored-bar',
                style: 'fill: url(#diagonalHatch);',
                append_to: this.$svg,
            });
        }

        this.highlight_current();
        if (this.options.custom_marker) {
            // Ensure custom_marker_date is valid
            if (
                !this.config.custom_marker_date ||
                isNaN(this.config.custom_marker_date)
            ) {
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
            const diff = date_utils.diff(
                this.config.custom_marker_date,
                this.gantt_start,
                this.config.unit,
            );
            const left = (diff / this.config.step) * this.config.column_width;
            this.play_animated_highlight(left, this.config.custom_marker_date);
        }
    }

    play_animated_highlight(left, dateObj) {
        let adjustedLeft = left;
        let adjustedDateObj = dateObj;
        if (!dateObj || isNaN(left) || left === 0) {
            adjustedDateObj =
                this.config.custom_marker_date || new Date(this.gantt_start);
            adjustedLeft =
                (date_utils.diff(
                    adjustedDateObj,
                    this.gantt_start,
                    this.config.unit,
                ) /
                    this.config.step) *
                this.config.column_width;
        }

        // Calculate grid height dynamically
        let gridHeight = this.grid_height || 1152;
        const gridElement = this.$svg.querySelector('.grid-background');
        if (gridElement) {
            gridHeight =
                parseFloat(gridElement.getAttribute('height')) || gridHeight;
        } else {
            console.warn(
                'Grid element not found, using default height:',
                gridHeight,
            );
        }

        // Create or update animated highlight
        if (!this.$animated_highlight) {
            this.$animated_highlight = this.create_el({
                top: this.config.header_height,
                left: adjustedLeft,
                width: 2,
                height: gridHeight - this.config.header_height,
                classes: 'animated-highlight',
                append_to: this.$container,
                style: 'background: var(--g-custom-highlight); z-index: 999;',
            });
        } else {
            this.$animated_highlight.style.left = `${adjustedLeft}px`;
            this.$animated_highlight.style.height = `${gridHeight - this.config.header_height}px`;
        }

        // Create or update animated ball highlight
        if (!this.$animated_ball_highlight) {
            this.$animated_ball_highlight = this.create_el({
                top: this.config.header_height - 6,
                left: adjustedLeft - 2,
                width: 6,
                height: 6,
                classes: 'animated-ball-highlight',
                append_to: this.$header,
                style: 'background: var(--g-custom-highlight); border-radius: 50%; z-index: 1001;',
            });
        } else {
            this.$animated_ball_highlight.style.left = `${adjustedLeft - 2}px`;
        }

        // Set animation properties only if player_state is true
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
                    el.style.animation = `none`;
                    el.offsetHeight;
                    el.style.animation = `moveRight ${animationDuration}s linear forwards`;
                    el.style.animationPlayState = 'running';
                },
            );

            // Store the animation start time for task_update
            this.lastAnimationStart = performance.now();
        } else {
            // Ensure animation is paused
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
        this.options.player_state = !this.options.player_state;
        if (this.options.player_state) {
            console.log(
                'toggle_play: Starting playback, custom_marker_date:',
                this.config.custom_marker_date,
            );
            this.task_update(performance.now());
            this.flushEventQueue();
            this.flushViewerUpdates();
            this.player_interval = setInterval(
                this.player_update.bind(this),
                this.options.player_interval || 1000,
            );
            this.taskInterval = setInterval(
                this.task_update.bind(this, performance.now()),
                this.options.task_interval,
            );
            this.trigger_event('start', []);

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
            console.log('toggle_play: Initial highlight position:', left);
            this.play_animated_highlight(left, this.config.custom_marker_date);
        } else {
            console.log('toggle_play: Stopping playback');
            clearInterval(this.player_interval);
            clearInterval(this.taskInterval);
            if (this.scrollAnimationFrame) {
                cancelAnimationFrame(this.scrollAnimationFrame);
                this.scrollAnimationFrame = null;
            }
            this.flushEventQueue();
            this.flushViewerUpdates();
            this.player_interval = null;
            this.taskInterval = null;
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

    task_update(currentTime) {
        if (!this.options.player_state) {
            console.log('task_update: Exited, player_state is false');
            return;
        }

        if (
            !this.config.custom_marker_date ||
            (this.config.player_end_date &&
                this.config.custom_marker_date >= this.config.player_end_date)
        ) {
            console.log('task_update: Exited, no marker or reached end date');
            return;
        }

        if (
            this.config.custom_marker_date < this.gantt_start ||
            this.config.custom_marker_date > this.gantt_end
        ) {
            console.warn(
                `task_update: custom_marker_date=${this.config.custom_marker_date} is outside gantt_start=${this.gantt_start} to gantt_end=${this.gantt_end}`,
            );
        }

        const diff = date_utils.diff(
            this.config.custom_marker_date,
            this.gantt_start,
            this.config.unit,
        );
        const currentLeft =
            (diff / this.config.step) * this.config.column_width;
        console.log(
            'task_update: currentLeft:',
            currentLeft,
            'custom_marker_date:',
            this.config.custom_marker_date,
        );

        const tasksWithBounds = this.tasks
            .filter((task) => {
                const hasDbIds =
                    this.options.phasing_config?.objects?.[task.id]?.length > 0;
                if (
                    !this.options.phasing_config?.objects ||
                    !Object.keys(this.options.phasing_config.objects).length
                ) {
                    console.log(
                        `task_update: No or empty phasing_config.objects, including task id=${task.id}`,
                    );
                    return true;
                }
                console.log(
                    `task_update: Task id=${task.id}, hasDbIds=${hasDbIds}`,
                );
                return hasDbIds;
            })
            .map((task) => {
                const startX =
                    (date_utils.diff(
                        task._start,
                        this.gantt_start,
                        this.config.unit,
                    ) /
                        this.config.step) *
                    this.config.column_width;
                const endX =
                    (date_utils.diff(
                        task._end,
                        this.gantt_start,
                        this.config.unit,
                    ) /
                        this.config.step) *
                    this.config.column_width;
                console.log(
                    `task_update: Task id=${task.id}, startX=${startX}, endX=${endX}, start=${task._start}, end=${task._end}`,
                );
                return { task, startX, endX };
            });

        const new_overlapping = new Set(
            tasksWithBounds
                .filter(
                    ({ startX, endX }) =>
                        startX <= currentLeft && currentLeft < endX,
                )
                .map(({ task }) => task.id),
        );
        console.log('task_update: new_overlapping tasks:', [
            ...new_overlapping,
        ]);

        const entered_tasks = [...new_overlapping].filter(
            (id) => !this.overlapping_tasks.has(id),
        );
        const exited_tasks = [...this.overlapping_tasks].filter(
            (id) => !new_overlapping.has(id),
        );
        console.log(
            'task_update: entered_tasks:',
            entered_tasks,
            'exited_tasks:',
            exited_tasks,
        );

        entered_tasks.forEach((id) => {
            const task = this.get_task(id);
            this.eventQueue.set(id, { task, state: 'enter' });
        });

        exited_tasks.forEach((id) => {
            const task = this.get_task(id);
            this.eventQueue.set(id, { task, state: 'exit' });
        });

        this.overlapping_tasks = new_overlapping;
        console.log('task_update: eventQueue size:', this.eventQueue.size);

        const now = performance.now();
        if (
            now - this.lastEventUpdate >=
            this.options.event_debounce_interval
        ) {
            this.flushEventQueue();
            this.lastEventUpdate = now;
        }
    }

    debounceViewerUpdates() {
        const updates = Array.from(this.viewerUpdateQueue.entries());
        console.log(
            'debounceViewerUpdates: Processing updates:',
            updates.map(([id, { task, state }]) => ({
                id,
                state,
                task_name: task.name,
            })),
        );
        if (!updates.length) {
            console.log('debounceViewerUpdates: No updates to process');
            return;
        }
        if (!this.options.dataVizExtn || !this.options.viewer) {
            console.log('debounceViewerUpdates: Missing dataVizExtn or viewer');
            return;
        }

        if (
            !this.shadingNodeCache.size &&
            this.options.dataVizExtn?.surfaceShading?.[1]?.shadingData
        ) {
            this.tasks.forEach((task) => {
                const node =
                    this.options.dataVizExtn.surfaceShading[1].shadingData.getNodeById(
                        task.name,
                    );
                if (node) {
                    this.shadingNodeCache.set(task.id, node);
                }
            });
            console.log(
                'debounceViewerUpdates: Cached shading nodes:',
                this.shadingNodeCache.size,
            );
        }

        const enterTasks = updates
            .filter(([_, { state }]) => state === 'enter')
            .map(([_, { task }]) => task);
        const exitTasks = updates
            .filter(([_, { state }]) => state === 'exit')
            .map(([_, { task }]) => task);
        console.log(
            'debounceViewerUpdates: enterTasks:',
            enterTasks.map((t) => t.name),
            'exitTasks:',
            exitTasks.map((t) => t.name),
        );

        if (enterTasks.length && this.options.formattingOptions?.clear?.value) {
            const allDbIds = [];
            enterTasks.forEach((task) => {
                const node = this.shadingNodeCache.get(task.id);
                if (node && node.dbIds?.length) {
                    allDbIds.push(...node.dbIds);
                }
            });
            if (allDbIds.length) {
                console.log('debounceViewerUpdates: Showing dbIds:', allDbIds);
                const viewer = this.options.viewer;
                const visibleDbIds = new Set(
                    viewer.impl.getVisibleDbIds?.() ||
                        viewer.model.getVisibleDbIds?.() ||
                        [],
                );
                const dbIdsToShow = allDbIds.filter(
                    (dbId) => !visibleDbIds.has(dbId),
                );
                if (dbIdsToShow.length) {
                    viewer.show(dbIdsToShow);
                } else {
                    console.log(
                        'debounceViewerUpdates: All dbIds already visible',
                    );
                }
            }
        }

        if (enterTasks.length || exitTasks.length) {
            const shadingUpdates = {};
            enterTasks.forEach((task) => {
                shadingUpdates[task.name] = (a, b) => 0.6;
            });
            exitTasks.forEach((task) => {
                shadingUpdates[task.name] = (a, b) => 0.3;
            });
            console.log(
                'debounceViewerUpdates: Applying shading updates:',
                Object.keys(shadingUpdates),
            );
            Object.entries(shadingUpdates).forEach(
                ([taskName, shadingFunc]) => {
                    this.options.dataVizExtn.renderSurfaceShading(
                        taskName,
                        'Progress',
                        shadingFunc,
                    );
                },
            );
        }

        this.viewerUpdateQueue.clear();
        console.log('debounceViewerUpdates: Cleared viewerUpdateQueue');
    }

    flushEventQueue() {
        const events = Array.from(this.eventQueue.entries());
        console.log(
            'flushEventQueue: Processing events:',
            events.map(([id, { task, state }]) => ({
                id,
                state,
                task_name: task.name,
            })),
        );
        if (!events.length) return;

        events.forEach(([id, { task, state }]) => {
            console.log(
                `flushEventQueue: Triggering ${state} for task:`,
                task.name,
            );
            if (state === 'enter') {
                this.trigger_event('bar_enter', [task]);
            } else {
                this.trigger_event('bar_exit', [task]);
            }
            this.viewerUpdateQueue.set(id, { task, state });
        });

        this.eventQueue.clear();
        console.log('flushEventQueue: Cleared eventQueue');

        this.flushViewerUpdates();
    }

    flushViewerUpdates() {
        this.debounceViewerUpdates();
        this.lastViewerUpdate = performance.now();
    }

    reset_play() {
        const view_mode = this.options.view_mode || 'Day';
        let offsetUnit,
            offsetAmount = -2;
        switch (view_mode.toLowerCase()) {
            case 'hour':
                offsetUnit = 'hour';
                break;
            case 'quarter_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 6;
                break;
            case 'half_day':
                offsetUnit = 'hour';
                offsetAmount = -2 * 12;
                break;
            case 'day':
                offsetUnit = 'day';
                break;
            case 'week':
                offsetUnit = 'week';
                break;
            case 'month':
                offsetUnit = 'month';
                break;
            case 'year':
                offsetUnit = 'year';
                break;
            default:
                offsetUnit = 'day';
        }
        const baseDate = this.options.custom_marker_init_date
            ? new Date(this.options.custom_marker_init_date)
            : new Date(this.tasks[0]?._start || Date.now());
        let newDate = new Date(baseDate);
        if (offsetUnit === 'week') {
            newDate.setDate(baseDate.getDate() + offsetAmount * 7);
        } else if (offsetUnit === 'month') {
            newDate.setMonth(baseDate.getMonth() + offsetAmount);
        } else if (offsetUnit === 'year') {
            newDate.setFullYear(baseDate.getFullYear() + offsetAmount);
        } else {
            newDate = date_utils.add(baseDate, offsetAmount, offsetUnit);
        }
        this.config.custom_marker_date = newDate;
        console.log(
            `reset_play: view_mode=${view_mode}, baseDate=${baseDate}, offset=${offsetAmount} ${offsetUnit}, custom_marker_date=${this.config.custom_marker_date}`,
        );

        this.options.player_state = false;
        this.overlapping_tasks.clear();
        this.lastTaskY = null;
        clearInterval(this.player_interval);
        clearInterval(this.taskInterval);
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }
        this.flushEventQueue();
        this.flushViewerUpdates();
        this.eventQueue.clear();
        this.viewerUpdateQueue.clear();
        this.shadingNodeCache.clear();
        this.player_interval = null;
        this.taskInterval = null;

        if (this.$player_button) {
            if (this.options.player_use_fa) {
                this.$player_button.classList.remove('fa-pause');
                this.$player_button.classList.add('fa-play');
            } else {
                this.$player_button.textContent = 'Play';
            }
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

    create_el({
        left,
        top,
        width,
        height,
        id,
        classes,
        append_to,
        type,
        style,
    }) {
        let $el = document.createElement(type || 'div');
        for (let cls of classes.split(' ')) $el.classList.add(cls);
        if (top !== undefined) $el.style.top = top + 'px';
        if (left !== undefined) $el.style.left = left + 'px';

        if (id) $el.id = id;
        if (width) $el.style.width = width + 'px';
        if (height) $el.style.height = height + 'px';
        if (style) $el.style.cssText = style;
        if (append_to) append_to.appendChild($el);
        return $el;
    }

    make_dates() {
        this.get_dates_to_draw().forEach((date, i) => {
            if (date.lower_text) {
                let $lower_text = this.create_el({
                    left: date.x,
                    top: date.lower_y,
                    classes: 'lower-text date_' + sanitize(date.formatted_date),
                    append_to: this.$lower_header,
                });
                $lower_text.innerText = date.lower_text;
            }

            if (date.upper_text) {
                let $upper_text = this.create_el({
                    left: date.x,
                    top: date.upper_y,
                    classes: 'upper-text',
                    append_to: this.$upper_header,
                });
                $upper_text.innerText = date.upper_text;
            }
        });
        this.upperTexts = Array.from(
            this.$container.querySelectorAll('.upper-text'),
        );
    }

    get_dates_to_draw() {
        let last_date_info = null;
        const dates = this.dates.map((date, i) => {
            const d = this.get_date_info(date, last_date_info, i);
            last_date_info = d;
            return d;
        });
        return dates;
    }

    get_date_info(date, last_date_info) {
        let last_date = last_date_info ? last_date_info.date : null;

        let column_width = this.config.column_width;

        const x = last_date_info
            ? last_date_info.x + last_date_info.column_width
            : 0;

        let upper_text = this.config.view_mode.upper_text;
        let lower_text = this.config.view_mode.lower_text;

        if (!upper_text) {
            this.config.view_mode.upper_text = () => '';
        } else if (typeof upper_text === 'string') {
            this.config.view_mode.upper_text = (date) =>
                date_utils.format(date, upper_text, this.options.language);
        }

        if (!lower_text) {
            this.config.view_mode.lower_text = () => '';
        } else if (typeof lower_text === 'string') {
            this.config.view_mode.lower_text = (date) =>
                date_utils.format(date, lower_text, this.options.language);
        }

        return {
            date,
            formatted_date: sanitize(
                date_utils.format(
                    date,
                    this.config.date_format,
                    this.options.language,
                ),
            ),
            column_width: this.config.column_width,
            x,
            upper_text: this.config.view_mode.upper_text(
                date,
                last_date,
                this.options.language,
            ),
            lower_text: this.config.view_mode.lower_text(
                date,
                last_date,
                this.options.language,
            ),
            upper_y: 17,
            lower_y: this.options.upper_header_height + 5,
        };
    }

    make_bars() {
        this.bars = this.tasks.map((task) => {
            const bar = new Bar(this, task);
            this.layers.bar.appendChild(bar.group);
            return bar;
        });
    }

    make_arrows() {
        if (!this.tasks || !Array.isArray(this.tasks)) {
            console.warn('make_arrows: No tasks available to process arrows');
            this.arrows = [];
            return;
        }

        this.arrows = [];
        this.tasks.forEach((task) => {
            if (task.dependencies && Array.isArray(task.dependencies)) {
                task.dependencies.forEach((dep_id) => {
                    const dependency = this.get_task(dep_id);
                    if (!dependency) return;

                    const arrow = new Arrow(
                        this,
                        dependency._end,
                        task._start,
                        dependency._index,
                        task._index,
                    );
                    this.arrows.push(arrow);
                    console.log(
                        `make_arrows: Created arrow from task ${dependency.id} to ${task.id}`,
                    );
                });
            }
        });

        const layer = this.$svg.querySelector('.arrows');
        if (layer) {
            layer.innerHTML = '';
            this.arrows.forEach((arrow) => arrow.update());
        }
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

    set_dimensions() {
        const { width: cur_width } = this.$svg.getBoundingClientRect();
        const actual_width = this.$svg.querySelector('.grid .grid-row')
            ? this.$svg.querySelector('.grid .grid-row').getAttribute('width')
            : 0;
        if (cur_width < actual_width) {
            this.$svg.setAttribute('width', actual_width);
        }
    }

    set_scroll_position(date) {
        if (this.options.infinite_padding && (!date || date === 'start')) {
            let [min_start, ..._] = this.get_start_end_positions();
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
            (this.$container.scrollLeft + $el.clientWidth) /
                this.config.column_width,
            this.config.unit,
        );
        current_upper = this.config.view_mode.upper_text(
            this.current_date,
            null,
            this.options.language,
        );
        $el = this.upperTexts.find((el) => el.textContent === current_upper);
        $el.classList.add('current-upper');
        this.$current = $el;
    }

    scroll_current() {
        let res = this.get_closest_date();
        if (res) this.set_scroll_position(res[0]);
    }

    scroll_custom_marker() {
        const res = this.get_closest_date_to(this.config.custom_marker_date);
        if (!res) return;

        // Scrolling is handled by start_scroll_animation in player_update
        // Only handle end condition here
        if (
            this.config.player_end_date &&
            res[0] >= this.config.player_end_date
        ) {
            this.handle_animation_end();
        }
    }

    scroll_to_latest_task() {
        if (!this.tasks.length) return;

        // Find tasks active at the initial custom_marker_date (or use earliest start)
        const currentDate = this.config.custom_marker_date || this.gantt_start;
        const activeTasks = this.tasks.filter(
            (task) => task._start <= currentDate && currentDate <= task._end,
        );

        // If no active tasks, fall back to the task with the earliest start
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

        // Find the corresponding bar-wrapper element
        const barWrapper = this.$svg.querySelector(
            `.bar-wrapper[data-id="${targetTask.id}"]`,
        );

        let taskY;
        if (barWrapper) {
            // Get the y attribute from the bar-wrapper
            taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
            // Validate taskY; if 0, calculate based on index
            if (taskY === 0) {
                taskY =
                    this.config.header_height +
                    targetTask._index *
                        (this.options.bar_height + this.options.padding);
            }
        } else {
            // Fallback: calculate y based on task index
            taskY =
                this.config.header_height +
                targetTask._index *
                    (this.options.bar_height + this.options.padding);
        }

        // Store the initial taskY
        this.lastTaskY = taskY;

        // Adjust for header height to align with scroll container's coordinate system
        const adjustedY = taskY - this.config.header_height;

        // Calculate the desired scroll position to position the task near the top of the viewport
        const viewportHeight = this.$container.clientHeight;
        const offset = this.options.padding; // Small offset from top for visibility
        let targetScrollTop = adjustedY - offset;

        // Ensure scrollTop is within bounds
        const maxScrollTop = this.$container.scrollHeight - viewportHeight;
        const clampedScrollTop = Math.max(
            0,
            Math.min(targetScrollTop, maxScrollTop),
        );

        // Scroll to the calculated position
        this.$container.scrollTo({
            top: clampedScrollTop,
            behavior: 'smooth',
        });
    }

    player_update() {
        if (!this.options.player_state) {
            console.log('player_update: Exited, player_state is false');
            return;
        }

        if (
            this.config.player_end_date &&
            this.config.custom_marker_date >= this.config.player_end_date
        ) {
            console.log('player_update: Reached player_end_date, stopping');
            this.handle_animation_end();
            return;
        }

        this.config.custom_marker_date = date_utils.add(
            this.config.custom_marker_date,
            this.config.step,
            this.config.unit,
        );

        this.task_update(performance.now());

        const diff_in_units = date_utils.diff(
            this.config.custom_marker_date,
            this.gantt_start,
            this.config.unit,
        );
        const newLeft =
            (diff_in_units / this.config.step) * this.config.column_width;

        if (this.$animated_highlight && this.$animated_ball_highlight) {
            this.$animated_highlight.style.left = `${newLeft}px`;
            this.$animated_ball_highlight.style.left = `${newLeft - 2}px`;

            const animationDuration =
                (this.options.player_interval || 1000) / 1000;
            const moveDistance = this.config.column_width;

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
                    el.style.animation = `none`;
                    el.offsetHeight;
                    el.style.animation = `moveRight ${animationDuration}s linear forwards`;
                    el.style.animationPlayState = 'running';
                },
            );
        }

        this.start_scroll_animation(newLeft);
    }

    start_scroll_animation(startLeft) {
        // Cancel any existing animation frame
        if (this.scrollAnimationFrame) {
            cancelAnimationFrame(this.scrollAnimationFrame);
            this.scrollAnimationFrame = null;
        }

        // Exit if player is not active
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

        // Desired offset to keep highlight in view (e.g., 1/6th of viewport from left)
        const offset = viewportWidth / 6;

        const animateScroll = (currentTime) => {
            // Exit if player is not active
            if (!this.options.player_state) {
                console.log('animateScroll exited: player_state is false');
                this.scrollAnimationFrame = null;
                return;
            }

            const elapsed = (currentTime - startTime) / 1000; // Time in seconds
            const progress = Math.min(elapsed / animationDuration, 1); // Animation progress [0,1]
            const currentLeft = startLeft + moveDistance * progress; // Current highlight position

            // Calculate desired scroll position to keep highlight in view
            let targetScroll = currentLeft - offset;

            // Clamp scroll position to chart bounds
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));

            // Update horizontal scroll position
            container.scrollLeft = targetScroll;

            // Update vertical scroll to track the active task
            if (this.tasks.length) {
                // Find tasks active at the current custom_marker_date
                const currentDate = this.config.custom_marker_date;
                const activeTasks = this.tasks.filter(
                    (task) =>
                        task._start <= currentDate && currentDate <= task._end,
                );

                let taskY;
                if (activeTasks.length) {
                    // Select the task with the lowest _index (highest in chart)
                    const targetTask = activeTasks.reduce(
                        (min, task) => (task._index < min._index ? task : min),
                        activeTasks[0],
                    );

                    // Find the corresponding bar-wrapper element
                    const barWrapper = this.$svg.querySelector(
                        `.bar-wrapper[data-id="${targetTask.id}"]`,
                    );

                    if (barWrapper) {
                        // Get the y attribute from the bar-wrapper
                        taskY = parseFloat(barWrapper.getAttribute('y')) || 0;
                        // Validate taskY; if 0, calculate based on index
                        if (taskY === 0) {
                            taskY =
                                this.config.header_height +
                                targetTask._index *
                                    (this.options.bar_height +
                                        this.options.padding);
                        }
                    } else {
                        // Fallback: calculate y based on task index
                        taskY =
                            this.config.header_height +
                            targetTask._index *
                                (this.options.bar_height +
                                    this.options.padding);
                    }

                    // Update lastTaskY with the current task's y position
                    this.lastTaskY = taskY;
                } else if (this.lastTaskY !== null) {
                    // Use the last known taskY during gaps
                    taskY = this.lastTaskY;
                } else {
                    // Fallback: use the task with the earliest start
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

                    // Initialize lastTaskY
                    this.lastTaskY = taskY;
                }

                // Adjust for header height to align with scroll container's coordinate system
                const adjustedY = taskY - this.config.header_height;

                // Calculate the desired scroll position to position the task near the top of the viewport
                const viewportHeight = container.clientHeight;
                const verticalOffset = this.options.padding; // Small offset from top for visibility
                let targetScrollTop = adjustedY - verticalOffset;

                // Ensure scrollTop is within bounds
                const maxScrollTop = container.scrollHeight - viewportHeight;
                const clampedScrollTop = Math.max(
                    0,
                    Math.min(targetScrollTop, maxScrollTop),
                );

                // Update vertical scroll position
                container.scrollTop = clampedScrollTop;
            }

            // Check if animation should continue
            const res = this.get_closest_date_to(
                this.config.custom_marker_date,
            );
            const isBeyondEnd =
                res && this.config.player_end_date
                    ? res[0] >= this.config.player_end_date
                    : false;

            if (progress < 1 && !isBeyondEnd) {
                // Continue animation
                this.scrollAnimationFrame =
                    requestAnimationFrame(animateScroll);
            } else {
                this.scrollAnimationFrame = null;
                if (isBeyondEnd) {
                    this.handle_animation_end();
                }
            }
        };

        // Start animation
        this.scrollAnimationFrame = requestAnimationFrame(animateScroll);
    }

    handle_animation_end() {
        try {
            if (this.player_interval) {
                clearInterval(this.player_interval);
                this.player_interval = null;
            }
            if (this.taskInterval) {
                clearInterval(this.taskInterval);
                this.taskInterval = null;
            }
            if (this.scrollAnimationFrame) {
                cancelAnimationFrame(this.scrollAnimationFrame);
                this.scrollAnimationFrame = null;
            }
            this.flushEventQueue();
            this.flushViewerUpdates();
            this.eventQueue.clear();
            this.viewerUpdateQueue.clear();
            this.shadingNodeCache.clear();

            if (this.options.player_loop) {
                const view_mode = this.options.view_mode || 'Day';
                let offsetUnit,
                    offsetAmount = -2;
                switch (view_mode.toLowerCase()) {
                    case 'hour':
                        offsetUnit = 'hour';
                        break;
                    case 'quarter_day':
                        offsetUnit = 'hour';
                        offsetAmount = -2 * 6;
                        break;
                    case 'half_day':
                        offsetUnit = 'hour';
                        offsetAmount = -2 * 12;
                        break;
                    case 'day':
                        offsetUnit = 'day';
                        break;
                    case 'week':
                        offsetUnit = 'week';
                        break;
                    case 'month':
                        offsetUnit = 'month';
                        break;
                    case 'year':
                        offsetUnit = 'year';
                        break;
                    default:
                        offsetUnit = 'day';
                }
                const baseDate = this.options.custom_marker_init_date
                    ? new Date(this.options.custom_marker_init_date)
                    : new Date(this.tasks[0]?._start || Date.now());
                let newDate = new Date(baseDate);
                if (offsetUnit === 'week') {
                    newDate.setDate(baseDate.getDate() + offsetAmount * 7);
                } else if (offsetUnit === 'month') {
                    newDate.setMonth(baseDate.getMonth() + offsetAmount);
                } else if (offsetUnit === 'year') {
                    newDate.setFullYear(baseDate.getFullYear() + offsetAmount);
                } else {
                    newDate = date_utils.add(
                        baseDate,
                        offsetAmount,
                        offsetUnit,
                    );
                }
                this.config.custom_marker_date = newDate;
                console.log(
                    `handle_animation_end: view_mode=${view_mode}, baseDate=${baseDate}, offset=${offsetAmount} ${offsetUnit}, custom_marker_date=${this.config.custom_marker_date}`,
                );

                this.overlapping_tasks.clear();
                this.lastTaskY = null;
                this.reset_play();
                this.toggle_play();
            } else {
                this.options.player_state = false;
                this.overlapping_tasks.clear();
                this.lastTaskY = null;

                if (this.$player_button) {
                    if (this.options.player_use_fa) {
                        this.$player_button.classList.remove('fa-pause');
                        this.$player_button.classList.add('fa-play');
                    } else {
                        this.$player_button.textContent = 'Play';
                    }
                }

                if (this.$animated_highlight) {
                    this.$animated_highlight.style.animation = 'none';
                    this.$animated_highlight.style.animationPlayState =
                        'paused';
                }
                if (this.$animated_ball_highlight) {
                    this.$animated_ball_highlight.style.animation = 'none';
                    this.$animated_ball_highlight.style.animationPlayState =
                        'paused';
                }

                this.trigger_event('finish', []);
            }
        } catch (error) {
            console.error('Error in handle_animation_end:', error);
        }
    }

    get_closest_date_to(date) {
        let newDate = date;
        if (newDate < this.gantt_start || newDate > this.gantt_end) return null;

        let current = date,
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
                ) + ' ',
            ),
            el,
        ];
    }

    get_closest_date() {
        let now = new Date();
        if (now < this.gantt_start || now > this.gantt_end) return null;

        let current = new Date(),
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
                ) + ' ',
            ),
            el,
        ];
    }

    bind_grid_click() {
        $.on(
            this.$container,
            'click',
            '.grid-row, .grid-header, .ignored-bar, .holiday-highlight',
            () => {
                this.unselect_all();
                this.hide_popup();
            },
        );
    }

    bind_holiday_labels() {
        const $highlights =
            this.$container.querySelectorAll('.holiday-highlight');
        for (let h of $highlights) {
            const label = this.$container.querySelector(
                '.label_' + h.classList[1],
            );
            if (!label) continue;
            let timeout;
            h.onmouseenter = (e) => {
                timeout = setTimeout(() => {
                    label.classList.add('show');
                    label.style.left = (e.offsetX || e.layerX) + 'px';
                    label.style.top = (e.offsetY || e.layerY) + 'px';
                }, 300);
            };

            h.onmouseleave = (e) => {
                clearTimeout(timeout);
                label.classList.remove('show');
            };
        }
    }

    get_start_end_positions() {
        if (!this.bars.length) return [0, 0, 0];
        let { x, width } = this.bars[0].group.getBBox();
        let min_start = x;
        let max_start = x;
        let max_end = x + width;
        Array.prototype.forEach.call(this.bars, function ({ group }, i) {
            let { x, width } = group.getBBox();
            if (x < min_start) min_start = x;
            if (x > max_start) max_start = x;
            if (x + width > max_end) max_end = x + width;
        });
        return [min_start, max_start, max_end];
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

        const action_in_progress = () =>
            is_dragging || is_resizing_left || is_resizing_right;

        this.$svg.onclick = (e) => {
            if (e.target.classList.contains('grid-row')) this.unselect_all();
        };

        let pos = 0;
        $.on(this.$svg, 'mousemove', '.bar-wrapper, .handle', (e) => {
            if (
                this.bar_being_dragged === false &&
                Math.abs((e.offsetX || e.layerX) - pos) > 10
            )
                this.bar_being_dragged = true;
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
                    ...this.get_all_dependent_tasks(parent_bar_id),
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
            $.on(this.$container, 'mousewheel', (e) => {
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
            let localBars = [];
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
                ((e.currentTarget.scrollLeft + $el.clientWidth) /
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
                if (this.$current)
                    this.$current.classList.remove('current-upper');

                $el.classList.add('current-upper');
                this.$current = $el;
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
                localBars = ids.map((id) => this.get_bar(id));
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
                $bar.finaldx = this.get_snap_position(dx, $bar.ox);
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
            this.$container
                .querySelector('.visible')
                ?.classList?.remove?.('visible');
        });

        $.on(this.$svg, 'mouseup', (e) => {
            this.bar_being_dragged = null;
            bars.forEach((bar) => {
                const $bar = bar.$bar;
                if (!$bar.finaldx) return;
                bar.date_changed();
                bar.compute_progress();
                bar.set_action_completed();
            });
        });

        this.bind_bar_progress();
    }

    bind_bar_progress() {
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing = null;
        let bar = null;
        let $bar_progress = null;
        let $bar = null;

        $.on(this.$svg, 'mousedown', '.handle.progress', (e, handle) => {
            is_resizing = true;
            x_on_start = e.offsetX || e.layerX;
            y_on_start = e.offsetY || e.layerY;

            const $bar_wrapper = $.closest('.bar-wrapper', handle);
            const id = $bar_wrapper.getAttribute('data-id');
            bar = this.get_bar(id);

            $bar_progress = bar.$bar_progress;
            $bar = bar.$bar;

            $bar_progress.finaldx = 0;
            $bar_progress.owidth = $bar_progress.getWidth();
            $bar_progress.min_dx = -$bar_progress.owidth;
            $bar_progress.max_dx = $bar.getWidth() - $bar_progress.getWidth();
        });

        const range_positions = this.config.ignored_positions.map((d) => [
            d,
            d + this.config.column_width,
        ]);

        $.on(this.$svg, 'mousemove', (e) => {
            if (!is_resizing) return;
            let now_x = e.offsetX || e.layerX;

            let moving_right = now_x > x_on_start;
            if (moving_right) {
                let k = range_positions.find(
                    ([begin, end]) => now_x >= begin && now_x < end,
                );
                while (k) {
                    now_x = k[1];
                    k = range_positions.find(
                        ([begin, end]) => now_x >= begin && now_x < end,
                    );
                }
            } else {
                let k = range_positions.find(
                    ([begin, end]) => now_x > begin && now_x <= end,
                );
                while (k) {
                    now_x = k[0];
                    k = range_positions.find(
                        ([begin, end]) => now_x > begin && now_x <= end,
                    );
                }
            }

            let dx = now_x - x_on_start;
            if (dx > $bar_progress.max_dx) {
                dx = $bar_progress.max_dx;
            }
            if (dx < $bar_progress.min_dx) {
                dx = $bar_progress.min_dx;
            }

            $bar_progress.setAttribute('width', $bar_progress.owidth + dx);
            $.attr(
                bar.$handle_progression,
                $.attr(bar.$handle_progress, 'cx', $bar_progress.getEndX()),
            );

            $bar_progress.finaldx = dx;
        });

        $.on(this.$svg, 'mouseup', () => {
            is_resizing = false;
            if (!($bar_progress && $bar_progress.finaldx)) return;

            $bar_progress.finaldx = 0;
            bar.progress_changed();
            bar.set_action_completed();
            bar = null;
            $bar_progress = null;
            $bar = null;
        });
    }

    get_all_dependent_tasks(task_id) {
        let out = [];
        let to_process = [task_id];
        while (to_process.length) {
            const deps = to_process.reduce((acc, curr) => {
                acc = acc.concat(this.dependency_map[curr]);
                return acc;
            }, []);

            out = out.concat(deps);
            to_process = deps.filter((d) => !to_process.includes(d));
        }

        return out.filter(Boolean);
    }

    get_snap_position(dx, ox) {
        let unit_length = 1;
        const default_snap =
            this.options.snap_at || this.config.view_mode.snap_at || '1d';

        if (default_snap !== 'unit') {
            const { duration, scale } = date_utils.parse_duration(default_snap);
            unit_length =
                date_utils.convert_scales(this.config.view_mode.step, scale) /
                duration;
        }

        const rem = dx % (this.config.column_width / unit_length);

        let final_dx =
            dx -
            rem +
            (rem < (this.config.column_width / unit_length) * 2
                ? 0
                : this.config.column_width / unit_length);
        let final_pos = ox + final_dx;

        const drn = final_dx > 0 ? 1 : -1;
        let ignored_regions = this.get_ignored_region(final_pos, drn);
        while (ignored_regions.length) {
            final_pos += this.config.column_width * drn;
            ignored_regions = this.get_ignored_region(final_pos, drn);
            if (!ignored_regions.length)
                final_pos -= this.config.column_width * drn;
        }
        return final_pos - ox;
    }

    get_ignored_region(pos, drn = 1) {
        if (drn === 1) {
            return this.config.ignored_positions.filter((val) => {
                return pos > val && pos <= val + this.config.column_width;
            });
        } else {
            return this.config.ignored_positions.filter(
                (val) => pos >= val && pos < val + this.config.column_width,
            );
        }
    }

    unselect_all() {
        if (this.popup) this.popup.parent.classList.add('hide');
        this.$container
            .querySelectorAll('.date-range-highlight')
            .forEach((k) => k.classList.add('hide'));
    }

    view_is(modes) {
        if (typeof modes === 'string') {
            return this.config.view_mode.name === modes;
        }

        if (Array.isArray(modes)) {
            return modes.some(view_is);
        }

        return this.config.view_mode.name === modes.name;
    }

    get_task(id) {
        return this.tasks.find((task) => {
            return task.id === id;
        });
    }

    get_bar(id) {
        return this.bars.find((bar) => {
            return bar.task.id === id;
        });
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
        this.popup && this.popup.hide();
    }

    trigger_event(event, args) {
        if (this.options['on_' + event]) {
            this.options['on_' + event].apply(this, args);
        }
    }

    get_oldest_starting_date() {
        if (!this.tasks.length) return new Date();
        return this.tasks
            .map((task) => task._start)
            .reduce((prev_date, cur_date) =>
                cur_date <= prev_date ? cur_date : prev_date,
            );
    }

    clear() {
        this.$svg.innerHTML = '';
        this.$header?.remove?.();
        this.$side_header?.remove?.();
        this.$current_highlight?.remove?.();
        this.$current_ball_highlight?.remove?.();
        this.$extras?.remove?.();
        this.popup?.hide?.();
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

function generate_id(task) {
    return task.name + '_' + Math.random().toString(36).slice(2, 12);
}

function sanitize(s) {
    return s.replaceAll(' ', '_').replaceAll(':', '_').replaceAll('.', '_');
}
