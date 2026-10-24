/** Money is always integer paise (decision D1). */
export const rupeesToPaise = (rupees: number): number => {
  if (!Number.isFinite(rupees) || rupees < 0) throw new Error('Invalid amount');
  return Math.round(rupees * 100);
};
export const paiseToRupees = (paise: number): number => paise / 100;
export const formatINR = (paise: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
