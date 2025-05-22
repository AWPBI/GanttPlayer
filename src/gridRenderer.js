import date_utils from './date_utils';
import { $, createSVG } from './svg_utils';

export default class GridRenderer {
    constructor(gantt) {
        this.gantt = gantt;
    }

    renderGrid() {
        this.makeBackground();
        this.makeRows();
        this.makeHeader();
        this.makeTicks();
        this.makeHighlights();
    }

    makeBackground() {
        const { gantt } = this;
        const gridWidth = gantt.dates.length * gantt.config.column_width;
        const gridHeight = Math.max(
            gantt.config.header_height +
                gantt.options.padding +
                (gantt.options.bar_height + gantt.options.padding) *
                    gantt.taskManager.tasks.length,
            gantt.options.container_height !== 'auto'
                ? gantt.options.container_height
                : 0,
        );

        createSVG('rect', {
            x: 0,
            y: 0,
            width: gridWidth,
            height: gridHeight,
            class: 'grid-background',
            append_to: gantt.$svg,
        });

        $.attr(gantt.$svg, { height: gridHeight, width: '100%' });
        gantt.grid_height = gridHeight;
        if (gantt.options.container_height === 'auto') {
            gantt.$container.style.height = `${gridHeight + 16}px`;
        }
    }

    makeRows() {
        const { gantt } = this;
        const rowsLayer = createSVG('g', { append_to: gantt.layers.grid });
        const rowWidth = gantt.dates.length * gantt.config.column_width;
        const rowHeight = gantt.options.bar_height + gantt.options.padding;

        for (
            let y = gantt.config.header_height;
            y < gantt.grid_height;
            y += rowHeight
        ) {
            createSVG('rect', {
                x: 0,
                y,
                width: rowWidth,
                height: rowHeight,
                class: 'grid-row',
                append_to: rowsLayer,
            });
        }
    }

    makeHeader() {
        const { gantt } = this;
        gantt.$header = gantt.createElement({
            width: gantt.dates.length * gantt.config.column_width,
            classes: 'grid-header',
            append_to: gantt.$container,
        });
        gantt.$upperHeader = gantt.createElement({
            classes: 'upper-header',
            append_to: gantt.$header,
        });
        gantt.$lowerHeader = gantt.createElement({
            classes: 'lower-header',
            append_to: gantt.$header,
        });

        this.makeSideHeader();
        this.makeDates();
    }

    makeSideHeader() {
        const { gantt } = this;
        gantt.$sideHeader = gantt.createElement({
            classes: 'side-header',
            append_to: gantt.$upperHeader,
        });

        if (gantt.options.view_mode_select) {
            const $select = document.createElement('select');
            $select.classList.add('viewmode-select');
            $select.innerHTML =
                `<option selected disabled>Mode</option>` +
                gantt.options.view_modes
                    .map(
                        (mode) =>
                            `<option value="${mode.name}"${mode.name === gantt.config.view_mode.name ? ' selected' : ''}>${mode.name}</option>`,
                    )
                    .join('');
            $select.addEventListener('change', () =>
                gantt.changeViewMode($select.value, true),
            );
            gantt.$sideHeader.appendChild($select);
        }

        if (gantt.options.today_button) {
            gantt.$todayButton = gantt.createElement({
                type: 'button',
                classes: 'today-button',
                append_to: gantt.$sideHeader,
                textContent: 'Today',
            });
            gantt.$todayButton.onclick = () => gantt.scrollCurrent();
        }

        if (gantt.options.player_button) {
            gantt.$playerResetButton = gantt.createElement({
                type: 'button',
                classes: 'player-reset-button',
                append_to: gantt.$sideHeader,
                textContent: gantt.options.player_use_fa ? '' : 'Reset',
            });
            if (gantt.options.player_use_fa)
                gantt.$playerResetButton.classList.add('fas', 'fa-redo');
            gantt.$playerResetButton.onclick = () =>
                gantt.animationManager.reset();

            gantt.$playerButton = gantt.createElement({
                type: 'button',
                classes: 'player-button',
                append_to: gantt.$sideHeader,
                textContent: gantt.options.player_use_fa ? '' : 'Play',
            });
            if (gantt.options.player_use_fa) {
                gantt.$playerButton.classList.add(
                    'fas',
                    gantt.options.player_state ? 'fa-pause' : 'fa-play',
                );
            }
            gantt.$playerButton.onclick = () =>
                gantt.animationManager.togglePlay();
        }
    }

    makeDates() {
        const { gantt } = this;
        gantt.getDatesToDraw().forEach((date) => {
            if (date.lower_text) {
                gantt.createElement({
                    left: date.x,
                    top: date.lower_y,
                    classes: `lower-text date_${sanitize(date.formatted_date)}`,
                    append_to: gantt.$lowerHeader,
                    textContent: date.lower_text,
                });
            }
            if (date.upper_text) {
                gantt.createElement({
                    left: date.x,
                    top: date.upper_y,
                    classes: 'upper-text',
                    append_to: gantt.$upperHeader,
                    textContent: date.upper_text,
                });
            }
        });
        gantt.upperTexts = Array.from(
            gantt.$container.querySelectorAll('.upper-text'),
        );
    }

    makeTicks() {
        const { gantt } = this;
        if (gantt.options.lines === 'none') return;
        const linesLayer = createSVG('g', {
            class: 'lines_layer',
            append_to: gantt.layers.grid,
        });
        const rowWidth = gantt.dates.length * gantt.config.column_width;
        const rowHeight = gantt.options.bar_height + gantt.options.padding;

        if (gantt.options.lines !== 'vertical') {
            let y = gantt.config.header_height;
            while (y < gantt.grid_height) {
                createSVG('line', {
                    x1: 0,
                    y1: y + rowHeight,
                    x2: rowWidth,
                    y2: y + rowHeight,
                    class: 'row-line',
                    append_to: linesLayer,
                });
                y += rowHeight;
            }
        }

        if (gantt.options.lines !== 'horizontal') {
            let tickX = 0;
            gantt.dates.forEach((date) => {
                const tickClass =
                    gantt.config.view_mode.thick_line &&
                    gantt.config.view_mode.thick_line(date)
                        ? 'tick thick'
                        : 'tick';
                createSVG('path', {
                    d: `M ${tickX} ${gantt.config.header_height} v ${gantt.grid_height - gantt.config.header_height}`,
                    class: tickClass,
                    append_to: gantt.layers.grid,
                });
                tickX += gantt.viewIs('month')
                    ? (date_utils.get_days_in_month(date) *
                          gantt.config.column_width) /
                      30
                    : gantt.viewIs('year')
                      ? (date_utils.get_days_in_year(date) *
                            gantt.config.column_width) /
                        365
                      : gantt.config.column_width;
            });
        }
    }

    makeHighlights() {
        const { gantt } = this;
        if (gantt.options.holidays) {
            const labels = {};
            for (const [color, checkHighlight] of Object.entries(
                gantt.options.holidays,
            )) {
                let checkFn =
                    typeof checkHighlight === 'string' &&
                    checkHighlight === 'weekend'
                        ? (d) => d.getDay() === 0 || d.getDay() === 6
                        : Array.isArray(checkHighlight)
                          ? (d) =>
                                checkHighlight.some(
                                    (k) =>
                                        new Date(k.date + ' ').getTime() ===
                                        d.getTime(),
                                )
                          : checkHighlight;

                for (
                    let d = new Date(gantt.gantt_start);
                    d <= gantt.gantt_end;
                    d.setDate(d.getDate() + 1)
                ) {
                    if (
                        gantt.config.ignored_dates.some(
                            (k) => k.getTime() === d.getTime(),
                        ) ||
                        (gantt.config.ignored_function &&
                            gantt.config.ignored_function(d))
                    )
                        continue;

                    if (checkFn(d)) {
                        const x =
                            (date_utils.diff(
                                d,
                                gantt.gantt_start,
                                gantt.config.unit,
                            ) /
                                gantt.config.step) *
                            gantt.config.column_width;
                        createSVG('rect', {
                            x: Math.round(x),
                            y: gantt.config.header_height,
                            width:
                                gantt.config.column_width /
                                date_utils.convert_scales(
                                    gantt.config.view_mode.step,
                                    'day',
                                ),
                            height:
                                gantt.grid_height - gantt.config.header_height,
                            class: `holiday-highlight ${sanitize(date_utils.format(d, 'YYYY-MM-DD', gantt.options.language))}`,
                            style: `fill: ${color};`,
                            append_to: gantt.layers.grid,
                        });
                    }
                }
            }
        }

        const now = new Date();
        if (now >= gantt.gantt_start && now <= gantt.gantt_end) {
            const left =
                (date_utils.diff(now, gantt.gantt_start, gantt.config.unit) /
                    gantt.config.step) *
                gantt.config.column_width;
            gantt.$currentHighlight = gantt.createElement({
                top: gantt.config.header_height,
                left,
                height: gantt.grid_height - gantt.config.header_height,
                classes: 'current-highlight',
                append_to: gantt.$container,
            });
            gantt.$currentBallHighlight = gantt.createElement({
                top: gantt.config.header_height - 6,
                left: left - 2.5,
                width: 6,
                height: 6,
                classes: 'current-ball-highlight',
                append_to: gantt.$header,
            });
        }
    }
}
