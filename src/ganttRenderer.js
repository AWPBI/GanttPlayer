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
        const grid_width =
            this.gantt.dates.length * this.gantt.config.column_width;
        this.gantt.config.header_height = 90;
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
        this.gantt.$header = create_el({
            width: this.gantt.dates.length * this.gantt.config.column_width,
            classes: 'grid-header',
            append_to: this.gantt.$container,
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
        // Check if side-header exists in DOM
        const existingHeader =
            this.gantt.$side_header &&
            document.body.contains(this.gantt.$side_header);
        if (existingHeader) {
            console.log(
                'Reusing existing side-header:',
                this.gantt.$side_header,
            );
            this.initializeDropdown();
            return;
        }

        // Create or recreate side-header
        this.gantt.$side_header = create_el({
            classes: 'side-header',
            append_to: this.gantt.$upper_header,
        });
        console.log('Side header created:', this.gantt.$side_header);

        // Add buttons first
        if (this.gantt.options.today_button) {
            const $today_button = create_el({
                tag: 'button',
                classes: 'today-button',
                append_to: this.gantt.$side_header,
            });
            $today_button.textContent = 'Today';
            $today_button.onclick = this.gantt.scroll_current.bind(this.gantt);
            this.gantt.$today_button = $today_button;
            console.log('Today button created:', $today_button);
        }

        if (this.gantt.options.player_button) {
            const player_reset_button = create_el({
                tag: 'button',
                classes: 'player-reset-button',
                append_to: this.gantt.$side_header,
            });
            if (this.gantt.options.player_use_fa) {
                player_reset_button.classList.add('fas', 'fa-redo');
            } else {
                player_reset_button.textContent = 'Reset';
            }
            player_reset_button.onclick = this.gantt.reset_play.bind(
                this.gantt,
            );
            this.gantt.$player_reset_button = player_reset_button;
            console.log('Player reset button created:', player_reset_button);
        }

        if (this.gantt.options.player_button) {
            let $player_button = create_el({
                tag: 'button',
                classes: 'player-button',
                append_to: this.gantt.$side_header,
            });
            if (this.gantt.options.player_use_fa) {
                $player_button.classList.add(
                    'fas',
                    this.gantt.options.player_state ? 'fa-pause' : 'fa-play',
                );
            } else {
                $player_button.textContent = 'Play';
            }
            $player_button.onclick = this.gantt.toggle_play.bind(this.gantt);
            $player_button = $player_button;
            console.log('Player button created:', $player_button);
        }

        // Initialize dropdown last
        this.initializeDropdown();
    }

    initializeDropdown() {
        if (!this.gantt.options.view_mode_select) return;

        // Log view_modes
        console.log('View modes:', this.gantt.options.view_modes);

        // Create or update dropdown trigger directly in side-header
        let $dropdownTrigger =
            this.gantt.$side_header.querySelector('.dropdown-trigger');
        if (!$dropdownTrigger) {
            $dropdownTrigger = create_el({
                tag: 'button',
                classes: 'dropdown-trigger',
                append_to: this.gantt.$side_header,
                type: 'button',
            });
            console.log('Dropdown trigger created:', $dropdownTrigger);
        }
        $dropdownTrigger.textContent =
            this.gantt.config.view_mode?.name || 'Mode';

        // Check for existing dropdown menu
        let $dropdownMenu = document.querySelector(
            '.dropdown-menu[data-id="gantt-viewmode-menu"]',
        );
        if ($dropdownMenu) {
            console.log('Reusing existing dropdown menu:', $dropdownMenu);
            $dropdownMenu.innerHTML = ''; // Clear existing options
            $dropdownMenu.style.display = 'none'; // Reset inline style
        } else {
            $dropdownMenu = create_el({
                classes: 'dropdown-menu',
                append_to: document.body,
            });
            $dropdownMenu.setAttribute('data-id', 'gantt-viewmode-menu');
            $dropdownMenu.style.display = 'none';
            console.log('Dropdown menu created:', $dropdownMenu);
        }
        this.gantt.$dropdownMenu = $dropdownMenu;

        // Log computed display style
        console.log(
            'Dropdown menu display:',
            getComputedStyle($dropdownMenu).display,
        );

        // Clean up duplicate menus
        const duplicateMenus = document.querySelectorAll(
            '.dropdown-menu:not([data-id="gantt-viewmode-menu"])',
        );
        duplicateMenus.forEach((menu) => {
            console.log('Removing duplicate menu:', menu);
            menu.remove();
        });
        console.log(
            'Dropdown menu count:',
            document.querySelectorAll('.dropdown-menu').length,
        );

        // Create options list
        const $optionsList = create_el({
            tag: 'ul',
            classes: '',
            append_to: $dropdownMenu,
        });

        // Add default "Mode" option
        const $defaultOption = create_el({
            tag: 'li',
            classes: 'dropdown-option disabled',
            append_to: $optionsList,
        });
        $defaultOption.textContent = 'Mode';
        $defaultOption.dataset.value = '';

        // Populate view mode options
        try {
            if (
                this.gantt.options.view_modes &&
                Symbol.iterator in Object(this.gantt.options.view_modes)
            ) {
                for (const mode of this.gantt.options.view_modes) {
                    if (!mode || !mode.name) {
                        console.warn('Invalid view mode:', mode);
                        continue;
                    }
                    const $option = create_el({
                        tag: 'li',
                        classes: 'dropdown-option',
                        append_to: $optionsList,
                    });
                    $option.textContent = mode.name;
                    $option.dataset.value = mode.name;
                    if (mode.name === this.gantt.config.view_mode?.name) {
                        $option.classList.add('selected');
                        $dropdownTrigger.textContent = mode.name;
                    }
                    $option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if ($option.dataset.value) {
                            console.log(
                                'Selected view mode:',
                                $option.dataset.value,
                            );
                            this.gantt.viewManager.change_view_mode(
                                $option.dataset.value,
                                true,
                            );
                            this.gantt.reset_play();
                            this.gantt.scrollManager.set_scroll_position(
                                'start',
                            );
                            $dropdownTrigger.textContent = $option.textContent;
                            $optionsList
                                .querySelectorAll('.dropdown-option')
                                .forEach((opt) =>
                                    opt.classList.remove('selected'),
                                );
                            $option.classList.add('selected');
                            $dropdownMenu.classList.remove('show');
                            $dropdownMenu.style.display = 'none';
                            console.log(
                                'Dropdown closed after option select, display:',
                                getComputedStyle($dropdownMenu).display,
                            );
                            // Check side-header
                            if (
                                !document.body.contains(this.gantt.$side_header)
                            ) {
                                console.log(
                                    'Side header missing, rebuilding...',
                                );
                                this.gantt.$side_header = null;
                                this.make_side_header();
                            }
                        }
                    });
                }
            } else {
                console.error(
                    'view_modes is not iterable or undefined:',
                    this.gantt.options.view_modes,
                );
            }
        } catch (error) {
            console.error('Error populating dropdown:', error);
        }

        // Log populated options
        console.log(
            'Dropdown options:',
            Array.from($optionsList.querySelectorAll('.dropdown-option')).map(
                (opt) => opt.textContent,
            ),
        );

        // Toggle dropdown menu
        const toggleDropdown = (e) => {
            e.stopPropagation();
            const isOpen = $dropdownMenu.classList.contains('show');
            $dropdownMenu.classList.toggle('show', !isOpen);
            $dropdownMenu.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) {
                const rect = $dropdownTrigger.getBoundingClientRect();
                $dropdownMenu.style.position = 'fixed';
                $dropdownMenu.style.top = `${rect.bottom + window.pageYOffset}px`;
                $dropdownMenu.style.left = `${rect.left + window.pageXOffset}px`;
                $dropdownMenu.style.minWidth = `${rect.width}px`;
                console.log('Trigger rect:', rect);
            }
            console.log(
                'Dropdown toggled:',
                $dropdownMenu.classList.contains('show'),
                'display:',
                getComputedStyle($dropdownMenu).display,
            );
        };
        if (this.gantt.dropdownToggleHandler) {
            $dropdownTrigger.removeEventListener(
                'click',
                this.gantt.dropdownToggleHandler,
            );
        }
        this.gantt.dropdownToggleHandler = toggleDropdown;
        $dropdownTrigger.addEventListener('click', toggleDropdown);

        // Close dropdown on outside click
        const closeDropdown = (e) => {
            if (
                !$dropdownTrigger.contains(e.target) &&
                !$dropdownMenu.contains(e.target)
            ) {
                $dropdownMenu.classList.remove('show');
                $dropdownMenu.style.display = 'none';
                console.log(
                    'Dropdown closed via outside click, display:',
                    getComputedStyle($dropdownMenu).display,
                );
            }
        };
        if (this.gantt.dropdownCloseHandler) {
            document.removeEventListener(
                'mousedown',
                this.gantt.dropdownCloseHandler,
                { capture: true },
            );
        }
        this.gantt.dropdownCloseHandler = closeDropdown;
        document.addEventListener('mousedown', closeDropdown, {
            capture: true,
        });
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

        // this.highlight_current();
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
            const diff = date_utils.diff(
                this.gantt.config.custom_marker_date,
                this.gantt.gantt_start,
                this.gantt.config.unit,
            );
            const left =
                (diff / this.gantt.config.step) *
                this.gantt.config.column_width;
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

        const diff_in_units = date_utils.diff(
            dateObj,
            this.gantt.gantt_start,
            this.gantt.config.unit,
        );

        const left =
            (diff_in_units / this.gantt.config.step) *
            this.gantt.config.column_width;

        this.gantt.$current_highlight = create_el({
            top: this.gantt.config.header_height,
            left,
            height: this.gantt.grid_height - this.gantt.config.header_height,
            classes: 'current-highlight',
            append_to: this.gantt.$container,
        });
        this.gantt.$current_ball_highlight = create_el({
            top: this.gantt.config.header_height - 6,
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

        let gridHeight = this.gantt.grid_height;
        if (!gridHeight) {
            gridHeight = Math.max(
                this.gantt.config.header_height +
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

        if (!this.gantt.$animated_highlight) {
            this.gantt.$animated_highlight = create_el({
                top: this.gantt.config.header_height, // Updated to new header height
                left: adjustedLeft,
                width: 2,
                height: gridHeight - this.gantt.config.header_height,
                classes: 'animated-highlight',
                append_to: this.gantt.$container,
                style: 'background: var(--g-custom-highlight); z-index: 999;',
            });
        } else {
            this.gantt.$animated_highlight.style.left = `${adjustedLeft}px`;
            this.gantt.$animated_highlight.style.height = `${
                gridHeight - this.gantt.config.header_height
            }px`;
            this.gantt.$animated_highlight.offsetHeight;
        }

        if (!this.gantt.$animated_ball_highlight) {
            this.gantt.$animated_ball_highlight = create_el({
                top: this.gantt.config.header_height - 6, // Adjust ball position
                left: adjustedLeft - 2,
                width: 6,
                height: 6,
                classes: 'animated-ball-highlight',
                append_to: this.gantt.$header,
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
        this.get_dates_to_draw().forEach((date) => {
            if (date.lower_text) {
                let $lower_text = create_el({
                    left: date.x,
                    top: date.lower_y,
                    classes: 'lower-text date_' + sanitize(date.formatted_date),
                    append_to: this.gantt.$lower_header,
                });
                $lower_text.innerText = date.lower_text;
            }

            if (date.upper_text) {
                let $upper_text = create_el({
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
            upper_y: 25,
            lower_y: this.gantt.config.header_height - 15,
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
