export function generate_id(task) {
    return task.name + '_' + Math.random().toString(36).slice(2, 12);
}

export function sanitize(s) {
    return s.replaceAll(' ', '_').replaceAll(':', '_').replaceAll('.', '_');
}
