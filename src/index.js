import date_utils from './date_utils';
import { $, createSVG } from './svg_utils';

import Arrow from './arrow';
import TaskManager from './taskManager';
import GridRenderer from './gridRenderer';
import AnimationManager from './animationManager';
import EventQueueManager from './eventQueueManager';
import EventBinder from './eventBinder';
import PopupManager from './popupManager';

import { DEFAULT_OPTIONS, DEFAULT_VIEW_MODES } from './defaults';

import './styles/gantt.css';

export default class Gantt {
    constructor(wrapper, tasks, options) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.config = {
            step: 1,
            unit: 'day',
            column_width: this.options.column_width || 45,
            header_height:
                this.options.lower_header_height +
                this.options.upper_header_height +
                10,
            ignored_dates: [],
            ignored_positions: [],
            custom_marker_date: new Date(
                this.options.custom_marker_init_date || Date.now(),
            ),
            player_end_date: this.options.player_end_date
                ? new Date(this.options.player_end_date)
                : null,
            view_mode: this.options.view_mode,
        };

        this.setupWrapper(wrapper);
        this.setupOptions();
        this.taskManager = new TaskManager(this);
        this.taskManager.setupTasks(tasks);
        this.gridRenderer = new GridRenderer(this);
        this.animationManager = new AnimationManager(this);
        this.eventQueueManager = new EventQueueManager(this);
        this.eventBinder = new EventBinder(this);
        this.popupManager = new PopupManager(this);
        this.layers = {};
        this.dates = [];
        this.arrows = [];
        this.changeViewMode();
        this.eventBinder.bindEvents();
        this.animationManager.initialize();
    }

    setupWrapper(element) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
            if (!element) {
                throw new ReferenceError(`CSS selector "${element}" not found`);
            }
        }
        if (
            !(element instanceof HTMLElement) &&
            !(element instanceof SVGElement)
        ) {
            throw new TypeError(
                'Gantt requires a string CSS selector, HTML, or SVG element',
            );
        }

        this.$svg =
            element instanceof SVGElement
                ? element
                : createSVG('svg', {
                      append_to: element,
                      class: 'gantt',
                  });
        this.$svg.classList.add('gantt');
        this.$container = this.createElement({
            classes: 'gantt-container',
            append_to: this.$svg.parentElement,
        });
        this.$container.appendChild(this.$svg);
        this.$popup_wrapper = this.createElement({
            classes: 'popup-wrapper',
            append_to: this.$container,
        });
    }

    setupOptions() {
        const cssVars = {
            'grid-height': 'container_height',
            'bar-height': 'bar_height',
            'lower-header-height': 'lower_header_height',
            'upper-header-height': 'upper_header_height',
        };
        for (const [css, prop] of Object.entries(cssVars)) {
            if (this.options[prop] !== 'auto') {
                this.$container.style.setProperty(
                    `--gv-${css}`,
                    `${this.options[prop]}px`,
                );
            }
        }

        if (this.options.ignore) {
            if (typeof this.options.ignore === 'string') {
                this.config.ignored_dates.push(new Date(this.options.ignore));
            } else if (Array.isArray(this.options.ignore)) {
                this.options.ignore.forEach((opt) => {
                    if (typeof opt === 'string') {
                        if (opt === 'weekend') {
                            this.config.ignored_function = (d) =>
                                d.getDay() === 6 || d.getDay() === 0;
                        } else {
                            this.config.ignored_dates.push(new Date(opt));
                        }
                    } else {
                        this.config.ignored_function = opt;
                    }
                });
            } else {
                this.config.ignored_function = this.options.ignore;
            }
        }
    }

    changeViewMode(mode = this.options.view_mode, maintainPos = false) {
        const oldScroll = maintainPos ? this.$container.scrollLeft : null;
        this.config.view_mode =
            typeof mode === 'string'
                ? this.options.view_modes.find((m) => m.name === mode)
                : mode;
        this.options.view_mode = this.config.view_mode.name;
        this.updateViewScale();
        this.setupDates();
        this.render();
        if (maintainPos) this.$container.scrollLeft = oldScroll;
        this.triggerEvent('view_change', [this.config.view_mode]);
    }

    updateViewScale() {
        const { duration, scale } = date_utils.parse_duration(
            this.config.view_mode.step,
        );
        this.config.step = duration;
        this.config.unit = scale;
        this.config.column_width =
            this.options.column_width ||
            this.config.view_mode.column_width ||
            45;
        this.$container.style.setProperty(
            '--gv-column-width',
            `${this.config.column_width}px`,
        );
    }

    setupDates() {
        const tasks = this.taskManager.tasks;
        this.gantt_start = tasks.length
            ? tasks.reduce(
                  (min, t) => (t._start < min ? t._start : min),
                  tasks[0]._start,
              )
            : new Date();
        this.gantt_end = tasks.length
            ? tasks.reduce(
                  (max, t) => (t._end > max ? t._end : max),
                  tasks[0]._end,
              )
            : new Date();

        this.gantt_start = date_utils.start_of(
            this.gantt_start,
            this.config.unit,
        );
        this.gantt_end = date_utils.start_of(this.gantt_end, this.config.unit);

        this.gantt_start = date_utils.add(
            this.gantt_start,
            -1,
            this.config.unit,
        );
        this.gantt_end = date_utils.add(this.gantt_end, 1, this.config.unit);

        this.dates = [this.gantt_start];
        let curDate = this.gantt_start;
        while (curDate < this.gantt_end) {
            curDate = date_utils.add(
                curDate,
                this.config.step,
                this.config.unit,
            );
            this.dates.push(curDate);
        }
    }

    render() {
        this.clear();
        this.setupLayers();
        this.gridRenderer.renderGrid();
        this.taskManager.makeBars();
        this.makeArrows();
        this.setDimensions();
        this.animationManager.playAnimatedHighlight();
    }

    setupLayers() {
        ['grid', 'arrow', 'progress', 'bar'].forEach((layer) => {
            this.layers[layer] = createSVG('g', {
                class: layer,
                append_to: this.$svg,
            });
        });
        this.$extras = this.createElement({
            classes: 'extras',
            append_to: this.$container,
        });
        this.$adjust = this.createElement({
            classes: 'adjust hide',
            append_to: this.$extras,
            type: 'button',
            textContent: '←',
        });
    }

    makeArrows() {
        this.arrows = [];
        for (const task of this.taskManager.tasks) {
            const arrows = task.dependencies
                .map((taskId) => {
                    const dependency = this.taskManager.getTask(taskId);
                    if (!dependency) return null;
                    const arrow = new Arrow(
                        this,
                        this.taskManager.getBar(dependency.id),
                        this.taskManager.getBar(task.id),
                    );
                    this.layers.arrow.appendChild(arrow.element);
                    return arrow;
                })
                .filter(Boolean);
            this.arrows.push(...arrows);
        }
        this.taskManager.bars.forEach((bar) => {
            bar.arrows = this.arrows.filter(
                (arrow) =>
                    arrow.from_task.task.id === bar.task.id ||
                    arrow.to_task.task.id === bar.task.id,
            );
        });
    }

    setDimensions() {
        const actualWidth =
            this.$svg.querySelector('.grid .grid-row')?.getAttribute('width') ||
            0;
        this.$svg.setAttribute('width', actualWidth);
    }

    scrollCurrent() {
        const now = new Date();
        if (now < this.gantt_start || now > this.gantt_end) return;
        const left =
            (date_utils.diff(now, this.gantt_start, this.config.unit) /
                this.config.step) *
            this.config.column_width;
        this.$container.scrollTo({
            left: left - this.config.column_width / 6,
            behavior: 'smooth',
        });
    }

    scrollToLatestTask() {
        if (!this.taskManager.tasks.length) return;
        const targetTask = this.taskManager.tasks.reduce(
            (earliest, task) =>
                task._start < earliest._start ? task : earliest,
            this.taskManager.tasks[0],
        );
        const taskY =
            this.config.header_height +
            targetTask._index *
                (this.options.bar_height + this.options.padding);
        this.$container.scrollTo({
            top: taskY - this.config.header_height,
            behavior: 'smooth',
        });
    }

    getDatesToDraw() {
        let lastDateInfo = null;
        return this.dates.map((date) => {
            const info = this.getDateInfo(date, lastDateInfo);
            lastDateInfo = info;
            return info;
        });
    }

    getDateInfo(date, lastDateInfo) {
        const x = lastDateInfo ? lastDateInfo.x + lastDateInfo.column_width : 0;
        const upperText =
            typeof this.config.view_mode.upper_text === 'string'
                ? date_utils.format(
                      date,
                      this.config.view_mode.upper_text,
                      this.options.language,
                  )
                : this.config.view_mode.upper_text?.(
                      date,
                      lastDateInfo?.date,
                      this.options.language,
                  ) || '';
        const lowerText =
            typeof this.config.view_mode.lower_text === 'string'
                ? date_utils.format(
                      date,
                      this.config.view_mode.lower_text,
                      this.options.language,
                  )
                : this.config.view_mode.lower_text?.(
                      date,
                      lastDateInfo?.date,
                      this.options.language,
                  ) || '';

        return {
            date,
            formatted_date: sanitize(
                date_utils.format(
                    date,
                    this.config.view_mode.date_format ||
                        this.options.date_format,
                    this.options.language,
                ),
            ),
            column_width: this.config.column_width,
            x,
            upper_text: upperText,
            lower_text: lowerText,
            upper_y: 17,
            lower_y: this.options.upper_header_height + 5,
        };
    }

    createElement({
        classes = '',
        append_to,
        type = 'div',
        textContent,
        ...styles
    }) {
        const $el = document.createElement(type);
        classes.split(' ').forEach((cls) => cls && $el.classList.add(cls));
        Object.assign($el.style, styles);
        if (textContent) $el.textContent = textContent;
        if (append_to) append_to.appendChild($el);
        return $el;
    }

    getSnapPosition(dx, ox) {
        const unitLength = this.options.snap_at
            ? date_utils.parse_duration(this.options.snap_at).duration
            : 1;
        const rem = dx % (this.config.column_width / unitLength);
        return (
            ox +
            (dx -
                rem +
                (rem < (this.config.column_width / unitLength) * 2
                    ? 0
                    : this.config.column_width / unitLength))
        );
    }

    viewIs(modes) {
        if (typeof modes === 'string')
            return this.config.view_mode.name === modes;
        return Array.isArray(modes)
            ? modes.includes(this.config.view_mode.name)
            : this.config.view_mode.name === modes.name;
    }

    triggerEvent(event, args) {
        if (this.options[`on_${event}`]) {
            this.options[`on_${event}`].apply(this, args);
        }
    }

    clear() {
        this.$svg.innerHTML = '';
        this.$header?.remove();
        this.$sideHeader?.remove();
        this.$currentHighlight?.remove();
        this.$currentBallHighlight?.remove();
        this.$extras?.remove();
        this.popupManager.hide();
        this.animationManager.stopAnimations();
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
