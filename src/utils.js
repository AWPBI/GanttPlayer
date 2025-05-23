export function generate_id(task) {
    return task.name + '_' + Math.random().toString(36).slice(2, 12);
}

export function sanitize(s) {
    return s.replaceAll(' ', '_').replaceAll(':', '_').replaceAll('.', '_');
}

export function create_el({
    left,
    top,
    width,
    height,
    id,
    classes,
    append_to,
    type,
    style,
}) {
    let $el = document.createElement(type || 'div');
    for (let cls of classes.split(' ')) {
        if (cls) $el.classList.add(cls);
    }
    if (top !== undefined) $el.style.top = top + 'px';
    if (left !== undefined) $el.style.left = left + 'px';
    if (id) $el.id = id;
    if (width) $el.style.width = width + 'px';
    if (height) $el.style.height = height + 'px';
    if (style) $el.style.cssText = style;
    if (append_to) append_to.appendChild($el);
    return $el;
}

export function isViewMode(view_mode, modes) {
    if (typeof modes === 'string') {
        return view_mode === modes;
    }
    if (Array.isArray(modes)) {
        return modes.includes(view_mode);
    }
    return view_mode === modes.name;
}

export function getOldestStartingDate(tasks) {
    if (!tasks.length) return new Date();
    return tasks
        .map((task) => task._start)
        .reduce((prev_date, cur_date) =>
            cur_date <= prev_date ? cur_date : prev_date,
        );
}
