/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export const toMinutes = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };
