export default class EventBinder {
    constructor(gantt) {
        this.gantt = gantt;
    }

    bindEvents() {
        this.bindGridClick();
        this.bindBarEvents();
        this.bindHolidayLabels();
    }

    bindGridClick() {
        $.on(
            this.gantt.$container,
            'click',
            '.grid-row, .grid-header, .ignored-bar, .holiday-highlight',
            () => {
                this.gantt.popupManager.hide();
                this.gantt.$container
                    .querySelectorAll('.bar-wrapper')
                    .forEach((el) => el.classList.remove('active'));
            },
        );
    }

    bindHolidayLabels() {
        const highlights =
            this.gantt.$container.querySelectorAll('.holiday-highlight');
        for (const h of highlights) {
            const label = this.gantt.$container.querySelector(
                `.label_${h.classList[1]}`,
            );
            if (!label) continue;
            let timeout;
            h.onmouseenter = (e) => {
                timeout = setTimeout(() => {
                    label.classList.add('show');
                    label.style.left = `${e.offsetX || e.layerX}px`;
                    label.style.top = `${e.offsetY || e.layerY}px`;
                }, 300);
            };
            h.onmouseleave = () => {
                clearTimeout(timeout);
                label.classList.remove('show');
            };
        }
    }

    bindBarEvents() {
        let isDragging = false;
        let isResizingLeft = false;
        let isResizingRight = false;
        let xOnStart = 0;
        let parentBarId = null;
        let bars = [];

        $.on(
            this.gantt.$svg,
            'mousedown',
            '.bar-wrapper, .handle',
            (e, element) => {
                const barWrapper = $.closest('.bar-wrapper', element);
                if (element.classList.contains('left')) {
                    isResizingLeft = true;
                    element.classList.add('visible');
                } else if (element.classList.contains('right')) {
                    isResizingRight = true;
                    element.classList.add('visible');
                } else {
                    isDragging = true;
                }

                this.gantt.popupManager.hide();
                xOnStart = e.offsetX || e.layerX;
                parentBarId = barWrapper.getAttribute('data-id');
                bars = (
                    this.gantt.options.move_dependencies
                        ? [
                              parentBarId,
                              ...this.getAllDependentTasks(parentBarId),
                          ]
                        : [parentBarId]
                ).map((id) => this.gantt.taskManager.getBar(id));

                bars.forEach((bar) => {
                    bar.$bar.ox = bar.$bar.getX();
                    bar.$bar.owidth = bar.$bar.getWidth();
                    bar.$bar.finaldx = 0;
                });
            },
        );

        $.on(this.gantt.$svg, 'mousemove', (e) => {
            if (!(isDragging || isResizingLeft || isResizingRight)) return;
            const dx = (e.offsetX || e.layerX) - xOnStart;

            bars.forEach((bar) => {
                bar.$bar.finaldx = this.gantt.getSnapPosition(dx, bar.$bar.ox);
                this.gantt.popupManager.hide();
                if (isResizingLeft && bar.task.id === parentBarId) {
                    bar.update_bar_position({
                        x: bar.$bar.ox + bar.$bar.finaldx,
                        width: bar.$bar.owidth - bar.$bar.finaldx,
                    });
                } else if (isResizingRight && bar.task.id === parentBarId) {
                    bar.update_bar_position({
                        width: bar.$bar.owidth + bar.$bar.finaldx,
                    });
                } else if (
                    isDragging &&
                    !this.gantt.options.readonly &&
                    !this.gantt.options.readonly_dates
                ) {
                    bar.update_bar_position({
                        x: bar.$bar.ox + bar.$bar.finaldx,
                    });
                }
            });
        });

        document.addEventListener('mouseup', () => {
            isDragging = isResizingLeft = isResizingRight = false;
            this.gantt.$container
                .querySelector('.visible')
                ?.classList.remove('visible');
            bars.forEach((bar) => {
                if (bar.$bar.finaldx) {
                    bar.date_changed();
                    bar.compute_progress();
                    bar.set_action_completed();
                }
            });
            bars = [];
        });
    }

    getAllDependentTasks(taskId) {
        const out = [];
        let toProcess = [taskId];
        while (toProcess.length) {
            const deps = toProcess.reduce(
                (acc, curr) =>
                    acc.concat(
                        this.gantt.taskManager.dependencyMap[curr] || [],
                    ),
                [],
            );
            out.push(...deps);
            toProcess = deps.filter((d) => !toProcess.includes(d));
        }
        return out.filter(Boolean);
    }
}
