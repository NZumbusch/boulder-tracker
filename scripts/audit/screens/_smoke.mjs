export const screens = [
  { id: 'home', area: '_smoke', setup: async (c) => c.nav('home') },
  { id: 'analytics-overview', area: '_smoke', setup: async (c) => { await c.nav('analytics'); await c.click('Overview'); } },
];
