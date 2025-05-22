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
        console.log('Raw tasks:', tasks); // Debug log
        this.tasks = tasks
            .map((task, i) => {
                // Validate task object
                if (!task || typeof task !== 'object') {
                    console.error(
                        `Task at index ${i} is invalid: ${JSON.stringify(task)}`,
                    );
                    return null;
                }

                // Check required fields
                if (!task.start) {
                    console.error(
                        `Task "${task.id || i}" doesn't have a start date`,
                    );
                    return null;
                }
                if (!task.end && task.duration === undefined) {
                    console.error(
                        `Task "${task.id || i}" doesn't have an end date or duration`,
                    );
                    return null;
                }

                // Set default name if missing
                if (!task.name || typeof task.name !== 'string') {
                    console.warn(
                        `Task "${task.id || i}" missing name, using default`,
                    );
                    task.name = `Task ${i + 1}`;
                }

                // Parse start date
                task._start = date_utils.parse(task.start);
                if (!task._start || isNaN(task._start.getTime())) {
                    console.warn(
                        `Task "${task.id || i}" has invalid start date: ${task.start}`,
                    );
                    return null;
                }

                // Handle end date or duration
                if (task.end === undefined && task.duration !== undefined) {
                    task._end = new Date(task._start);
                    let durations = task.duration.split(' ');
                    durations.forEach((tmpDuration) => {
                        let { duration, scale } =
                            date_utils.parse_duration(tmpDuration);
                        if (isNaN(duration) || !scale) {
                            console.error(
                                `Task "${task.id || i}" has invalid duration: ${tmpDuration}`,
                            );
                            return null;
                        }
                        task._end = date_utils.add(task._end, duration, scale);
                    });
                    task.end = task._end.toString();
                } else if (task.end) {
                    task._end = date_utils.parse(task.end);
                }

                // Validate end date
                if (!task._end || isNaN(task._end.getTime())) {
                    console.warn(
                        `Task "${task.id || i}" has invalid end date: ${task.end}`,
                    );
                    return null;
                }

                // Validate date range
                let diff = date_utils.diff(task._end, task._start, 'year');
                if (diff < 0) {
                    console.error(
                        `Start of task can't be after end of task: in task "${task.id || i}"`,
                    );
                    return null;
                }
                if (diff > 10) {
                    console.error(
                        `The duration of task "${task.id || i}" is too long (above ten years)`,
                    );
                    return null;
                }

                // Adjust end date if at midnight
                const task_end_values = date_utils.get_date_values(task._end);
                if (task_end_values.slice(3).every((d) => d === 0)) {
                    task._end = date_utils.add(task._end, 24, 'hour');
                    task.end = task._end.toString();
                }

                // Set index
                task._index = i;

                // Handle dependencies
                if (
                    typeof task.dependencies === 'string' ||
                    !task.dependencies
                ) {
                    let deps = [];
                    if (task.dependencies) {
                        deps = task.dependencies
                            .split(',')
                            .map((d) => d.trim().replaceAll(' ', '_'))
                            .filter((d) => d);
                    }
                    task.dependencies = deps;
                }

                // Set ID
                if (!task.id) {
                    task.id = generate_id(task);
                } else if (typeof task.id === 'string') {
                    task.id = task.id.replaceAll(' ', '_');
                } else {
                    task.id = `${task.id}`;
                }

                return task;
            })
            .filter((t) => t !== null && t !== undefined); // Strict filtering

        console.log('Processed tasks:', this.tasks); // Debug log
        if (!this.tasks.length) {
            console.warn('No valid tasks provided; Gantt chart may be empty');
        }

        this.setupDependencies();
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
