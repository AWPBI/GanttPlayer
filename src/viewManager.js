import date_utils from './date_utils';
import { isViewMode } from './utils';

export default class ViewManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.currentViewMode = this.gantt.options.viewMode || 'Day';
    }

    change_view_mode(mode = this.currentViewMode, maintain_pos = false) {
        if (typeof mode === 'string') {
            console.log(
                'this.gantt.options.view_modes',
                this.gantt.options.view_modes,
            );
            mode = this.gantt.options.view_modes.find((d) => d.name === mode);
        }
        let old_pos, old_scroll_op;
        if (maintain_pos) {
            old_pos = this.gantt.$container.scrollLeft;
            old_scroll_op = this.gantt.options.scroll_to;
            this.gantt.options.scroll_to = null;
        }
        this.gantt.options.view_mode = mode.name;
        this.gantt.config.view_mode = mode;
        this.currentViewMode = mode;
        this.update_view_scale(mode);
        this.setup_dates(maintain_pos);
        this.gantt.render();
        if (maintain_pos) {
            this.gantt.$container.scrollLeft = old_pos;
            this.gantt.options.scroll_to = old_scroll_op;
        }
        this.gantt.trigger_event('view_change', [mode]);
    }

    update_view_scale(mode) {
        console.log('update_view_scale: mode=', mode.name, 'step=', mode.step);
        let { duration, scale } = date_utils.parse_duration(mode.step);
        this.gantt.config.step = duration;
        this.gantt.config.unit = scale;

        // Set view-specific base column width
        const base_column_widths = {
            Day: 38,
            Week: 140,
            Month: 120,
            Year: 200, // Larger for Year
        };
        const base_width = base_column_widths[mode.name] || 45;

        // Adjust column_width to fill viewport
        const viewport_width = this.gantt.$container.clientWidth || 800;
        const target_columns = 10; // Target 10 columns for all modes
        const min_column_width = viewport_width / target_columns;
        this.gantt.config.column_width = Math.max(base_width, min_column_width);

        this.gantt.$container.style.setProperty(
            '--gv-column-width',
            this.gantt.config.column_width + 'px',
        );
        this.gantt.config.header_height =
            this.gantt.options.lower_header_height +
            this.gantt.options.upper_header_height +
            10;
        console.log(
            'update_view_scale: column_width=',
            this.gantt.config.column_width,
            'step=',
            this.gantt.config.step,
            'unit=',
            this.gantt.config.unit,
        );
    }

    setup_dates(refresh = false) {
        this.setup_gantt_dates(refresh);
        this.setup_date_values();
    }

    setup_gantt_dates(refresh) {
        console.log(
            'setup_gantt_dates: view_mode=',
            this.gantt.options.view_mode,
            'refresh=',
            refresh,
        );
        let gantt_start, gantt_end;
        if (!this.gantt.tasks.length) {
            gantt_start = date_utils.today();
            gantt_end = date_utils.add(date_utils.today(), 1, 'year');
        } else {
            gantt_start = this.gantt.tasks[0]._start;
            gantt_end = this.gantt.tasks[0]._end;
            for (let task of this.gantt.tasks) {
                if (task._start < gantt_start) {
                    gantt_start = task._start;
                }
                if (task._end > gantt_end) {
                    gantt_end = task._end;
                }
            }
        }

        gantt_start = date_utils.start_of(gantt_start, this.gantt.config.unit);
        gantt_end = date_utils.start_of(gantt_end, this.gantt.config.unit);

        if (!refresh) {
            if (!this.gantt.options.infinite_padding) {
                if (typeof this.gantt.config.view_mode.padding === 'string') {
                    this.gantt.config.view_mode.padding = [
                        this.gantt.config.view_mode.padding,
                        this.gantt.config.view_mode.padding,
                    ];
                }

                let [padding_start, padding_end] =
                    this.gantt.config.view_mode.padding.map(
                        date_utils.parse_duration,
                    ) || [
                        { duration: 1, scale: this.gantt.config.unit },
                        { duration: 1, scale: this.gantt.config.unit },
                    ];
                this.gantt.gantt_start = date_utils.add(
                    gantt_start,
                    -padding_start.duration,
                    padding_start.scale,
                );
                this.gantt.gantt_end = date_utils.add(
                    gantt_end,
                    padding_end.duration,
                    padding_end.scale,
                );

                // Ensure enough columns to fill viewport
                const viewport_width = this.gantt.$container.clientWidth || 800;
                const target_columns = 10; // Target 10 columns
                const current_columns = Math.ceil(
                    date_utils.diff(
                        this.gantt.gantt_end,
                        this.gantt.gantt_start,
                        this.gantt.config.unit,
                    ) / this.gantt.config.step,
                );
                const columns_needed = target_columns - current_columns;
                if (columns_needed > 0) {
                    this.gantt.gantt_end = date_utils.add(
                        this.gantt.gantt_end,
                        columns_needed * this.gantt.config.step,
                        this.gantt.config.unit,
                    );
                }
            } else {
                const extend_units = this.gantt.config.extend_by_units * 3;
                this.gantt.gantt_start = date_utils.add(
                    gantt_start,
                    -extend_units,
                    this.gantt.config.unit,
                );
                this.gantt.gantt_end = date_utils.add(
                    gantt_end,
                    extend_units,
                    this.gantt.config.unit,
                );
            }
        }
        this.gantt.config.date_format =
            this.gantt.config.view_mode.date_format ||
            this.gantt.options.date_format;
        this.gantt.gantt_start.setHours(0, 0, 0, 0);
        this.gantt.gantt_end.setHours(0, 0, 0, 0);
        console.log(
            'setup_gantt_dates: gantt_start=',
            this.gantt.gantt_start,
            'gantt_end=',
            this.gantt.gantt_end,
        );
    }

    setup_date_values() {
        let cur_date = new Date(this.gantt.gantt_start);
        this.gantt.dates = [cur_date];

        while (cur_date < this.gantt.gantt_end) {
            cur_date = date_utils.add(
                cur_date,
                this.gantt.config.step,
                this.gantt.config.unit,
            );
            this.gantt.dates.push(new Date(cur_date));
        }
    }
}
