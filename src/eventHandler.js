import { $ } from './svg_utils';
import date_utils from './date_utils';

export default class EventHandler {
    constructor(gantt) {
        this.gantt = gantt;
    }

    bind_events() {
        this.bind_grid_click();
        this.bind_holiday_labels();
        this.bind_bar_progress();
    }

    bind_grid_click() {
        $.on(
            this.gantt.$container,
            'click',
            '.grid-row, .grid-header, .ignored-bar, .holiday-highlight',
            () => {
                this.gantt.unselect_all();
                this.gantt.hide_popup();
            },
        );
    }

    bind_holiday_labels() {
        const $highlights =
            this.gantt.$container.querySelectorAll('.holiday-highlight');
        for (let h of $highlights) {
            const label = this.gantt.$container.querySelector(
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

            h.onmouseleave = () => {
                clearTimeout(timeout);
                label.classList.remove('show');
            };
        }
    }

    bind_bar_progress() {
        let x_on_start = 0;
        let y_on_start = 0;
        let is_resizing = false;
        let bar = null;
        let $bar_progress = null;
        let $bar = null;

        $.on(this.gantt.$svg, 'mousedown', '.handle.progress', (e, handle) => {
            is_resizing = true;
            x_on_start = e.offsetX || e.layerX;
            y_on_start = e.offsetY || e.layerY;

            const $bar_wrapper = $.closest('.bar-wrapper', handle);
            const id = $bar_wrapper.getAttribute('data-id');
            bar = this.gantt.get_bar(id);

            $bar_progress = bar.$bar_progress;
            $bar = bar.$bar;

            $bar_progress.finaldx = 0;
            $bar_progress.owidth = $bar_progress.getWidth();
            $bar_progress.min_dx = -$bar_progress.owidth;
            $bar_progress.max_dx = $bar.getWidth() - $bar_progress.getWidth();
        });

        const range_positions = this.gantt.config.ignored_positions.map((d) => [
            d,
            d + this.gantt.config.column_width,
        ]);

        $.on(this.gantt.$svg, 'mousemove', (e) => {
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
            $.attr(bar.$handle_progress, 'cx', $bar_progress.getEndX());

            $bar_progress.finaldx = dx;
        });

        $.on(this.gantt.$svg, 'mouseup', () => {
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

    get_snap_position(dx, ox) {
        let unit_length = 1;
        const default_snap =
            this.gantt.options.snap_at ||
            this.gantt.config.view_mode.snap_at ||
            '1d';

        if (default_snap !== 'unit') {
            const { duration, scale } = date_utils.parse_duration(default_snap);
            unit_length =
                date_utils.convert_scales(
                    this.gantt.config.view_mode.step,
                    scale,
                ) / duration;
        }

        const rem = dx % (this.gantt.config.column_width / unit_length);

        let final_dx =
            dx -
            rem +
            (rem < (this.gantt.config.column_width / unit_length) * 0.5
                ? 0
                : this.gantt.config.column_width / unit_length);
        let final_pos = ox + final_dx;

        const drn = final_dx > 0 ? 1 : -1;
        let ignored_regions = this.get_ignored_region(final_pos, drn);
        while (ignored_regions.length) {
            final_pos += this.gantt.config.column_width * drn;
            ignored_regions = this.get_ignored_region(final_pos, drn);
            if (!ignored_regions.length) {
                final_pos -= this.gantt.config.column_width * drn;
            }
        }
        return final_pos - ox;
    }

    get_ignored_region(pos, drn = 1) {
        if (drn === 1) {
            return this.gantt.config.ignored_positions.filter((val) => {
                return pos > val && pos <= val + this.gantt.config.column_width;
            });
        } else {
            return this.gantt.config.ignored_positions.filter(
                (val) =>
                    pos >= val && pos < val + this.gantt.config.column_width,
            );
        }
    }
}
