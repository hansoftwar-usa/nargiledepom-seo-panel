import { api } from './api.js';

export const store = {
  data: { backlinks: [], keywords: [], tasks: [], notes: [] },
  listeners: new Set(),

  setData(data) {
    this.data = data || { backlinks: [], keywords: [], tasks: [], notes: [] };
    for (const fn of this.listeners) fn(this.data);
  },

  async refresh() {
    const data = await api.get('/api/data');
    this.setData(data);
    return data;
  },

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};
