export function actorName(task, kind, users) {
  const id = kind === 'creator' ? task.creator_id : task.completed_by;
  const snapshot = kind === 'creator' ? task.creator_name : task.completed_by_name;
  return snapshot || users.find((user) => user.id === id)?.name || (id ? 'Former team member' : 'Not recorded');
}

function time(value) { return value ? new Date(value).getTime() || 0 : 0; }
function day(value, next = false) {
  if (!value) return null;
  const [year, month, date] = value.split('-').map(Number);
  return new Date(year, month - 1, date + (next ? 1 : 0)).getTime();
}

export function completedTaskReport(tasks, users, filters) {
  const start = day(filters.from);
  const end = day(filters.to, true);
  const query = (filters.search || '').trim().toLowerCase();
  const name = (id) => users.find((user) => user.id === id)?.name || 'Unassigned';
  return tasks.filter((task) => {
    if (task.status !== 'completed') return false;
    if (filters.assignee !== 'all' && task.assignee_id !== filters.assignee) return false;
    if (filters.creator !== 'all' && task.creator_id !== filters.creator) return false;
    if (filters.completer !== 'all' && task.completed_by !== filters.completer) return false;
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (start !== null || end !== null) {
      if (!task.completed_at) return false;
      const completed = time(task.completed_at);
      if (start !== null && completed < start) return false;
      if (end !== null && completed >= end) return false;
    }
    const text = [task.id, task.title, task.detail, task.result_note, task.creator_id,
      task.completed_by, name(task.assignee_id), actorName(task, 'creator', users),
      actorName(task, 'completer', users)].join(' ').toLowerCase();
    return !query || text.includes(query);
  }).sort((a, b) => {
    const dateDifference = time(a.completed_at) - time(b.completed_at);
    let comparison = 0;
    switch (filters.sort) {
      case 'oldest': comparison = dateDifference; break;
      case 'created': comparison = time(b.created_at) - time(a.created_at); break;
      case 'title': comparison = String(a.title).localeCompare(String(b.title)); break;
      case 'assignee': comparison = name(a.assignee_id).localeCompare(name(b.assignee_id)); break;
      case 'creator': comparison = actorName(a, 'creator', users).localeCompare(actorName(b, 'creator', users)); break;
      case 'completer': comparison = actorName(a, 'completer', users).localeCompare(actorName(b, 'completer', users)); break;
      case 'priority': comparison = ({extreme:3,high:2,normal:1}[b.priority] || 0) - ({extreme:3,high:2,normal:1}[a.priority] || 0); break;
      default: comparison = -dateDifference;
    }
    return comparison || -dateDifference || String(a.id).localeCompare(String(b.id));
  });
}

// Supabase normally limits responses; reports must include later pages too.
export async function fetchAllRows(client, table, orderColumn) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select('*')
      .order(orderColumn, { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
