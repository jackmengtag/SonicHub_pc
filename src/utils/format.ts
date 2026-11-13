export const COVERS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const;

export function formatDuration(seconds: number | string | null | undefined) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function formatCount(value: number | string | null | undefined) {
  const count = Number(value) || 0;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function initial(name: string | null | undefined) {
  return String(name || '?').trim().slice(0, 1) || '?';
}

export function coverClass(value: string | null | undefined, seed = '') {
  if (COVERS.includes(value as (typeof COVERS)[number])) return value;
  const index = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % COVERS.length;
  return COVERS[index];
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} 天前`;
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

export function clockTime(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function workStatus(status: string | undefined) {
  const map: Record<string, { label: string; tone: string }> = {
    published: { label: '已发布', tone: 'mint' },
    pending_review: { label: '审核中', tone: 'gold' },
    rejected: { label: '未通过', tone: 'red' },
    draft: { label: '草稿', tone: 'gray' },
  };
  return map[status || ''] || { label: status || '未知', tone: 'gray' };
}
