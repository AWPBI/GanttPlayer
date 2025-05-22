import { createSVG } from './svg_utils';
import date_utils from './date_utils';
import Arrow from './arrow';
import Bar from './bar';

export default class GanttRenderer {
    constructor(gantt) {
        this.gantt = gantt;
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
        const grid_width =
            this.gantt.dates.length * this.gantt.config.column_width;
        const grid_height = Math.max(
            this.gantt.config.header_height +
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
            y: 0,
            width: grid_width,
            height: grid_height,
            class: 'grid-background',
            append_to: this.gantt.$svg,
        });

        this.gantt.$svg.setAttribute('height', grid_height);
        this.gantt.$svg.setAttribute('width', '100%');
        this.gantt.grid_height = grid_height;
        if (this.gantt.options.container_height === 'auto') {
            this.gantt.$container.style.height = grid_height + 16 + 'px';
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
        this.gantt.$header = this.gantt.create_el({
            width: this.gantt.dates.length * this.gantt.config.column_width,
            classes: 'grid-header',
            append_to: this.gantt.$container,
        });

        this.gantt.$upper_header = this.gantt.create_el({
            classes: 'upper-header',
            append_to: this.gantt.$header,
        });
        this.gantt.$lower_header = this.gantt.create_el({
            classes: 'lower-header',
            append_to: this.gantt.$header,
        });
    }

    make_side_header() {
        this.gantt.$side_header = this.gantt.create_el({
            classes: 'side-header',
        });
        this.gantt.$upper_header.prepend(this.gantt.$side_header);

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
                this.gantt.change_view_mode($select.value, true);
            });
            this.gantt.$side_header.appendChild($select);
        }

        if (this.gantt.options.today_button) {
            let $today_button = document.createElement('button');
            $today_button.classList.add('today-button');
            $today_button.textContent = 'Today';
            $today_button.onclick = this.gantt.scroll_current.bind(this.gantt);
            this.gantt.$side_header.prepend($today_button);
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
            this.gantt.$side_header.prepend(player_reset_button);
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
            this.gantt.$side_header.prepend($player_button);
            this.gantt.$player_button = $player_button;
        }
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
        this.gantt.highlight_holidays();
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

        this.gantt.highlight_current();
        if (this.gantt.options.custom_marker) {
            if (
                !this.gantt.config.custom_marker_date ||
                isNaN(this.gantt.config.custom_marker_date)
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
            const diff = date_utils.diff(
                this.gantt.config.custom_marker_date,
                this.gantt.gantt_start,
                this.gantt.config.unit,
            );
            const left =
                (diff / this.gantt.config.step) *
                this.gantt.config.column_width;
            this.gantt.play_animated_highlight(
                left,
                this.gantt.config.custom_marker_date,
            );
            this.gantt.eventQueueManager.initializeEventQueue();
        }
    }

    make_dates() {
        this.get_dates_to_draw().forEach((date) => {
            if (date.lower_text) {
                let $lower_text = this.gantt.create_el({
                    left: date.x,
                    top: date.lower_y,
                    classes: 'lower-text date_' + sanitize(date.formatted_date),
                    append_to: this.gantt.$lower_header,
                });
                $lower_text.innerText = date.lower_text;
            }

            if (date.upper_text) {
                let $upper_text = this.gantt.create_el({
                    left: date.x,
                    top: date.upper_y,
                    classes: 'upper-text',
                    append_to: this.gantt.$upper_header,
                });
                $upper_text.innerText = date.upper_text;
            }
        });
        this.gantt.upperTexts = Array.from(
            this.gantt.$container.querySelectorAll('.upper-text'),
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
