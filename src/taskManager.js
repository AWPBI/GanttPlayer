import Bar from './bar';

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
                if (!task.start || (!task.end && !task.duration)) return null;
                task._start = date_utils.parse(task.start);
                task._end = task.end
                    ? date_utils.parse(task.end)
                    : task.duration
                      ? date_utils.add(
                            task._start,
                            ...date_utils.parse_duration(task.duration),
                        )
                      : task._start;
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
        this.bars = this.tasks.map((task) => {
            const bar = new Bar(this.gantt, task);
            this.gantt.layers.bar.appendChild(bar.group);
            return bar;
        });
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
        Object.assign(task, newDetails);
        bar.refresh();
    }

    refresh(tasks) {
        this.setupTasks(tasks);
        this.gantt.render();
    }
}
