import date_utils from './date_utils';
import Bar from './bar';
import { generate_id } from './utils';

export default class TaskManager {
    constructor(gantt) {
        this.gantt = gantt;
        this.tasks = [];
        this.bars = [];
        this.dependencyMap = {};
    }

    setupTasks(tasks) {
        this.tasks = tasks
            .map((task, i) => {
                // Validate task object and required fields
                if (!task || typeof task !== 'object') {
                    console.error(
                        `Task at index ${i} is invalid: ${JSON.stringify(task)}`,
                    );
                    return null;
                }
                if (!task.start || !task.name) {
                    console.error(
                        `Task "${task.id || i}" missing start or name: ${JSON.stringify(task)}`,
                    );
                    return null;
                }

                // Parse dates using date_utils.parse
                const start = date_utils.parse(task.start);
                if (!start || isNaN(start.getTime())) {
                    console.error(
                        `Task "${task.id || i}" has invalid start date: ${task.start}`,
                    );
                    return null;
                }

                let end;
                if (task.end) {
                    end = date_utils.parse(task.end);
                    if (!end || isNaN(end.getTime())) {
                        console.error(
                            `Task "${task.id || i}" has invalid end date: ${task.end}`,
                        );
                        return null;
                    }
                } else if (task.duration) {
                    const { duration, scale } = date_utils.parse_duration(
                        task.duration,
                    );
                    end = date_utils.add(start, duration, scale);
                    if (!end || isNaN(end.getTime())) {
                        console.error(
                            `Task "${task.id || i}" has invalid duration: ${task.duration}`,
                        );
                        return null;
                    }
                } else {
                    // Fallback: set end to 1 day after start
                    end = date_utils.add(start, 1, 'day');
                    console.warn(
                        `Task "${task.id || i}" missing end date; defaulting to 1 day after start`,
                    );
                }

                // Validate date range
                if (end < start) {
                    console.error(
                        `Task "${task.id || i}" has end date before start date: start=${start}, end=${end}`,
                    );
                    return null;
                }

                // Cap duration to prevent overflow
                if (date_utils.diff(end, start, 'year') > 10) {
                    console.error(
                        `Task "${task.id || i}" duration exceeds 10 years`,
                    );
                    return null;
                }

                // Format dates as strings for Bar class compatibility
                task._start = start;
                task._end = end;
                task.start = date_utils.format(
                    start,
                    'YYYY-MM-DD',
                    this.gantt.options.language,
                );
                task.end = date_utils.format(
                    end,
                    'YYYY-MM-DD',
                    this.gantt.options.language,
                );
                task._index = i;
                task.id =
                    task.id?.toString().replaceAll(' ', '_') ||
                    generate_id(task);
                task.dependencies =
                    typeof task.dependencies === 'string'
                        ? task.dependencies
                              .split(',')
                              .map((d) => d.trim().replaceAll(' ', '_'))
                        : task.dependencies || [];

                return task;
            })
            .filter(Boolean);

        if (!this.tasks.length) {
            console.warn('No valid tasks provided; Gantt chart may be empty');
        }

        this.setupDependencies();
        this.makeBars();
    }

    setupDependencies() {
        this.dependencyMap = {};
        for (const task of this.tasks) {
            for (const dep of task.dependencies) {
                this.dependencyMap[dep] = this.dependencyMap[dep] || [];
                this.dependencyMap[dep].push(task.id);
            }
        }
    }

    makeBars() {
        this.bars = this.tasks
            .map((task) => {
                try {
                    const bar = new Bar(this.gantt, task);
                    this.gantt.layers.bar.appendChild(bar.group);
                    return bar;
                } catch (error) {
                    console.error(
                        `Failed to create bar for task "${task.id}":`,
                        error,
                    );
                    return null;
                }
            })
            .filter(Boolean);
    }

    getTask(id) {
        return this.tasks.find((task) => task.id === id);
    }

    getBar(id) {
        return this.bars.find((bar) => bar.task.id === id);
    }

    updateTask(id, newDetails) {
        const task = this.getTask(id);
        const bar = this.getBar(id);
        if (!task || !bar) {
            console.error(`Task or bar with id "${id}" not found`);
            return;
        }
        Object.assign(task, newDetails);
        bar.refresh();
    }

    refresh(tasks) {
        this.setupTasks(tasks);
        this.gantt.render();
    }
}
