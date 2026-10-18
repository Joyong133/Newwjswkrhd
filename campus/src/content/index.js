import { YEAR_COLORS } from '../core/util.js';
import year1 from './year1.js';
import year2 from './year2.js';
import year3 from './year3.js';
import year4 from './year4.js';

export const CURRICULUM = [year1, year2, year3, year4].map((y, i) => ({ ...y, color: YEAR_COLORS[i] }));

export function findSubject(id) {
  for (const y of CURRICULUM) {
    const s = y.subjects.find((x) => x.id === id);
    if (s) return { year: y, subject: s };
  }
  return null;
}
