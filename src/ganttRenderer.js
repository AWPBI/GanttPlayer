import { createSVG } from './svg_utils';
import date_utils from './date_utils';
import Arrow from './arrow';
import Bar from './bar';
import { generate_id, sanitize, create_el } from './utils';

export default class GanttRenderer {
    constructor(gantt) {
        this.gantt = gantt;
    }

    setup_layers() {
        this.gantt.layers = {};
        const layers = ['grid', 'arrow', 'progress', 'bar'];
        for (let layer of layers) {
            this.gantt.layers[layer] = createSVG('g', {
                class: layer,
                append_to: this.gantt.$svg,
            });
        }
        this.gantt.$extras = create_el({
            classes: 'extras',
            append_to: this.gantt.$container,
        });
        this.gantt.$adjust = create_el({
            classes: 'adjust hide',
            append_to: this.gantt.$extras,
            type: 'button',
        });
        this.gantt.$adjust.innerHTML = '←';
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
        const side_header_height = this.gantt.options.side_header_height || 30;
        const grid_width =
            this.gantt.dates.length * this.gantt.config.column_width;
        const grid_height = Math.max(
            this.gantt.config.header_height +
                side_header_height + // Add side header height
                this.gantt.options.padding +
                (this.gantt.options.bar_height + this.gantt.options.padding) *
                    this.gantt.tasks.length -
                10,
            this.gantt.options.container_height !== 'auto'
                ? this.gantt.options.container_height
                : 0,
        );

        createSVG('rect', {
            x: 0,
            y: side_header_height, // Offset SVG by side header height
            width: grid_width,
            height: grid_height,
            class: 'grid-background',
            append_to: this.gantt.$svg,
        });

        this.gantt.$svg.setAttribute('height', grid_height);
        this.gantt.$svg.setAttribute('width', '100%');
        this.gantt.grid_height = grid_height;
        if (this.gantt.options.container_height === 'auto') {
            this.gantt.$container.style.height =
                grid_height + side_header_height + 16 + 'px';
        }
    }

    make_grid_rows() {
        const rows_layer = createSVG('g', {
            append_to: this.gantt.layers.grid,
        });

        const row_width =
            this.gantt.dates.length * this.gantt.config.column_width;
        const row_height =
            this.gantt.options.bar_height + this.gantt.options.padding;

        for (
            let y = this.gantt.config.header_height;
            y < this.gantt.grid_height;
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
        const side_header_height = this.gantt.options.side_header_height || 30; // Default height for side header
        this.gantt.$header = create_el({
            width: this.gantt.dates.length * this.gantt.config.column_width,
            classes: 'grid-header',
            append_to: this.gantt.$container,
            style: `top: ${side_header_height}px;`, // Offset by side header height
        });

        this.gantt.$upper_header = create_el({
            classes: 'upper-header',
            append_to: this.gantt.$header,
        });
        this.gantt.$lower_header = create_el({
            classes: 'lower-header',
            append_to: this.gantt.$header,
        });
    }

    make_side_header() {
        // Create side header as a standalone element
        this.gantt.$side_header = create_el({
            classes: 'side-header',
            append_to: this.gantt.$container, // Append to container instead of upper_header
        });

        if (this.gantt.options.view_mode_select) {
            const $select = document.createElement('select');
            $select.classList.add('viewmode-select');

            const $el = document.createElement('option');
            $el.selected = true;
            $el.disabled = true;
            $el.textContent = 'Mode';
            $select.appendChild($el);

            for (const mode of this.gantt.options.view_modes) {
                const $option = document.createElement('option');
                $option.value = mode.name;
                $option.textContent = mode.name;
                if (mode.name === this.gantt.config.view_mode.name) {
                    $option.selected = true;
                }
                $select.appendChild($option);
            }

            $select.addEventListener('change', () => {
                this.gantt.viewManager.change_view_mode($select.value, true);
                this.gantt.reset_play();
                this.gantt.scrollManager.set_scroll_position('start');
            });
            this.gantt.$side_header.appendChild($select);
        }

        if (this.gantt.options.today_button) {
            let $today_button = document.createElement('button');
            $today_button.classList.add('today-button');
            $today_button.textContent = 'Today';
            $today_button.onclick = this.gantt.scroll_current.bind(this.gantt);
            this.gantt.$side_header.appendChild($today_button);
            this.gantt.$today_button = $today_button;
        }

        if (this.gantt.options.player_button) {
            let player_reset_button = document.createElement('button');
            player_reset_button.classList.add('player-reset-button');
            if (this.gantt.options.player_use_fa) {
                player_reset_button.classList.add('fas', 'fa-redo');
            } else {
                player_reset_button.textContent = 'Reset';
            }
            player_reset_button.onclick = this.gantt.reset_play.bind(
                this.gantt,
            );
            this.gantt.$side_header.appendChild(player_reset_button);
            this.gantt.$player_reset_button = player_reset_button;
        }

        if (this.gantt.options.player_button) {
            let $player_button = document.createElement('button');
            $player_button.classList.add('player-button');
            if (this.gantt.options.player_use_fa) {
                $player_button.classList.add('fas');
                if (this.gantt.options.player_state) {
                    $player_button.classList.add('fa-pause');
                } else {
                    $player_button.classList.add('fa-play');
                }
            } else {
                $player_button.textContent = 'Play';
            }
            $player_button.onclick = this.gantt.toggle_play.bind(this.gantt);
            this.gantt.$side_header.appendChild($player_button);
            this.gantt.$player_button = $player_button;
        }

        // Ensure side header is the first child of the container
        this.gantt.$container.prepend(this.gantt.$side_header);
    }

    make_grid_ticks() {
        if (this.gantt.options.lines === 'none') return;
        let tick_x = 0;
        let tick_y = this.gantt.config.header_height;
        let tick_height =
            this.gantt.grid_height - this.gantt.config.header_height;

        let $lines_layer = createSVG('g', {
            class: 'lines_layer',
            append_to: this.gantt.layers.grid,
        });

        const row_width =
            this.gantt.dates.length * this.gantt.config.column_width;
        const row_height =
            this.gantt.options.bar_height + this.gantt.options.padding;
        if (this.gantt.options.lines !== 'vertical') {
            let row_y = this.gantt.config.header_height;
            for (
                let y = this.gantt.config.header_height;
                y < this.gantt.grid_height;
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
        if (this.gantt.options.lines === 'horizontal') return;

        for (let date of this.gantt.dates) {
            let tick_class = 'tick';
            if (
                this.gantt.config.view_mode.thick_line &&
                this.gantt.config.view_mode.thick_line(date)
            ) {
                tick_class += ' thick';
            }

            createSVG('path', {
                d: `M ${tick_x} ${tick_y} v ${tick_height}`,
                class: tick_class,
                append_to: this.gantt.layers.grid,
            });

            if (this.gantt.view_is('month')) {
                tick_x +=
                    (date_utils.get_days_in_month(date) *
                        this.gantt.config.column_width) /
                    30;
            } else if (this.gantt.view_is('year')) {
                tick_x +=
                    (date_utils.get_days_in_year(date) *
                        this.gantt.config.column_width) /
                    365;
            } else {
                tick_x += this.gantt.config.column_width;
            }
        }
    }

    make_grid_highlights() {
        this.highlight_holidays();
        this.gantt.config.ignored_positions = [];

        const height =
            (this.gantt.options.bar_height + this.gantt.options.padding) *
            this.gantt.tasks.length;
        this.gantt.layers.grid.innerHTML += `<pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
          <path d="M-1,1 l2,-2
                   M0,4 l4,-4
                   M3,5 l2,-2"
                style="stroke:grey; stroke-width:0.3" />
        </pattern>`;

        for (
            let d = new Date(this.gantt.gantt_start);
            d <= this.gantt.gantt_end;
            d.setDate(d.getDate() + 1)
        ) {
            if (
                !this.gantt.config.ignored_dates.find(
                    (k) => k.getTime() === d.getTime(),
                ) &&
                (!this.gantt.config.ignored_function ||
                    !this.gantt.config.ignored_function(d))
            ) {
                continue;
            }
            let diff =
                date_utils.convert_scales(
                    date_utils.diff(d, this.gantt.gantt_start) + 'd',
                    this.gantt.config.unit,
                ) / this.gantt.config.step;

            this.gantt.config.ignored_positions.push(
                diff * this.gantt.config.column_width,
            );
            createSVG('rect', {
                x: diff * this.gantt.config.column_width,
                y: this.gantt.config.header_height,
                width: this.gantt.config.column_width,
                height: height,
                class: 'ignored-bar',
                style: 'fill: url(#diagonalHatch);',
                append_to: this.gantt.$svg,
            });
        }

        this.highlight_current();
        if (this.gantt.options.custom_marker) {
            if (
                !this.gantt.config.custom_marker_date ||
                isNaN(this.gantt.config.custom_marker_date.getTime())
            ) {
                this.gantt.config.custom_marker_date = new Date(
                    this.gantt.options.custom_marker_init_date ||
                        this.gantt.gantt_start,
                );
            }
            if (
                this.gantt.config.custom_marker_date < this.gantt.gantt_start ||
                this.gantt.config.custom_marker_date > this.gantt.gantt_end
            ) {
                this.gantt.config.custom_marker_date = new Date(
                    this.gantt.gantt_start,
                );
            }
            console.log(
                'make_grid_highlights: custom_marker_date=',
                this.gantt.config.custom_marker_date,
                'gantt_start=',
                this.gantt.gantt_start,
                'column_width=',
                this.gantt.config.column_width,
                'step=',
                this.gantt.config.step,
                'unit=',
                this.gantt.config.unit,
            );
            const diff = date_utils.diff(
                this.gantt.config.custom_marker_date,
                this.gantt.gantt_start,
                this.gantt.config.unit,
            );
            const left =
                (diff / this.gantt.config.step) *
                this.gantt.config.column_width;
            console.log('make_grid_highlights: calculated left=', left);
            this.render_animated_highlight(
                left,
                this.gantt.config.custom_marker_date,
            );
            this.gantt.eventQueueManager.initializeEventQueue();
        }
    }

    highlight_holidays() {
        let labels = {};
        if (!this.gantt.options.holidays) return;

        for (let color in this.gantt.options.holidays) {
            let check_highlight = this.gantt.options.holidays[color];
            if (check_highlight === 'weekend') {
                check_highlight = (d) => d.getDay() === 0 || d.getDay() === 6;
            }
            let extra_func;

            if (typeof check_highlight === 'object') {
                let f = check_highlight.find((k) => typeof k === 'function');
                if (f) {
                    extra_func = f;
                }
                if (check_highlight.name) {
                    let dateObj = new Date(check_highlight.date);
                    check_highlight = (d) => dateObj.getTime() === d.getTime();
                    labels[dateObj] = check_highlight.name;
                } else {
                    check_highlight = (d) =>
                        this.gantt.options.holidays[color]
                            .filter((k) => typeof k !== 'function')
                            .map((k) => {
                                if (k.name) {
                                    let dateObj = new Date(k.date);
                                    labels[dateObj] = k.name;
                                    return dateObj.getTime();
                                }
                                return new Date(k).getTime();
                            })
                            .includes(d.getTime());
                }
            }
            for (
                let d = new Date(this.gantt.gantt_start);
                d <= this.gantt.gantt_end;
                d.setDate(d.getDate() + 1)
            ) {
                if (
                    this.gantt.config.ignored_dates.find(
                        (k) => k.getTime() === d.getTime(),
                    ) ||
                    (this.gantt.config.ignored_function &&
                        this.gantt.config.ignored_function(d))
                ) {
                    continue;
                }
                if (check_highlight(d) || (extra_func && extra_func(d))) {
                    const x =
                        (date_utils.diff(
                            d,
                            this.gantt.gantt_start,
                            this.gantt.config.unit,
                        ) /
                            this.gantt.config.step) *
                        this.gantt.config.column_width;
                    const height =
                        this.gantt.grid_height -
                        this.gantt.config.header_height;
                    const d_formatted = date_utils
                        .format(d, 'YYYY-MM-DD', this.gantt.options.language)
                        .replace(' ', '_');

                    if (labels[d]) {
                        let label = create_el({
                            classes: 'holiday-label ' + 'label_' + d_formatted,
                            append_to: this.gantt.$extras,
                        });
                        label.textContent = labels[d];
                    }
                    createSVG('rect', {
                        x: Math.round(x),
                        y: this.gantt.config.header_height,
                        width:
                            this.gantt.config.column_width /
                            date_utils.convert_scales(
                                this.gantt.config.view_mode.step,
                                'day',
                            ),
                        height,
                        class: 'holiday-highlight ' + d_formatted,
                        style: `fill: ${color};`,
                        append_to: this.gantt.layers.grid,
                    });
                }
            }
        }
    }

    highlight_current() {
        const res = this.gantt.scrollManager.get_closest_date();
        if (!res) return null;

        const [_, el] = res;
        el.classList.add('current-date-highlight');

        const dateObj = new Date();
        const side_header_height = this.gantt.options.side_header_height || 30;

        const diff_in_units = date_utils.diff(
            dateObj,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );

        const left =
            (diff_in_units / this.gantt.config.step) *
            this.gantt.config.column_width;

        this.gantt.$current_highlight = create_el({
            top: this.gantt.config.header_height + side_header_height,
            left,
            height:
                this.gantt.grid_height -
                this.gantt.config.header_height -
                side_header_height,
            classes: 'current-highlight',
            append_to: this.gantt.$container,
        });
        this.gantt.$current_ball_highlight = create_el({
            top: this.gantt.config.header_height + side_header_height - 6,
            left: left - 2.5,
            width: 6,
            height: 6,
            classes: 'current-ball-highlight',
            append_to: this.gantt.$header,
        });
        return { left, dateObj };
    }

    render_animated_highlight(left, dateObj) {
        let adjustedDateObj = dateObj || this.gantt.config.custom_marker_date;
        let adjustedLeft = left;
        const side_header_height = this.gantt.options.side_header_height || 30;

        if (!adjustedDateObj || isNaN(adjustedDateObj.getTime())) {
            adjustedDateObj = new Date(this.gantt.gantt_start);
            adjustedLeft = 0;
        } else {
            adjustedLeft =
                (date_utils.diff(
                    adjustedDateObj,
                    this.gantt.gantt_start,
                    this.gantt.config.unit,
                ) /
                    this.gantt.config.step) *
                this.gantt.config.column_width;
        }

        console.log(
            'render_animated_highlight: left=',
            left,
            'adjustedLeft=',
            adjustedLeft,
            'dateObj=',
            dateObj,
            'adjustedDateObj=',
            adjustedDateObj,
            'gantt_start=',
            this.gantt.gantt_start,
            'column_width=',
            this.gantt.config.column_width,
            'step=',
            this.gantt.config.step,
            'unit=',
            this.gantt.config.unit,
        );

        let gridHeight = this.gantt.grid_height;
        if (!gridHeight) {
            gridHeight = Math.max(
                this.gantt.config.header_height +
                    side_header_height +
                    this.gantt.options.padding +
                    (this.gantt.options.bar_height +
                        this.gantt.options.padding) *
                        this.gantt.tasks.length -
                    10,
                this.gantt.options.container_height !== 'auto'
                    ? this.gantt.options.container_height
                    : 0,
            );
        }
        const gridElement = this.gantt.$svg.querySelector('.grid-background');
        if (gridElement) {
            gridHeight =
                parseFloat(gridElement.getAttribute('height')) || gridHeight;
        }
        console.log('render_animated_highlight: gridHeight=', gridHeight);

        if (!this.gantt.$animated_highlight) {
            this.gantt.$animated_highlight = create_el({
                top: this.gantt.config.header_height + side_header_height,
                left: adjustedLeft,
                width: 2,
                height:
                    gridHeight -
                    this.gantt.config.header_height -
                    side_header_height,
                classes: 'animated-highlight',
                append_to: this.gantt.$container,
                style: 'background: var(--g-custom-highlight); z-index: 999;',
            });
        } else {
            this.gantt.$animated_highlight.style.left = `${adjustedLeft}px`;
            this.gantt.$animated_highlight.style.height = `${
                gridHeight -
                this.gantt.config.header_height -
                side_header_height
            }px`;
            this.gantt.$animated_highlight.offsetHeight;
        }

        if (!this.gantt.$animated_ball_highlight) {
            this.gantt.$animated_ball_highlight = create_el({
                top: this.gantt.config.header_height + side_header_height - 6,
                left: adjustedLeft - 2,
                width: 6,
                height: 6,
                classes: 'animated-ball-highlight',
                append_to: this.gantt.$container,
                style: 'background: var(--g-custom-highlight); border-radius: 50%; z-index: 1001;',
            });
        } else {
            this.gantt.$animated_ball_highlight.style.left = `${adjustedLeft - 2}px`;
            this.gantt.$animated_ball_highlight.offsetHeight;
        }

        return {
            left: adjustedLeft,
            dateObj: adjustedDateObj,
        };
    }

    set_dimensions() {
        const { width: cur_width } = this.gantt.$svg.getBoundingClientRect();
        const actual_width = this.gantt.$svg.querySelector('.grid .grid-row')
            ? this.gantt.$svg
                  .querySelector('.grid .grid-row')
                  .getAttribute('width')
            : 0;
        if (cur_width < actual_width) {
            this.gantt.$svg.setAttribute('width', actual_width);
        }
    }

    make_dates() {
        const side_header_height = this.gantt.options.side_header_height || 30;
        this.get_dates_to_draw().forEach((date) => {
            if (date.lower_text) {
                let $lower_text = create_el({
                    left: date.x,
                    top: date.lower_y,
                    classes: 'lower-text date_' + sanitize(date.formatted_date),
                    append_to: this.gantt.$lower_header,
                    dataset: { initialLeft: date.x }, // Store initial left position
                });
                $lower_text.innerText = date.lower_text;
            }

            if (date.upper_text) {
                let $upper_text = create_el({
                    left: date.x,
                    top: date.upper_y,
                    classes: 'upper-text',
                    append_to: this.gantt.$upper_header,
                    dataset: { initialLeft: date.x }, // Store initial left position
                });
                $upper_text.innerText = date.upper_text;
            }
        });
        this.gantt.upperTexts = Array.from(
            this.gantt.$container.querySelectorAll('.upper-text'),
        );
        this.gantt.lowerTexts = Array.from(
            this.gantt.$container.querySelectorAll('.lower-text'),
        );
    }

    get_dates_to_draw() {
        let last_date_info = null;
        const dates = this.gantt.dates.map((date, i) => {
            const d = this.get_date_info(date, last_date_info, i);
            last_date_info = d;
            return d;
        });
        return dates;
    }

    get_date_info(date, last_date_info, i) {
        let last_date = last_date_info ? last_date_info.date : null;

        let column_width = this.gantt.config.column_width;

        const x = last_date_info
            ? last_date_info.x + last_date_info.column_width
            : 0;

        let upper_text = this.gantt.config.view_mode.upper_text;
        let lower_text = this.gantt.config.view_mode.lower_text;

        if (!upper_text) {
            this.gantt.config.view_mode.upper_text = () => '';
        } else if (typeof upper_text === 'string') {
            this.gantt.config.view_mode.upper_text = (date) =>
                date_utils.format(
                    date,
                    upper_text,
                    this.gantt.options.language,
                );
        }

        if (!lower_text) {
            this.gantt.config.view_mode.lower_text = () => '';
        } else if (typeof lower_text === 'string') {
            this.gantt.config.view_mode.lower_text = (date) =>
                date_utils.format(
                    date,
                    lower_text,
                    this.gantt.options.language,
                );
        }

        return {
            date,
            formatted_date: sanitize(
                date_utils.format(
                    date,
                    this.gantt.config.date_format,
                    this.gantt.options.language,
                ),
            ),
            column_width: this.gantt.config.column_width,
            x,
            upper_text: this.gantt.config.view_mode.upper_text(
                date,
                last_date,
                this.gantt.options.language,
            ),
            lower_text: this.gantt.config.view_mode.lower_text(
                date,
                last_date,
                this.gantt.options.language,
            ),
            upper_y: 17,
            lower_y: this.gantt.options.upper_header_height + 5,
        };
    }

    make_bars() {
        this.gantt.bars = this.gantt.tasks.map((task) => {
            const bar = new Bar(this.gantt, task);
            this.gantt.layers.bar.appendChild(bar.group);
            return bar;
        });
    }

    make_arrows() {
        this.gantt.arrows = [];
        for (let task of this.gantt.tasks) {
            let arrows = [];
            arrows = task.dependencies
                .map((task_id) => {
                    const dependency = this.gantt.get_task(task_id);
                    if (!dependency) return null;
                    const arrow = new Arrow(
                        this.gantt,
                        this.gantt.bars[dependency._index],
                        this.gantt.bars[task._index],
                    );
                    this.gantt.layers.arrow.appendChild(arrow.element);
                    return arrow;
                })
                .filter(Boolean);
            this.gantt.arrows = this.gantt.arrows.concat(arrows);
        }
    }
}
