import date_utils from './date_utils';
import { isViewMode } from './utils';

export default class ViewManager {
    constructor(gantt) {
        this.gantt = gantt;
    }

    change_view_mode(
        mode = this.gantt.options.view_mode,
        maintain_pos = false,
    ) {
        if (typeof mode === 'string') {
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
        let { duration, scale } = date_utils.parse_duration(mode.step);
        this.gantt.config.step = duration;
        this.gantt.config.unit = scale;
        this.gantt.config.column_width =
            this.gantt.options.column_width || mode.column_width || 45;
        this.gantt.$container.style.setProperty(
            '--gv-column-width',
            this.gantt.config.column_width + 'px',
        );
        this.gantt.config.header_height =
            this.gantt.options.lower_header_height +
            this.gantt.options.upper_header_height +
            10;
    }

    setup_dates(refresh = false) {
        this.setup_gantt_dates(refresh);
        this.setup_date_values();
    }

    setup_gantt_dates(refresh) {
        let gantt_start, gantt_end;
        if (!this.gantt.tasks.length) {
            gantt_start = new Date();
            gantt_end = new Date();
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
                    );
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
            } else {
                this.gantt.gantt_start = date_utils.add(
                    gantt_start,
                    -this.gantt.config.extend_by_units * 3,
                    this.gantt.config.unit,
                );
                this.gantt.gantt_end = date_utils.add(
                    gantt_end,
                    this.gantt.config.extend_by_units * 3,
                    this.gantt.config.unit,
                );
            }
        }
        this.gantt.config.date_format =
            this.gantt.config.view_mode.date_format ||
            this.gantt.options.date_format;
        this.gantt.gantt_start.setHours(0, 0, 0, 0);
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
